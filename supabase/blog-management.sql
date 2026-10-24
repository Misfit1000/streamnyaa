-- Recoverable Admin trash. Content, dates, evidence and publication settings stay intact.
alter table public.blog_articles add column if not exists admin_deleted_at timestamptz;
alter table public.blog_articles add column if not exists admin_deleted_by text;
alter table public.blog_articles add column if not exists admin_revision bigint not null default 0;
alter table public.blog_generation_runs add column if not exists admin_deleted_at timestamptz;
alter table public.blog_generation_runs add column if not exists admin_deleted_by text;
alter table public.blog_generation_runs add column if not exists admin_revision bigint not null default 0;
alter table public.blog_generation_runs add column if not exists admin_previous_status text;
create index if not exists blog_articles_admin_list on public.blog_articles(updated_at desc,slug desc) where admin_deleted_at is null;
create index if not exists blog_runs_admin_list on public.blog_generation_runs(created_at desc,id desc) where admin_deleted_at is null;
-- Existing public read policies must not expose trashed rows through direct REST.
alter table public.blog_articles enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='blog_articles' and policyname='blog_articles_visible_only') then
    create policy blog_articles_visible_only on public.blog_articles as restrictive for select to anon,authenticated using(admin_deleted_at is null);
  end if;
end $$;

create or replace function public.manage_blog_entry(p_kind text,p_id text,p_revision bigint,p_trash boolean,p_actor text)
returns boolean language plpgsql security definer set search_path=public as $$
declare article blog_articles; run blog_generation_runs;
begin
  if p_kind='article' then
    select * into article from blog_articles where slug=p_id for update;
    if article.slug is null or article.admin_revision<>p_revision or (article.admin_deleted_at is not null)=p_trash then return false; end if;
    update blog_articles set admin_deleted_at=case when p_trash then now() else null end,
      admin_deleted_by=case when p_trash then left(p_actor,200) else null end,admin_revision=admin_revision+1 where slug=p_id;
  elsif p_kind='draft' then
    select * into run from blog_generation_runs where id::text=p_id for update;
    if run.id is null or run.admin_revision<>p_revision or (run.admin_deleted_at is not null)=p_trash
      or run.status in ('pending','running') then return false; end if;
    update blog_generation_runs set admin_deleted_at=case when p_trash then now() else null end,
      admin_deleted_by=case when p_trash then left(p_actor,200) else null end,admin_revision=admin_revision+1,
      admin_previous_status=case when p_trash then status else null end,
      status=case when p_trash then 'skipped' else coalesce(admin_previous_status,status) end
      where id=run.id;
  else return false;
  end if;
  return true;
end $$;
revoke all on function public.manage_blog_entry(text,text,bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.manage_blog_entry(text,text,bigint,boolean,text) to service_role;
