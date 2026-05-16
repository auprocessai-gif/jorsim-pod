-- Jorsim Pod database schema for a new, separate Supabase project.
-- Run this only inside the new Jorsim Pod Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  publish_date date not null default current_date,
  topic text not null default 'Nutrición',
  pet text not null default 'Perros',
  type text not null default 'Podcast',
  duration_minutes integer not null default 1 check (duration_minutes > 0),
  cover_path text,
  audio_path text not null,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episodes_topic_check check (topic in ('Nutrición', 'Conducta', 'Salud', 'Bienestar', 'Adopción', 'Juego', 'Historias')),
  constraint episodes_pet_check check (pet in ('Perros', 'Gatos', 'Perros y gatos')),
  constraint episodes_type_check check (type in ('Podcast', 'Entrevista'))
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  pet text not null default 'Perro',
  topic text,
  message text not null,
  status text not null default 'nueva',
  sent_to text not null default 'mariola@auladeformadores.com',
  created_at timestamptz not null default now(),
  constraint consultations_status_check check (status in ('nueva', 'leida', 'respondida', 'archivada'))
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  author_name text,
  body text not null,
  status text not null default 'visible',
  created_at timestamptz not null default now(),
  constraint comments_status_check check (status in ('visible', 'pendiente', 'oculto'))
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  episode_id uuid references public.episodes(id) on delete set null,
  episode_title text,
  topic text,
  pet text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint analytics_event_type_check check (event_type in ('episode_play', 'episode_completed', 'consultation_submitted'))
);

create index if not exists episodes_publish_date_idx on public.episodes (publish_date desc);
create index if not exists episodes_topic_idx on public.episodes (topic);
create index if not exists consultations_created_at_idx on public.consultations (created_at desc);
create index if not exists comments_episode_id_idx on public.comments (episode_id);
create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_episode_id_idx on public.analytics_events (episode_id);

alter table public.episodes enable row level security;
alter table public.consultations enable row level security;
alter table public.comments enable row level security;
alter table public.analytics_events enable row level security;

create policy "Public can read published episodes"
  on public.episodes for select
  using (publish_date <= current_date);

create policy "Public can create consultations"
  on public.consultations for insert
  with check (true);

create policy "Public can read visible comments"
  on public.comments for select
  using (status = 'visible');

create policy "Public can create comments as pending"
  on public.comments for insert
  with check (status in ('visible', 'pendiente'));

create policy "Public can create anonymous analytics events"
  on public.analytics_events for insert
  with check (true);

-- Admin reads/writes should be done from Vercel server functions with the Supabase service role key.
-- Do not expose the service role key in browser JavaScript.
