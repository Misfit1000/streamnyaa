-- Additive, server-only publishing coordination and public metadata snapshots.
begin;
create table if not exists public.site_public_snapshots (
  key text primary key check(length(key) between 1 and 240),
  payload jsonb not null check(octet_length(payload::text) <= 2097152),
  fetched_at timestamptz not null,
  expires_at timestamptz not null
);
create index if not exists site_public_snapshots_expiry on public.site_public_snapshots(expires_at);
create table if not exists public.site_snapshot_leases (
  key text primary key,
  token uuid not null,
  expires_at timestamptz not null
);
create table if not exists public.blog_generation_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique not null,
  kind text not null check(kind in ('daily','weekly')),
  status text not null default 'pending' check(status in ('pending','running','published','skipped','failed')),
  lease_token uuid,
  lease_until timestamptz,
  checkpoint jsonb not null default '{}',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_generation_runs_recent on public.blog_generation_runs(created_at desc);
create table if not exists public.blog_publication_claims (
  fingerprint text primary key,
  run_id uuid not null references public.blog_generation_runs(id),
  article_slug text not null unique,
  published_at timestamptz
);
alter table public.site_public_snapshots enable row level security;
alter table public.site_snapshot_leases enable row level security;
alter table public.blog_generation_runs enable row level security;
alter table public.blog_publication_claims enable row level security;
revoke all on public.site_public_snapshots, public.site_snapshot_leases, public.blog_generation_runs, public.blog_publication_claims from anon, authenticated;
grant all on public.site_public_snapshots, public.site_snapshot_leases, public.blog_generation_runs, public.blog_publication_claims to service_role;

create or replace function public.put_site_snapshot(p_key text,p_payload jsonb,p_fetched_at timestamptz,p_ttl integer)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into site_public_snapshots values(p_key,p_payload,p_fetched_at,p_fetched_at+make_interval(secs=>greatest(60,least(p_ttl,604800))))
  on conflict(key) do update set payload=excluded.payload,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at
    where site_public_snapshots.fetched_at <= excluded.fetched_at;
  -- Provider snapshots are bounded; old ranking evidence has a separate namespace.
  delete from site_public_snapshots where expires_at < now()-interval '60 days';
  return true;
end $$;
create or replace function public.claim_site_snapshot(p_key text,p_token uuid,p_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare claimed text;
begin
  insert into site_snapshot_leases values(p_key,p_token,now()+make_interval(secs=>greatest(5,least(p_seconds,120))))
  on conflict(key) do update set token=excluded.token,expires_at=excluded.expires_at
    where site_snapshot_leases.expires_at < now()
  returning key into claimed;
  return claimed is not null;
end $$;
create or replace function public.claim_blog_run(p_id uuid,p_token uuid)
returns setof public.blog_generation_runs language sql security definer set search_path=public as $$
  update blog_generation_runs set status='running',lease_token=p_token,lease_until=now()+interval '5 minutes',updated_at=now()
  where id=p_id and (status='pending' or status='running' and lease_until<now()) returning *;
$$;
create or replace function public.save_blog_run(p_id uuid,p_token uuid,p_status text,p_checkpoint jsonb,p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update blog_generation_runs set status=p_status,checkpoint=p_checkpoint,reason=left(p_reason,1000),updated_at=now(),
    lease_until=case when p_status='running' then now()+interval '5 minutes' else null end
  where id=p_id and lease_token=p_token and lease_until>=now() and status='running';
  return found;
end $$;
create or replace function public.claim_blog_topic(p_fingerprint text,p_run uuid,p_slug text,p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare owner uuid;
begin
  if not exists(select 1 from blog_generation_runs where id=p_run and lease_token=p_token and lease_until>=now() and status='running') then return false; end if;
  insert into blog_publication_claims(fingerprint,run_id,article_slug) values(p_fingerprint,p_run,p_slug) on conflict do nothing;
  select run_id into owner from blog_publication_claims where fingerprint=p_fingerprint;
  return owner=p_run;
end $$;
revoke all on function public.put_site_snapshot(text,jsonb,timestamptz,integer),public.claim_site_snapshot(text,uuid,integer),public.claim_blog_run(uuid,uuid),public.save_blog_run(uuid,uuid,text,jsonb,text),public.claim_blog_topic(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.put_site_snapshot(text,jsonb,timestamptz,integer),public.claim_site_snapshot(text,uuid,integer),public.claim_blog_run(uuid,uuid),public.save_blog_run(uuid,uuid,text,jsonb,text),public.claim_blog_topic(text,uuid,text,uuid) to service_role;
create or replace function public.merge_calendar_snapshot(p_key text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare combined jsonb;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1500 or octet_length(p_rows::text)>2097152 then raise exception 'Invalid Calendar snapshot'; end if;
  insert into site_public_snapshots values(p_key,'[]',now(),now()+interval '60 days') on conflict do nothing;
  perform 1 from site_public_snapshots where key=p_key for update;
  select coalesce(jsonb_agg(row),'[]') into combined from (
    select distinct on (row->>'scheduleId') row from (
      select value as row from site_public_snapshots s cross join lateral jsonb_array_elements(s.payload) where s.key=p_key
      union all select value from jsonb_array_elements(p_rows)
    ) all_rows where row->>'scheduleId' is not null
    order by row->>'scheduleId',(row->>'scheduleProvider'='animeschedule') desc,(row->>'scheduleFetchedAt')::bigint desc
    limit 1500
  ) selected;
  update site_public_snapshots set payload=combined,fetched_at=now(),expires_at=now()+interval '60 days' where key=p_key;
  return combined;
end $$;
revoke all on function public.merge_calendar_snapshot(text,jsonb) from public,anon,authenticated;
grant execute on function public.merge_calendar_snapshot(text,jsonb) to service_role;
commit;
