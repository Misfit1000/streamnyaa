-- Additive review gate. Apply after site-publishing.sql, before new workers.
alter table public.blog_generation_runs add column if not exists publication_mode text not null default 'review' check(publication_mode in ('review','automatic'));
alter table public.blog_generation_runs drop constraint if exists blog_generation_runs_status_check;
alter table public.blog_generation_runs add constraint blog_generation_runs_status_check check(status in ('pending','running','awaiting_review','published','skipped','failed'));
create table if not exists public.blog_publication_settings (
  singleton boolean primary key default true check(singleton),
  automatic_enabled boolean not null default false,
  accepted_run uuid references public.blog_generation_runs(id),
  updated_at timestamptz not null default now()
);
insert into public.blog_publication_settings(singleton) values(true) on conflict do nothing;
alter table public.blog_publication_settings enable row level security;
revoke all on public.blog_publication_settings from public,anon,authenticated;
grant all on public.blog_publication_settings to service_role;

create or replace function public.review_blog_draft(p_id uuid,p_revision text,p_approve boolean,p_reviewer text,p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
declare current_run blog_generation_runs; decision jsonb;
begin
  select * into current_run from blog_generation_runs where id=p_id for update;
  if current_run.id is null or current_run.status<>'awaiting_review' or current_run.checkpoint->>'reviewRevision' is distinct from p_revision then return false; end if;
  decision=jsonb_build_object('revision',p_revision,'approved',p_approve,'reviewer',left(p_reviewer,200),'reason',left(p_reason,1000),'at',now());
  update blog_generation_runs set status=case when p_approve then 'pending' else 'skipped' end,
    checkpoint=current_run.checkpoint||jsonb_build_object('approvedRevision',case when p_approve then p_revision else null end,'reviewDecision',decision,'reviewRejected',not p_approve,'resumeRequired',false),
    reason=case when p_approve then 'Reviewed draft approved for durable publication.' else 'Draft rejected: '||left(p_reason,800) end,
    lease_token=null,lease_until=null,updated_at=now() where id=p_id;
  return true;
end $$;
create or replace function public.enable_blog_automatic(p_accepted_run uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from blog_generation_runs where id=p_accepted_run and status='published'
      and checkpoint->'reviewDecision'->>'approved'='true' and jsonb_array_length(coalesce(checkpoint->'published','[]'))>0) then return false; end if;
  update blog_publication_settings set automatic_enabled=true,accepted_run=p_accepted_run,updated_at=now() where singleton;
  return found;
end $$;
revoke all on function public.review_blog_draft(uuid,text,boolean,text,text),public.enable_blog_automatic(uuid) from public,anon,authenticated;
grant execute on function public.review_blog_draft(uuid,text,boolean,text,text),public.enable_blog_automatic(uuid) to service_role;
