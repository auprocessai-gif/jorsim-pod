-- Jorsim Pod database schema for the shared Supabase instance.
-- Uses jorsim_* table names to avoid mixing with existing projects.

create extension if not exists pgcrypto;

create table if not exists public.jorsim_episodes (
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
  constraint jorsim_episodes_topic_check check (topic in ('Nutrición', 'Conducta', 'Salud', 'Bienestar', 'Adopción', 'Juego', 'Historias')),
  constraint jorsim_episodes_pet_check check (pet in ('Perros', 'Gatos', 'Perros y gatos')),
  constraint jorsim_episodes_type_check check (type in ('Podcast', 'Entrevista'))
);

create table if not exists public.jorsim_consultations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  pet text not null default 'Perro',
  topic text,
  message text not null,
  status text not null default 'nueva',
  sent_to text not null default 'mariola@auladeformadores.com',
  created_at timestamptz not null default now(),
  constraint jorsim_consultations_status_check check (status in ('nueva', 'leida', 'respondida', 'archivada'))
);

create table if not exists public.jorsim_comments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.jorsim_episodes(id) on delete cascade,
  author_name text,
  body text not null,
  status text not null default 'visible',
  created_at timestamptz not null default now(),
  constraint jorsim_comments_status_check check (status in ('visible', 'pendiente', 'oculto'))
);

create table if not exists public.jorsim_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  episode_id uuid references public.jorsim_episodes(id) on delete set null,
  episode_title text,
  topic text,
  pet text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint jorsim_analytics_event_type_check check (event_type in ('episode_play', 'episode_completed', 'consultation_submitted'))
);

create index if not exists jorsim_episodes_publish_date_idx on public.jorsim_episodes (publish_date desc);
create index if not exists jorsim_episodes_topic_idx on public.jorsim_episodes (topic);
create index if not exists jorsim_consultations_created_at_idx on public.jorsim_consultations (created_at desc);
create index if not exists jorsim_comments_episode_id_idx on public.jorsim_comments (episode_id);
create index if not exists jorsim_analytics_events_created_at_idx on public.jorsim_analytics_events (created_at desc);
create index if not exists jorsim_analytics_events_episode_id_idx on public.jorsim_analytics_events (episode_id);

alter table public.jorsim_episodes enable row level security;
alter table public.jorsim_consultations enable row level security;
alter table public.jorsim_comments enable row level security;
alter table public.jorsim_analytics_events enable row level security;

create policy "Public can read published jorsim episodes"
  on public.jorsim_episodes for select
  using (publish_date <= current_date);

create policy "Public can create jorsim consultations"
  on public.jorsim_consultations for insert
  with check (true);

create policy "Public can read visible jorsim comments"
  on public.jorsim_comments for select
  using (status = 'visible');

create policy "Public can create jorsim comments as pending"
  on public.jorsim_comments for insert
  with check (status in ('visible', 'pendiente'));

create policy "Public can create jorsim anonymous analytics events"
  on public.jorsim_analytics_events for insert
  with check (true);

-- Admin reads/writes should be done from Vercel server functions with the Supabase service role key.
-- Do not expose the service role key in browser JavaScript.
