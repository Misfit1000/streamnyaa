-- Apply after account-sync.sql. No account is cut over until its desktop confirms
-- a durable local import of ALL surviving legacy rows (including tombstones).
begin;
create table if not exists public.user_history_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 migrated boolean not null default false, revision bigint not null default 0
);
create table if not exists public.user_anime_tracking (
 user_id uuid not null references auth.users(id) on delete cascade,
 identity text not null, metadata jsonb not null default '{}'::jsonb,
 explicit_status text, markers jsonb not null default '{}'::jsonb,
 last_played bigint not null default 0, revision bigint not null default 0,
 resume_cleared_at bigint not null default 0,
 primary key(user_id,identity)
);
create table if not exists public.user_recent_resumes (
 user_id uuid not null references auth.users(id) on delete cascade,
 identity text not null, payload jsonb not null, last_played bigint not null,
 primary key(user_id,identity)
);
create table if not exists public.user_history_devices (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id text not null,last_sequence bigint not null default 0,
 primary key(user_id,device_id)
);
create table if not exists public.user_history_aliases (
 user_id uuid not null references auth.users(id) on delete cascade,
 alias text not null,identity text not null,primary key(user_id,alias)
);
create index if not exists anime_tracking_revision on public.user_anime_tracking(user_id,revision);
create index if not exists recent_resume_recency on public.user_recent_resumes(user_id,last_played desc,identity);
alter table public.user_history_state enable row level security;
alter table public.user_anime_tracking enable row level security;
alter table public.user_recent_resumes enable row level security;
alter table public.user_history_devices enable row level security;
alter table public.user_history_aliases enable row level security;
revoke all on public.user_history_state,public.user_anime_tracking,public.user_recent_resumes,public.user_history_devices from anon,authenticated;
revoke all on public.user_history_aliases from anon,authenticated;

