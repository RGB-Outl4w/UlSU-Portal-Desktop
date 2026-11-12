# Privacy Policy

**ULSU Portal Desktop** · Effective 12 November 2026 · [Русская версия](PRIVACY.ru.md)

The short version: **everything stays on your device and on the portal itself.** The app talks to portal.ulsu.ru, to sites you choose to open, and reads the developer's public notice board and GitHub's latest release number (you can turn both off). The developer receives no data from you.

## Who is responsible

ULSU Portal Desktop is an open-source app made by an individual student (see [NOTICE.md](NOTICE.md)). The developer keeps only a read-only notice board for the app (see below) and does not collect, receive or process your data. Your data is processed on your own device, under your control, and by the ULSU portal under the university's own rules.

## What the app handles

| Data | Where it comes from | Where it is kept | Why |
|---|---|---|---|
| Login, password, MAX code | You type them on the portal's login page | **Nowhere by the app.** They go straight from the portal page to the portal | To sign in. The app never reads these fields |
| Portal session cookie (`MoodleSession`) and other portal cookies | Set by portal.ulsu.ru after sign-in | Your computer, app data folder, up to 30 days | So you don't have to sign in and enter a MAX code every time |
| Copies of portal pages and data (schedule, courses, grades, messages, profile, names of your personal files…) | portal.ulsu.ru | Your computer, app data folder (`cache`) | To open instantly, work offline and search. Search reads these copies; its index stays in memory and is not saved |
| Presentations you open | portal.ulsu.ru | Your computer, app data folder (`opened`); on Android, Downloads | So your system app can open them. Clear cache and Log out remove the `opened` folder |
| Session log (time of sign-in, sign-out, lost sessions; no personal content) | The app | Your computer (`session.log`) | To understand how long portal sessions last |
| Settings (theme, language, accent, collapsed sidebar, sort order, Today layout) | You | Your computer | To remember your choices |
| Courses filter and sort | You | The portal's own settings for your account (the same ones its Course overview uses) | So the app and the website show the same choice on every device |
| Archived chats, pinned chats and their order, chats you marked unread | You | Your computer, plus a small file `ulportal-sync/sync.json` in your personal files on the portal | So these choices are the same on all your devices. Deleting that folder on the portal stops sharing them; each device keeps its own copy |
| Files you upload or download | You / the portal | Your chosen folder; uploads go to your personal files on the portal | Only when you ask |

The app data folder is `%APPDATA%\ulportal` on Windows and `~/Library/Application Support/ulportal` on macOS. On Android everything stays in the app's private storage, which other apps can't read; uninstalling the app deletes it. The Android background check (about every 15 minutes) talks only to portal.ulsu.ru, and its notifications are created on the phone itself.

## Where data is sent

- **portal.ulsu.ru**: all requests needed to show your data and to perform actions you confirm. This is the same traffic a browser sends when you use the portal.
- **Sites you open yourself**: e-library links (e.g. Lan, Urait, Znanium, IPR SMART, eLIBRARY) open in your default browser. These links contain sign-in details that the portal creates for you. What those sites do is governed by their own policies.
- **Boosty, only if you click.** The optional **Support the project** button opens boosty.to in your default browser, without your portal session. The app itself never contacts Boosty, and Boosty's own policy applies there.
- **GitHub, for update checks.** Every 6 hours while the app runs, and when you press **Check for updates** in About, the app sends one request to api.github.com to read the latest release number. It includes the app version in the User-Agent and no personal data. If a newer version exists, the app says so and links to the release page; it never downloads or installs anything by itself. **Settings → Updates → Only on request** limits this to the button.
- **Developer announcements (Supabase).** At start, every hour, and when you come back to the app (at most every 15 minutes) the app reads the list of current notices (for example "the portal changed, please update") from the developer's Supabase project (supabase.co, EU region). This is a plain read. It sends no personal data, no portal data and no identifier. The app filters the list by version and platform on your device. Like any web request it reveals your IP address to Supabase, whose own policy applies. **Settings → Developer announcements → Don't check** turns it off.
- **Nothing else.** No analytics, tracking, telemetry, crash reports or advertising.

## Notifications

The app checks the portal for new notifications and messages every few minutes while it runs, including from the tray / menu bar. Notification text is shown by your operating system on your computer and is not sent anywhere else.

## Deleting your data

- **Settings → Log out** ends the portal session and deletes the saved cookies and cached copies.
- **About → Clear cache** deletes cached copies but keeps you signed in.
- To remove everything, uninstall the app and delete the app data folder (see above).

Data stored on the portal itself (your account, messages, files, orders) is managed by the university, not by this app.

## Russian personal data law (152-ФЗ)

The app's developer does not obtain or process your personal data: processing happens on your device at your own initiative, and on the university's portal under the university's policies. The developer is therefore not a personal data operator for this app.

## Children

The app is meant for ULSU students and staff and does not knowingly collect anything from anyone.

## Changes

Changes to this policy are published in the project's repository with the date above updated. The full history is visible in the repository.

## Questions

Open an issue: https://github.com/RGB-Outl4w/UlSU-Portal-Desktop/issues
