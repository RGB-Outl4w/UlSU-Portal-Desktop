-- Notices from the developer, shown as a bar in the app (portal changes, "please update", maintenance).
-- Public and read-only: the app reads them with the publishable key; rows are added in the Table Editor.
-- No personal data lives here, and the app sends none.
create table public.announcements (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  active      boolean not null default true,
  text_ru     text not null check (length(text_ru) between 1 and 500),
  text_en     text check (length(text_en) <= 500),            -- empty: English users see text_ru
  url         text check (url ~ '^https://'),                 -- optional "Подробнее" link
  platform    text check (platform in ('win32', 'darwin', 'android')), -- empty: every platform
  min_version text check (min_version ~ '^\d+\.\d+\.\d+'),    -- shown to versions >= this (empty: no lower bound)
  max_version text check (max_version ~ '^\d+\.\d+\.\d+'),    -- shown to versions <= this (empty: no upper bound)
  until       timestamptz                                     -- hidden after this moment (empty: until switched off)
);

-- Whatever the project's "expose new tables" setting did: anon may only read, and only active rows.
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon;
-- Expired rows aren't sent at all, so the reply stays small however many notices pile up over the years.
create policy "anyone reads active announcements" on public.announcements
  for select to anon using (active and (until is null or until > now()));