create or replace function public.history_sync_v3(p_request jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 uid uuid:=auth.uid(); action text:=coalesce(p_request->>'action','read');
 op jsonb; oldrow record; t public.user_anime_tracking; ident text; ep text;
 k text; from_id text; at_ms bigint; played bigint; ep_epoch bigint; old_epoch bigint;
 combined_markers jsonb; new_metadata jsonb; current_marker jsonb; seq bigint; through bigint:=0;
 device text:=p_request->>'deviceId'; rev bigint; cnt bigint; migrated_now boolean; legacy_fingerprint text;
 cursor_value bigint:=coalesce((p_request->>'cursor')::bigint,0); output jsonb; resume_output jsonb;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if action not in ('read','apply','migrate') then raise exception 'Unsupported history action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 insert into public.user_history_state(user_id) values(uid) on conflict do nothing;
 select migrated,revision into migrated_now,rev from public.user_history_state where user_id=uid;
 if not migrated_now then
   select count(*),md5(coalesce(string_agg(md5(row_to_json(h)::text),',' order by history_key),'')) into cnt,legacy_fingerprint from public.user_watch_history h where user_id=uid;
 end if;
 if action='migrate' and not migrated_now then
   select count(*) into cnt from public.user_watch_history where user_id=uid;
   if p_request->>'archivedCount' is null or (p_request->>'archivedCount')::bigint<>cnt or p_request->>'archivedFingerprint' is distinct from legacy_fingerprint then
     raise exception 'Legacy history changed; archive it again before migration';
   end if;
   -- The desktop has committed a raw recovery copy as well as normalized rows.
   for oldrow in select * from public.user_watch_history where user_id=uid and deleted_at is null order by updated_at,history_key loop
     ident:='legacy:'||coalesce(nullif(oldrow.anime_id,''),nullif(oldrow.anime_title,''),oldrow.history_key);
     ep:=coalesce(oldrow.episode,'1'); at_ms:=(extract(epoch from oldrow.updated_at)*1000)::bigint;
     insert into public.user_anime_tracking(user_id,identity,metadata,last_played)
       values(uid,ident,jsonb_build_object('animeId',oldrow.anime_id,'title',coalesce(oldrow.anime_title,ident),'poster',oldrow.poster_url),at_ms)
       on conflict(user_id,identity) do update set last_played=greatest(user_anime_tracking.last_played,excluded.last_played);
     if oldrow.completed then
       update public.user_anime_tracking set markers=markers||jsonb_build_object(ep,jsonb_build_object('episode',ep,'watched',true,'epoch',0,'updatedAt',at_ms)) where user_id=uid and identity=ident;
     end if;
     insert into public.user_recent_resumes(user_id,identity,last_played,payload) values(uid,ident,at_ms,
       jsonb_build_object('identity',ident,'animeId',coalesce(oldrow.anime_id,ident),'title',coalesce(oldrow.anime_title,ident),'poster',oldrow.poster_url,'episode',ep,'positionSeconds',coalesce(oldrow.resume_seconds,0),'durationSeconds',oldrow.duration_seconds,'progressPercent',oldrow.progress_percent,'completed',oldrow.completed,'watchedCoverage',oldrow.source->'watchedCoverage','updatedAt',at_ms,'lastPlayedAt',at_ms,'epoch',0))
       on conflict(user_id,identity) do update set payload=excluded.payload,last_played=excluded.last_played where excluded.last_played>=user_recent_resumes.last_played;
     rev:=rev+1; update public.user_anime_tracking set revision=rev where user_id=uid and identity=ident;
   end loop;
   update public.user_history_state set migrated=true where user_id=uid;
   migrated_now:=true;
   delete from public.user_watch_history where user_id=uid;
 end if;
 if action='apply' then
   if not migrated_now then raise exception 'Archive legacy history before enabling cloud retention'; end if;
   if device is null or length(device)>100 or length(device)<8 then raise exception 'Invalid sync device'; end if;
   if jsonb_typeof(p_request->'operations')<>'array' or jsonb_array_length(p_request->'operations')>200 then raise exception 'Invalid history batch'; end if;
   insert into public.user_history_devices(user_id,device_id) values(uid,device) on conflict do nothing;
   select last_sequence into through from public.user_history_devices where user_id=uid and device_id=device;
   for op in select value from jsonb_array_elements(p_request->'operations') order by (value->>'sequence')::bigint loop
     seq:=(op->>'sequence')::bigint;
     if seq<=through then continue; end if;
     ident:=op->>'identity'; k:=op->>'kind'; ep:=coalesce(op->>'episode','');
     select coalesce((select identity from public.user_history_aliases where user_id=uid and alias=ident),ident) into ident;
     if ident is null or ident !~ '^(mal|anilist|legacy):.+' or length(ident)>500 or octet_length(op::text)>2000000 then raise exception 'Invalid installment history'; end if;
     if k not in ('progress','watch','reset','clearResume','status','metadata','alias') then raise exception 'Unsupported history operation'; end if;
     insert into public.user_anime_tracking(user_id,identity) values(uid,ident) on conflict do nothing;
     select * into t from public.user_anime_tracking where user_id=uid and identity=ident;
     at_ms:=coalesce((op->>'updatedAt')::bigint,0); played:=coalesce((op->>'lastPlayedAt')::bigint,0);
     ep_epoch:=coalesce((op->>'epoch')::bigint,0);
     old_epoch:=greatest(coalesce((t.markers->ep->>'epoch')::bigint,0),coalesce((t.markers->'*'->>'epoch')::bigint,0));
     if k='alias' then
       from_id:=op->>'from';
       if (from_id like 'legacy:%' or (coalesce((op->>'providerVerified')::boolean,false) and from_id ~ '^(mal|anilist):')) and from_id<>ident then
         insert into public.user_history_aliases(user_id,alias,identity) values(uid,from_id,ident) on conflict(user_id,alias) do update set identity=excluded.identity;
         select * into oldrow from public.user_anime_tracking where user_id=uid and identity=from_id;
         if found then
           select coalesce(jsonb_object_agg(chosen.key,chosen.value),'{}'::jsonb) into combined_markers from
             (select distinct on (m.key) m.key,m.value from
               (select * from jsonb_each(oldrow.markers) union all select * from jsonb_each(t.markers)) m
              order by m.key,coalesce((m.value->>'epoch')::bigint,0) desc,coalesce((m.value->>'updatedAt')::bigint,0) desc) chosen;
           update public.user_anime_tracking set metadata=oldrow.metadata||t.metadata,markers=combined_markers,last_played=greatest(last_played,oldrow.last_played),explicit_status=coalesce(explicit_status,oldrow.explicit_status) where user_id=uid and identity=ident;
           insert into public.user_recent_resumes(user_id,identity,payload,last_played) select user_id,ident,jsonb_set(payload,'{identity}',to_jsonb(ident)),last_played from public.user_recent_resumes where user_id=uid and identity=from_id on conflict(user_id,identity) do update set payload=excluded.payload,last_played=excluded.last_played where excluded.last_played>user_recent_resumes.last_played;
           delete from public.user_recent_resumes where user_id=uid and identity=from_id;
           delete from public.user_anime_tracking where user_id=uid and identity=from_id;
         end if;
       end if;
     elsif k='metadata' then
       new_metadata:=jsonb_strip_nulls(jsonb_build_object('animeId',op->'metadata'->>'animeId','title',left(op->'metadata'->>'title',1000),'poster',left(op->'metadata'->>'poster',4096),'totalEpisodes',op->'metadata'->'totalEpisodes','latestAired',op->'metadata'->'latestAired','finished',op->'metadata'->'finished'));
       update public.user_anime_tracking as a set metadata=a.metadata||new_metadata where a.user_id=uid and a.identity=ident;
     elsif k='status' then
       if coalesce(op->>'status','') not in ('','Bookmarked','Watching','Completed','On hold','Dropped') then raise exception 'Invalid tracking status'; end if;
       update public.user_anime_tracking set explicit_status=nullif(op->>'status','') where user_id=uid and identity=ident;
     elsif k='reset' then
       if ep_epoch>=old_epoch then
         update public.user_anime_tracking set markers=jsonb_build_object('*',jsonb_build_object('episode','*','watched',false,'epoch',ep_epoch,'updatedAt',at_ms)),explicit_status=null,last_played=0,resume_cleared_at=greatest(resume_cleared_at,at_ms) where user_id=uid and identity=ident;
         delete from public.user_recent_resumes where user_id=uid and identity=ident;
       end if;
     elsif k='watch' then
       if ep='' or length(ep)>30 then raise exception 'Invalid episode marker'; end if;
       if (coalesce((op->>'manual')::boolean,false) and ep_epoch>=old_epoch) or (not coalesce((op->>'manual')::boolean,false) and ep_epoch=old_epoch) then
         current_marker:=jsonb_build_object('episode',ep,'watched',coalesce((op->>'watched')::boolean,false),'epoch',ep_epoch,'updatedAt',at_ms);
         update public.user_anime_tracking set markers=markers||jsonb_build_object(ep,current_marker) where user_id=uid and identity=ident;
         if coalesce((op->>'manual')::boolean,false) then delete from public.user_recent_resumes where user_id=uid and identity=ident and payload->>'episode'=ep; end if;
       end if;
     elsif k='clearResume' then
       update public.user_anime_tracking set resume_cleared_at=greatest(resume_cleared_at,at_ms) where user_id=uid and identity=ident;
       delete from public.user_recent_resumes where user_id=uid and identity=ident and (ep='' or payload->>'episode'=ep);
     elsif k='progress' then
       if ep='' or length(ep)>30 or played<=0 or ep_epoch<>old_epoch then through:=seq; continue; end if;
       if played>t.resume_cleared_at then
         -- Only the current episode's coverage and resume are retained; source URLs stay local.
         new_metadata:=jsonb_build_object('animeId',op->>'animeId','title',left(op->>'title',1000),'poster',left(op->>'poster',4096));
         update public.user_anime_tracking as a set metadata=a.metadata||jsonb_strip_nulls(new_metadata),last_played=greatest(last_played,played) where user_id=uid and identity=ident;
         insert into public.user_recent_resumes(user_id,identity,payload,last_played) values(uid,ident,
           jsonb_set(op-'source'-'operationId'-'sequence'-'kind','{identity}',to_jsonb(ident)),played)
           on conflict(user_id,identity) do update set payload=excluded.payload,last_played=excluded.last_played where excluded.last_played>=user_recent_resumes.last_played;
       end if;
     end if;
     rev:=rev+1; update public.user_anime_tracking set revision=rev where user_id=uid and identity=ident;
     through:=seq;
   end loop;
   update public.user_history_devices set last_sequence=through where user_id=uid and device_id=device;
 end if;
 -- Serialize the cap with writes from every device. Eviction never touches tracking.
 delete from public.user_recent_resumes r where r.user_id=uid and r.identity in
   (select identity from public.user_recent_resumes where user_id=uid order by last_played desc,identity offset 20);
 update public.user_history_state set revision=rev where user_id=uid;
 select coalesce(jsonb_agg(x.data order by x.revision),'[]'::jsonb) into output from
   (select a.revision,jsonb_build_object('identity',a.identity,'metadata',a.metadata,'explicitStatus',a.explicit_status,'markers',coalesce((select jsonb_agg(value) from jsonb_each(a.markers)),'[]'::jsonb),'lastPlayedAt',a.last_played,'revision',a.revision,'aliases',coalesce((select jsonb_agg(alias) from public.user_history_aliases x where x.user_id=uid and x.identity=a.identity),'[]'::jsonb)) data
    from public.user_anime_tracking a where a.user_id=uid and a.revision>cursor_value order by a.revision limit 100) x;
 select coalesce(jsonb_agg(payload order by last_played desc,identity),'[]'::jsonb) into resume_output from public.user_recent_resumes where user_id=uid;
 return jsonb_build_object('version',3,'migrated',migrated_now,'legacyFingerprint',legacy_fingerprint,'tracking',output,'resumes',resume_output,'acknowledgedThrough',through,
   'cursor',coalesce((output->-1->>'revision')::bigint,cursor_value),'hasMore',exists(select 1 from public.user_anime_tracking where user_id=uid and revision>coalesce((output->-1->>'revision')::bigint,cursor_value)));
end; $$;
revoke all on function public.history_sync_v3(jsonb) from public,anon;
grant execute on function public.history_sync_v3(jsonb) to authenticated;

create or replace function public.block_retired_history_writes()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if exists(select 1 from public.user_history_state where user_id=new.user_id and migrated) then
   raise exception 'Upgrade StreamNyaa: history now uses the version 3 sync protocol' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function public.block_retired_history_writes() from public;
drop trigger if exists block_retired_history_writes on public.user_watch_history;
create trigger block_retired_history_writes before insert or update on public.user_watch_history for each row execute function public.block_retired_history_writes();
commit;
