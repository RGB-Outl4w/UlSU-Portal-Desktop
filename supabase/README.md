# Supabase

Project `imuxokzoaqwywweegxzw` (free tier, EU North / Stockholm). It holds only public, non-personal data.
The app reads it with the publishable key (`sb_publishable_…`, fine to ship). Never put the `sb_secret_…`
key or the database password in the repo or in the app.

## How changes reach the database

The project is linked to this GitHub repo. A push to `main` that adds a file in `supabase/migrations/`
applies that file to the database, once ("Deploy to production" in the GitHub integration).

One-time check in the dashboard: **Project Settings → Integrations → GitHub Integration**
- Working directory: `.` (the `supabase/` folder is at the repo root)
- Deploy to production: **on**
- Automatic branching: **off** (preview branches are separate databases and may cost money)

Never edit a migration that has already been pushed; add a new one instead.

## Posting an announcement

Dashboard → **Table Editor** → `announcements` → **Insert row**:

| Column | What to put |
|---|---|
| `text_ru` | The notice in Russian, plain text, up to 500 characters. Required |
| `text_en` | English text. Empty: English users see `text_ru` |
| `url` | Optional `https://…` link; adds a «Подробнее» button |
| `platform` | `win32`, `darwin` or `android`. Empty: everyone |
| `min_version` / `max_version` | Show only to versions in this range, e.g. max `1.2.8` = 1.2.8 and older. Empty: no limit |
| `until` | Hide after this date and time. Empty: until you switch it off |
| `active` | Untick to take the notice down |

Leave `id` and `created_at` empty. Apps pick up a new row at their next start, when the user comes back to the app, or within an hour. Each
user sees the newest matching notice first; «Скрыть» hides it for good on that device.

Check what the app will receive:

```bash
curl "https://imuxokzoaqwywweegxzw.supabase.co/rest/v1/announcements?select=*" -H "apikey: sb_publishable_HJDdb-LL-SdITMfL4cDLhQ_9zD3zJL5"
```

The free tier pauses the project after about a week with no requests. The app then just shows no
notice; restore it from the dashboard.
