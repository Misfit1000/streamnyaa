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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, anime_id)
);

create table if not exists public.user_watch_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  history_key text not null,
  source jsonb not null,
  anime_id text,
  anime_title text,
  episode text,
  progress_percent numeric,
  resume_seconds numeric,
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, history_key)
);

alter table public.user_profiles enable row level security;
alter table public.user_library enable row level security;
alter table public.user_watch_history enable row level security;

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
