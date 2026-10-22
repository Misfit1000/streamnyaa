-- Additive: existing jobs, drafts, articles and publication settings are untouched.
begin;
alter table public.blog_generation_runs add column if not exists origin text check(origin in ('scheduled','manual'));
alter table public.blog_generation_runs add column if not exists editorial_version integer not null default 2 check(editorial_version in (2,3));
create table if not exists public.blog_manual_requests (
  request_key text primary key check(length(request_key)<=200),
  run_id uuid not null references public.blog_generation_runs(id),
  created_at timestamptz not null default now()
);
alter table public.blog_manual_requests enable row level security;
revoke all on public.blog_manual_requests from public,anon,authenticated;
grant all on public.blog_manual_requests to service_role;

create or replace function public.enqueue_blog_generation(p_key text,p_kind text,p_limit integer,p_origin text)
returns setof public.blog_generation_runs language plpgsql security definer set search_path=public as $$
declare chosen uuid;
begin
  if p_kind not in ('daily','weekly') or p_origin not in ('scheduled','manual') or length(p_key)>200 or length(p_key)<8 or p_limit not between 1 and 2 then raise exception 'Invalid generation request'; end if;
  perform pg_advisory_xact_lock(73621012);
  select id into chosen from blog_generation_runs where idempotency_key=p_key;
  if chosen is null and p_origin='manual' then
    select run_id into chosen from blog_manual_requests where request_key=p_key;
    if chosen is null then
      select id into chosen from blog_generation_runs where
        (status='running' and lease_until>now()) or
        (status='pending' and coalesce(checkpoint->>'resumeRequired','false')='false')
        order by created_at limit 1;
    end if;
  end if;
  if chosen is null then
    insert into blog_generation_runs(idempotency_key,kind,publication_mode,origin,editorial_version,checkpoint)
    values(p_key,p_kind,case when p_origin='manual' then 'review' when coalesce((select automatic_enabled from blog_publication_settings where singleton),false) then 'automatic' else 'review' end,p_origin,3,
      jsonb_build_object('limit',case when p_kind='weekly' then 1 else p_limit end,'published','[]'::jsonb,'stage','Finding another story')) returning id into chosen;
  end if;
  if p_origin='manual' then insert into blog_manual_requests(request_key,run_id) values(p_key,chosen) on conflict do nothing; end if;
  return query select * from blog_generation_runs where id=chosen;
end $$;

-- A project-wide transaction lock makes the per-run leases mutually exclusive.
create or replace function public.claim_blog_run(p_id uuid,p_token uuid)
returns setof public.blog_generation_runs language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(73621012);
  if exists(select 1 from blog_generation_runs where id<>p_id and status='running' and lease_until>now()) then return; end if;
  return query update blog_generation_runs set status='running',lease_token=p_token,lease_until=now()+interval '5 minutes',updated_at=now()
    where id=p_id and (status='pending' or status='running' and lease_until<now()) returning *;
end $$;
revoke all on function public.enqueue_blog_generation(text,text,integer,text),public.claim_blog_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_blog_generation(text,text,integer,text),public.claim_blog_run(uuid,uuid) to service_role;
commit;
