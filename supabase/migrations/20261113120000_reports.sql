-- Bug reports and (opt-in) automatic error reports sent from the app.
-- Write-only for the app: anon may insert these columns and nothing else, and can never read them back.
-- The developer reads them in the Table Editor. No contact field: the app asks users not to include
-- personal data and points to GitHub issues for anyone who wants a reply.
create table public.reports (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('bug', 'error')),
  version    text not null check (length(version) <= 40),
  platform   text not null check (platform in ('win32', 'darwin', 'android')),
  os         text check (length(os) <= 200),
  message    text not null check (length(message) between 1 and 2000),
  details    text check (length(details) <= 8000)
);

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant insert (kind, version, platform, os, message, details) on public.reports to anon;
create policy "anyone can send a report" on public.reports
  for insert to anon with check (true);

-- Bounded size whatever anyone sends: after each insert keep only the newest 5000 rows (at ~10 KB each,
-- under 50 MB) and nothing older than 90 days. Spam can push old reports out, but can't fill the database.
create function public.reports_trim() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  delete from public.reports
  where created_at < now() - interval '90 days'
     or id <= (select r.id from public.reports r order by r.id desc offset 5000 limit 1);
  return null;
end $$;
revoke execute on function public.reports_trim() from public, anon, authenticated;
create trigger reports_trim after insert on public.reports
  for each statement execute function public.reports_trim();

-- The 90-day limit also holds when nobody sends anything: a daily clean-up.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('reports-90-days', '17 3 * * *',
  $$delete from public.reports where created_at < now() - interval '90 days'$$);
