-- BeautyContent AI MVP schema v1.0

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  industry text not null default 'beauty_salon',
  city text,
  description text,
  target_audience text,
  tone_of_voice text,
  brand_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric,
  currency text not null default 'MDL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null,
  type text not null check (type in ('post', 'story', 'reels', 'ad')),
  goal text not null,
  title text,
  prompt text,
  content text,
  status text not null default 'saved' check (status in ('draft', 'saved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, user_id)
    references public.businesses(id, user_id)
    on delete cascade
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.projects enable row level security;
alter table public.generations enable row level security;

create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "businesses_select_own"
on public.businesses for select
using (user_id = auth.uid());

create policy "businesses_insert_own"
on public.businesses for insert
with check (user_id = auth.uid());

create policy "businesses_update_own"
on public.businesses for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "businesses_delete_own"
on public.businesses for delete
using (user_id = auth.uid());

create policy "services_select_own"
on public.services for select
using (
  exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.user_id = auth.uid()
  )
);

create policy "services_insert_own"
on public.services for insert
with check (
  exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.user_id = auth.uid()
  )
);

create policy "services_update_own"
on public.services for update
using (
  exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.user_id = auth.uid()
  )
);

create policy "services_delete_own"
on public.services for delete
using (
  exists (
    select 1 from public.businesses b
    where b.id = services.business_id
      and b.user_id = auth.uid()
  )
);

create policy "projects_select_own"
on public.projects for select
using (user_id = auth.uid());

create policy "projects_insert_own"
on public.projects for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.businesses b
    where b.id = projects.business_id
      and b.user_id = projects.user_id
  )
);

create policy "projects_update_own"
on public.projects for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.businesses b
    where b.id = projects.business_id
      and b.user_id = projects.user_id
  )
);

create policy "projects_delete_own"
on public.projects for delete
using (user_id = auth.uid());

create policy "generations_select_own"
on public.generations for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = generations.project_id
      and p.user_id = auth.uid()
  )
);

create policy "generations_insert_own"
on public.generations for insert
with check (
  exists (
    select 1
    from public.projects p
    where p.id = generations.project_id
      and p.user_id = auth.uid()
  )
);
