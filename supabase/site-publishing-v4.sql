-- New jobs only. Existing drafts, article contents and publishing settings stay intact.
begin;
alter table public.blog_generation_runs drop constraint if exists blog_generation_runs_editorial_version_check;
alter table public.blog_generation_runs add constraint blog_generation_runs_editorial_version_check check(editorial_version in (2,3,4));
alter table public.blog_generation_runs alter column editorial_version set default 4;

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
    values(p_key,p_kind,case when p_origin='manual' then 'review' when coalesce((select automatic_enabled from blog_publication_settings where singleton),false) then 'automatic' else 'review' end,p_origin,4,
      jsonb_build_object('limit',case when p_kind='weekly' then 1 else p_limit end,'published','[]'::jsonb,'stage','Finding another story')) returning id into chosen;
  end if;
  if p_origin='manual' then insert into blog_manual_requests(request_key,run_id) values(p_key,chosen) on conflict do nothing; end if;
  return query select * from blog_generation_runs where id=chosen;
end $$;
revoke all on function public.enqueue_blog_generation(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.enqueue_blog_generation(text,text,integer,text) to service_role;
commit;
