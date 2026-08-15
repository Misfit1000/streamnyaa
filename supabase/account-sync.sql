create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  anime_id text not null,
  anime_title text not null,
  anime jsonb not null,
  bookmarked boolean not null default false,
  liked boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, anime_id)
);

create table if not exists public.user_watch_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  history_key text not null,
  source jsonb,
  anime_id text,
  anime_title text,
  episode text,
  progress_percent numeric,
  resume_seconds numeric,
  duration_seconds numeric,
  poster_url text,
  completed boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, history_key)
);

alter table public.user_profiles enable row level security;
alter table public.user_library enable row level security;
alter table public.user_watch_history enable row level security;

alter table public.user_library
  add column if not exists deleted_at timestamptz;

alter table public.user_watch_history
  alter column source drop not null,
  add column if not exists poster_url text,
  add column if not exists completed boolean not null default false,
  add column if not exists deleted_at timestamptz;

drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can write own profile" on public.user_profiles;
drop policy if exists "Users can read own library" on public.user_library;
drop policy if exists "Users can write own library" on public.user_library;
drop policy if exists "Users can delete own library" on public.user_library;
drop policy if exists "Users can update own library" on public.user_library;
drop policy if exists "Users can read own watch history" on public.user_watch_history;
drop policy if exists "Users can write own watch history" on public.user_watch_history;
drop policy if exists "Users can delete own watch history" on public.user_watch_history;
drop policy if exists "Users can update own watch history" on public.user_watch_history;

create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "Users can write own profile"
  on public.user_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own library"
  on public.user_library for select
  using (auth.uid() = user_id);

create policy "Users can write own library"
  on public.user_library for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own library"
  on public.user_library for delete
  using (auth.uid() = user_id);

create policy "Users can update own library"
  on public.user_library for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own watch history"
  on public.user_watch_history for select
  using (auth.uid() = user_id);

create policy "Users can write own watch history"
  on public.user_watch_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own watch history"
  on public.user_watch_history for delete
  using (auth.uid() = user_id);

create policy "Users can update own watch history"
  on public.user_watch_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_library_user_updated_idx
  on public.user_library (user_id, updated_at desc);

create index if not exists user_watch_history_user_updated_idx
  on public.user_watch_history (user_id, updated_at desc);

create or replace function public.keep_newest_account_sync_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_newest_account_sync_record() from public;

drop trigger if exists keep_newest_user_library_record on public.user_library;
create trigger keep_newest_user_library_record
  before update on public.user_library
  for each row execute function public.keep_newest_account_sync_record();

drop trigger if exists keep_newest_user_watch_history_record on public.user_watch_history;
create trigger keep_newest_user_watch_history_record
  before update on public.user_watch_history
  for each row execute function public.keep_newest_account_sync_record();
