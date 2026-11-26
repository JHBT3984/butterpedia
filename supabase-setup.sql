-- Run this once in Supabase Dashboard → SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.specimens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 40),
  description text not null default '' check (char_length(description) <= 600),
  observed_on date,
  location text not null default '',
  dimensions text not null default '',
  color_pattern text not null default '',
  material text not null default '',
  form text not null default '',
  image_url text not null,
  delete_token_hash text,
  created_at timestamptz not null default now()
);

alter table public.specimens add column if not exists observed_on date;
alter table public.specimens add column if not exists location text not null default '';
alter table public.specimens add column if not exists dimensions text not null default '';
alter table public.specimens add column if not exists color_pattern text not null default '';
alter table public.specimens add column if not exists material text not null default '';
alter table public.specimens add column if not exists form text not null default '';
alter table public.specimens add column if not exists delete_token_hash text;

create or replace function public.set_specimen_delete_token_hash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  new.delete_token_hash := encode(
    digest(coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-specimen-delete-token', 'sha256'),
    'hex'
  );
  return new;
end;
$$;

drop trigger if exists set_specimen_delete_token_hash on public.specimens;
create trigger set_specimen_delete_token_hash
before insert on public.specimens
for each row execute function public.set_specimen_delete_token_hash();

alter table public.specimens enable row level security;
grant select, insert, delete on public.specimens to anon, authenticated;

drop policy if exists "Anyone can read public specimens" on public.specimens;
create policy "Anyone can read public specimens" on public.specimens for select using (true);
drop policy if exists "Anyone can add public specimens" on public.specimens;
create policy "Anyone can add public specimens" on public.specimens for insert with check (true);
drop policy if exists "Anyone can delete public specimens" on public.specimens;
drop policy if exists "Owners can delete their public specimens" on public.specimens;
create policy "Owners can delete their public specimens" on public.specimens for delete using (
  delete_token_hash = encode(
    digest(coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-specimen-delete-token', 'sha256'),
    'hex'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('specimen-images', 'specimen-images', true, 8388608, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg'];

drop policy if exists "Anyone can read specimen photos" on storage.objects;
create policy "Anyone can read specimen photos" on storage.objects for select using (bucket_id = 'specimen-images');
drop policy if exists "Anyone can upload specimen photos" on storage.objects;
create policy "Anyone can upload specimen photos" on storage.objects for insert with check (bucket_id = 'specimen-images');
drop policy if exists "Anyone can delete specimen photos" on storage.objects;
drop policy if exists "Owners can delete their specimen photos" on storage.objects;
create policy "Owners can delete their specimen photos" on storage.objects for delete using (
  bucket_id = 'specimen-images'
  and exists (
    select 1 from public.specimens s
    where s.delete_token_hash = encode(
      digest(coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-specimen-delete-token', 'sha256'),
      'hex'
    )
    and strpos(s.image_url, '/storage/v1/object/public/specimen-images/' || storage.objects.name) > 0
  )
);
