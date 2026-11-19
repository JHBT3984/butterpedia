-- Run this once in Supabase Dashboard → SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.specimens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 40),
  description text not null default '' check (char_length(description) <= 600),
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table public.specimens enable row level security;
grant select, insert on public.specimens to anon, authenticated;

drop policy if exists "Anyone can read public specimens" on public.specimens;
create policy "Anyone can read public specimens" on public.specimens for select using (true);
drop policy if exists "Anyone can add public specimens" on public.specimens;
create policy "Anyone can add public specimens" on public.specimens for insert with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('specimen-images', 'specimen-images', true, 8388608, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg'];

drop policy if exists "Anyone can read specimen photos" on storage.objects;
create policy "Anyone can read specimen photos" on storage.objects for select using (bucket_id = 'specimen-images');
drop policy if exists "Anyone can upload specimen photos" on storage.objects;
create policy "Anyone can upload specimen photos" on storage.objects for insert with check (bucket_id = 'specimen-images');
