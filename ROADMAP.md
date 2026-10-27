# ULSU Portal app — roadmap

Findings from crawling portal.ulsu.ru (Moodle 3.7, theme `space`, many custom `CDO/`, `blocks/`, `ulsu/` pages).
Each milestone lists the data source so it can be built without re-exploring.

Legend: **AJAX** = `/lib/ajax/service.php` with sesskey (works), **HTML** = scrape page with `DOMParser`, **JSON** = custom endpoint.

---

## M1. Session that survives (top priority)

Problem: `MoodleSession` is a plain session cookie (no expiry, not HttpOnly). Browsers drop it on close, so every reopen means login + MAX 2FA again.

Plan:
1. **Persist the cookie.** On `ses.cookies.on('changed')` for `MoodleSession`, re-set it with `expirationDate` far in the future. Chromium then saves it to disk and restores it on restart.
2. **Keep the server session warm.** The server also expires idle sessions (`sessiontimeout`, unknown value). A main-process timer pings a cheap logged-in AJAX call every ~10 min (`core_user_get_user_preferences` works; `core_session_touch` does not exist in 3.7). Also ping when the system wakes from sleep (`powerMonitor` `resume`).
3. **Run in tray.** Closing the window hides it to the tray, so pings continue. Optional autostart with Windows (`app.setLoginItemSettings`).
4. **Measure.** Log when a request first hits the login page. That tells us the real server timeout and tunes the ping interval.
5. **Re-login UX.** If the session still dies, show a calm in-app banner "Сессия истекла — войти" instead of popping a window mid-action. Queue failed requests and replay them after login.
6. **Check 2FA "remember device".** Look for a trust cookie set after the MAX step. If one exists, persist it the same way.

Done when: close app, reopen next day, data loads with no login.

**Status (2026-10-25):** 1, 2, 3 done and verified (quit + relaunch opens without login). 4 partly: `poll()` (was `ping()`) writes to `%APPDATA%\ulportal\session.log`; read it after a few days to learn the real timeout and tune `POLL_MS`. 6 checked: no "remember device" cookie seen after the MAX step.
**Done in 1.1.0 — session expired banner (item 5):** when `poll()` sees the session is dead, main process sends `session-expired` to the renderer. The renderer shows a non-blocking banner "Сессия истекла — войти" at the top instead of a login window popping up on the next click. Requests that fail meanwhile go into a queue and replay after login. Hook point: the `sesskey = null` branch in `poll()` in `main.js`.

## M2. Dashboard and profile

- **Profile card** (`/my/`, block `proffesional_info`, HTML): name, faculty, level, specialty, profile, form, funding, year, group. Shown in sidebar header.
- **Today screen**: today's pairs + next pair countdown, upcoming deadlines (3), unread notifications count, debts badge.
- **Debts** (`/blocks/buttons/debts.php`, HTML): academic debts count, financial debt sum.

**Status (2026-10-25):** done. Сегодня tab (default, Ctrl+1): greeting + week parity, live "идёт сейчас / следующая пара" banner (updates every 30 s), today's pairs or next school day, 4 upcoming deadlines, last 5 Moodle notifications + unread count, debts tiles (`.academy-counter`, `.finance-counter`). Profile card at the bottom of the sidebar with a details popover (`#table_info`). The debts page shows item lists only when non-zero; their markup is unknown, so details open the portal page.

## M3. Academic records

- **Успеваемость** (`/blocks/buttons/academic_progress.php`, HTML): per-semester tables — subject, date, control type, mark, retake, teacher. Semester tabs, GPA calc.
- **Учебный план** (`/CDO/eduplan.php`, HTML): 8 semester tables — code, subject, control form, hours (lectures/practice/labs/self-study), method materials with links.
- **Текущая успеваемость** (`/CDO/academic_progress_inside.php`, HTML): empty for now; parse when it has data.
- **Course grades detail** (`/course/user.php?mode=grade&id=…`, HTML): per-item grades behind each row of current Оценки view.

**Status (2026-10-25):** Успеваемость (Ctrl+6) and Учебный план (Ctrl+7) done. Успеваемость: semester filter, KPI tiles (exam GPA, exam count, credits passed, retakes), marks colour-coded, "Оценить" opens the quality survey. Учебный план: semester 1–8 (opens on the current one, worked out from the profile year), semester totals, stacked hours bar (lectures/practice/labs/self-study, palette checked with the dataviz validator), syllabus link, materials list. Still open: Текущая успеваемость (page empty for now), per-course grade detail.

## M4. Courses inside the app

`core_course_get_contents` is disabled, so parse `/course/view.php?id=…` (HTML, format `topics`):
- Sections (`li.section`, `.sectionname`), activities (`li.activity`, `modtype_*`: forum, resource, page, quiz, label, assign…), completion checkboxes.
- Native rendering for `label`, `page`, `resource` (download / open PDF in app). Quiz/assign/forum open in a portal window.
- Favourites, hide finished courses, recent courses (`core_course_get_recent_courses`, AJAX).
- Clean course names (strip `ИС_О_25/1_…_номер` noise; use `fullname` from AJAX).

**Status (2026-10-25):** done. A course opens inside the app (hidden view `course`, sidebar keeps Курсы highlighted) with tabs:
- Содержание: sections and activities with completion; manual items toggle via POST `/course/togglecompletion.php`.
- Материалы: grouped by type from the activity icon.
- Участники: from `/user/index.php`; «Написать» opens the chat, or a draft chat that `core_message_send_instant_messages` turns into a real one.
Pages open in a reader dialog (images and embeds sanitized). PDFs and videos are fetched by the main process (`file()`) and shown from `blob:`, because a frame in the app is cross-site to the portal and the Lax session cookie isn't sent. Images from `pluginfile.php` use the same route (`portalImg`). Курсы: favourites (`core_course_set_favourite_courses`, always sorted first), filters Избранные/Незавершённые, «Недавние» chips. Сегодня is now two aligned columns. Not done: folder contents, presentations in-app (they open on the portal).

## M5. Calendar

- Month grid: `core_calendar_get_calendar_monthly_view` {year, month} (AJAX). Day view: `core_calendar_get_calendar_day_view` (AJAX).
- Merge timetable pairs (schedule block) with Moodle events in one calendar.
- Export: link to `/calendar/export.php` (iCal).

**Status (2026-10-25):** done. Календарь tab (Ctrl+3): month grid (Mon–Sun) with pair counts and event chips (deadlines in orange), day panel with events + pairs, ‹ › month navigation with slide, Сегодня button, iCal export link. The schedule block only ever returns current + next week (parameters are ignored), so weeks 2–8 ahead show pairs guessed from the I/II alternation, faded and labelled "по чередованию I/II". The guess ignores holidays and semester end. Filter Всё/Занятия/События fades chips in place without a rebuild.

**UX rule (from feedback):** filter/sort/tab-within-view changes use `swap(nodes, true)` ("quiet": one soft 0.2 s fade, no cross-fade or stagger). Full transitions are only for switching views. Repeated toggling must never flash the screen.

## M6. Notifications and messages

- Moodle notifications: `message_popup_get_popup_notifications` {useridto}, unread count `message_popup_get_unread_popup_notification_count` (AJAX).
- Conversations: `core_message_get_conversations` {userid}, unread `core_message_get_unread_conversations_count` (AJAX). Send/read via `core_message_*`.
- University notice center: `/blocks/cdo_notif_center/api.php?method=getMessages` (JSON).
- Polling every few minutes from main process; Windows toast (`Notification`) for new items; unread badge on tray icon.
- `userid` comes from `[data-userid]` on `/my/`.

**Status (2026-10-25):** done. Уведомления tab (Ctrl+5): list + reading pane, filters Все/Непрочитанные/Объявления, "Прочитать все", item marked read on open. The notice center's items already come through `message_popup_get_popup_notifications` (`component: block_cdo_notif_center`), so `api.php` isn't needed. Сообщения tab (Ctrl+6): conversations with search, chat bubbles, conversation marked read on open, sending via `core_message_send_messages_to_conversation` (plain text) — **sending not tested yet**. Portal HTML is shown through a tag whitelist (`rich()`). Main process `poll()` every 3 min replaces the old ping: unread counts go to sidebar badges and the tray tooltip, toasts appear for new items (not on the first run), and the taskbar flashes when the window isn't focused. Still open: starting a new conversation (`core_message_message_search_users`), live chat refresh.

## M7. Services and files

- **Личные файлы** (`/user/files.php`): quota text is HTML; file list needs Moodle filepicker endpoint (`/repository/draftfiles_ajax.php`, needs draft itemid from page). Upload/download.
- **Заказ справок** (`/CDO/inquiry/index.php`, HTML form): list of certificate types, current orders with status. Ordering = form submit (confirm with user each time).
- **Задать вопрос** (`/CDO/questionizer.php`): topic + question form.
- **Library links** (block `buttons`): signed SSO links to ЭБС (Лань, Юрайт, Znanium, IPR SMART…). Links are generated per page load, so fetch `/my/` fresh before opening. Open in external browser.
- **Other**: questionnaires, ВКР, elective courses, open online courses, e-publications (`/blocks/ulsu_redact/ei.php`), portfolio (exaport). Start as "open in portal window" tiles; go native only if used.
- Not available: badges (disabled on site), mobile app API (`enablemobilewebservice=0`).

**Status (2026-10-25):** done. New Сервисы tab with sub-tabs:
- **Справки:** order list with status. Ordering is two steps: type, then the portal's request form, rendered generically.
- **Вопрос:** sends via GET `/CDO/lib.php?API=sendQ` with `get(..., 'live')` so it is never cached.
- **Личные файлы:** quota, folders and breadcrumbs. PDFs open in the viewer; other files download through a save dialog. Upload goes through `repository_ajax.php` and delete through `draftfiles_ajax.php`, each followed by saving the `/user/files.php` form to commit the draft.
- **Библиотеки и сервисы:** library SSO links plus portal service tiles. Only links whose signature has a timestamp (Юрайт, Znanium, IPR SMART) need a set signed less than 3 min ago; it renews in the background past half-life and when hovering the tab. The others open instantly.

Every write asks first through the styled `confirmBox`. **Not tested end-to-end (they change real data):** ordering a certificate, sending a question, upload, delete. Test upload/delete with a throwaway file.
Also from this round: a background refresh no longer repaints when the data is unchanged; when it did change, it swaps silently (`swap(nodes, 'silent')`). Segmented pills no longer grow from zero when the toolbar is rebuilt.

## M8. UI overhaul

- Design system: CSS tokens for color, radius, spacing, shadows, motion durations. Light/dark + manual toggle + accent color picker.
- Motion: view transitions (`document.startViewTransition`) between screens, staggered card entry, skeleton loaders instead of "Загрузка…", hover lift, progress bar fill animation, smooth week switch slide.
- Window: frameless with custom title bar (`titleBarStyle: 'hidden'` + `titleBarOverlay`), Windows 11 Mica (`backgroundMaterial: 'mica'`).
- Layout: collapsible sidebar with icons, command palette (Ctrl+K) to jump to course/page, keyboard shortcuts.
- Accessibility: focus rings, `prefers-reduced-motion` turns animations off.

**Status (2026-10-25):** done. Mica + custom title bar, theme (system/light/dark via `nativeTheme`) and accent picker, sliding nav/segment pills, view transitions, staggered entry, skeletons, collapsible sidebar, Ctrl+K palette (sections, courses, portal pages), shortcuts by physical key (Ctrl+1–4, R, B, K). ULSU branding (`logo.svg`, `icon.png`, portal blue `#0d45ca`). Sort/filter on Курсы and Оценки. Views are cached per session; Ctrl+R reloads.

## M9. Speed and offline

- Cache last response of each view on disk (`app.getPath('userData')`). Show cached data instantly, refresh in background.
- Works offline for schedule, grades, plan; banner shows "offline, data from HH:MM".

**Status (2026-10-25):** done, tested with the network blocked (`--proxy-server=127.0.0.1:9`).
- Main `cached()` writes every page read and every `*_get_*` AJAX read to `%APPDATA%\ulportal\cache\<sha1>.json`. Writes are never cached. Logout deletes the folder.
- Each tab paints the disk copy first, then refreshes from the network and repaints quietly.
- When the network fails, any read (chats, participants, calendar months) falls back to its disk copy (`viaDisk`), and an orange bar shows "Нет подключения к порталу · данные от …" with Повторить. The view auto-refreshes on `online`.
- Never-opened sections and failures show a styled `stateBox`. All error text goes through `errText()`.
- Portal and login windows show `offline.html` instead of a white page.
- Not cached: PDFs and videos (open online only). Deadline requests now start at midnight so their cache key is stable all day.

## M10. Packaging

- `electron-builder` NSIS installer, app icon, auto-update via GitHub Releases.
- Git repo + basic CI build.

**Status (2026-10-25):** done.
- `npm run dist` builds `dist/ULSU-Portal-Desktop-Setup-<version>.exe`: NSIS, x64, per-user, RU/EN installer, choice of folder, shortcuts named "УлГУ · Портал студента". It is unsigned, so SmartScreen warns on first run.
- `main.js` pins userData to `%APPDATA%\ulportal`, so the product name never moves the session or cache.
- Updates: no auto-update (privacy). About has "Проверить обновления", which asks api.github.com for the latest release only on click and links to the download.
- CI: `.github/workflows/build.yml` builds on every `v*` tag. It checks the tag against package.json and creates a **draft** release with the installer, which is published by hand. Release notes go in `CHANGELOG.md`.
- To release: bump `version` in package.json, add a CHANGELOG entry, then commit, `git tag vX.Y.Z` and `git push --tags`. Review the draft on GitHub and publish it.
- Later: code signing (removes the SmartScreen warning).

---

## Order

M1 → M8 (base UI kit, so new screens use it) → M2 → M3 → M6 → M5 → M4 → M9 → M7 → M10.

## Rules for every milestone

- Never automate login, password or the MAX code. User always types them in the real portal page.
- Any action that changes data on the portal (submit form, send message, order certificate, upload) asks for confirmation.
- Don't store personal data outside the app's own session/cache folder.

---

# Platforms (after 1.0.0)

The app stays "Desktop": macOS comes first, Android later. iOS is out of scope for now (needs a Mac, a paid Apple account, background limits, App Store review risk for an unofficial ULSU app).

## P1. macOS build pipeline

- `build.mac` in package.json: targets `dmg` + `zip`, separate `arm64` (Apple Silicon) and `x64` (Intel) builds, `category: public.app-category.education`.
- No Apple Developer account yet: builds are **ad-hoc signed** (required on Apple Silicon) and not notarized. Check with `codesign --verify --deep --strict` in CI.
- CI: add a `macos-latest` job to `.github/workflows/build.yml` next to the Windows job. On `v*` tags both attach to the same draft release. A manual run (`workflow_dispatch`) produces **test builds** as artifacts.
- Test builds go out as a GitHub **pre-release** (`v1.1.0-beta.N`), so no GitHub login is needed to download.
- Done when: CI produces `ULSU-Portal-Desktop-<ver>-arm64.dmg` and `-x64.dmg`, and they launch on a Mac.

**Status (2026-10-25):** done in CI (manual run).
- Artifacts: `-arm64`/`-x64` `.dmg` + `.zip`, both `Signature=adhoc`, `codesign --verify --deep --strict` passes, `lipo` shows arm64 / x86_64.
- Smoke test on the macos-26 arm64 runner: the packaged app starts, draws its window (welcome dialog, sidebar, skeletons) and quits cleanly (`ULPORTAL_SMOKE`).
- Seen for P2: the traffic lights sit over the sidebar logo; the shortcut label still says "Ctrl K".
- Not yet verified on a real Mac (Gatekeeper first launch, Intel build).

## P2. macOS adaptations

Code that is Windows-specific today, by file:
- **main.js — window:** no `backgroundMaterial: 'mica'` or `titleBarOverlay` on macOS. Use `titleBarStyle: 'hiddenInset'` with `trafficLightPosition`, and `vibrancy: 'sidebar'` for the translucent sidebar.
- **main.js — menu:** `Menu.setApplicationMenu(null)` breaks ⌘C/⌘V/⌘Q/⌘W on macOS. It needs a minimal role-based app menu (App, Edit, View, Window).
- **main.js — tray → menu bar:** a monochrome `iconTemplate.png` (16 + 32 px @2x). Closing the window keeps the app in the menu bar and Dock. The Dock click (`activate`) shows the window again.
- **main.js — notifications:** `setAppUserModelId` is Windows-only. macOS asks for notification permission on the first toast.
- **main.js — autostart:** `setLoginItemSettings({ openAtLogin, openAsHidden })` instead of the `--hidden` args.
- **app.js:** shortcuts use `ctrlKey` → use `metaKey` on macOS (⌘K, ⌘R, ⌘1–9, ⌘B). Labels such as "Ctrl K" become "⌘K" (`navigator.platform` / `process.platform` via preload).
- **app.css:** title strip, drag regions and sidebar top padding make room for the traffic lights (left, not right). Under vibrancy, `body` stays transparent only on macOS.
- **Docs and UI text:** data folder `~/Library/Application Support/ulportal` (PRIVACY, About, README). Site: per-OS download buttons.
- **Update check:** link to the release page (unchanged); the user picks arm64 or x64.
- Done when: the macOS test checklist passes on Apple Silicon and, if available, Intel.

**Status (2026-10-25):** implemented. CI full-screen capture on macOS 26 (arm64) shows:
- traffic lights in the title strip, with the sidebar starting below them; sidebar vibrancy;
- app menu (app name / Edit / View / Window), template icon in the menu bar, Dock icon, ⌘K label;
- the sign-in window opens as a native sheet of the main window.

Windows is unchanged (local smoke run). Still needs a real Mac: ⌘ shortcuts, Edit-menu clipboard in text fields, Dock/menu-bar behaviour, "Open at login", notification permission, Gatekeeper first launch, Intel build.

## P3. Test rounds on real Macs

- Testers install the pre-release and report through the **Bug report** issue form (platform: macOS).
- Fix → new pre-release → retest, until the checklist is green.
- Done when: no open `macos` issues marked blocker.

**Status (2026-10-25):** done.
- beta.1 found three issues: half-transparent window on return from the Dock (macOS), missing ⌘K icons for Messages/Notifications, and a very slow first calendar load (the portal's own cold cache, ~25 s to minutes).
- All three are fixed in beta.2 and confirmed by the tester. Session-ended and maintenance alerts were added on the way (M1 item 5).

## P4. macOS release

- Version 1.1.0 ships with Windows + macOS assets. README and site get macOS install steps (including the first-launch "Open Anyway" step). CHANGELOG entry.
- Later, optional: Apple Developer account ($99/year) → sign + notarize, which removes the Gatekeeper warning.

**Status (2026-10-25):** 1.1.0 released with Windows + macOS assets. README (EN/RU) has a download table and macOS first-launch steps. The site's download buttons pick the exact file for each OS from the latest release (via the GitHub API, falling back to the release page). CHANGELOG entry added.

## Android (later, outline only)

- **A1:** Capacitor shell around the same `app.js`/`app.css`/`i18n.js`; `main.js` duties move to a small native-bridge layer:
  - sign-in in an in-app portal page;
  - cookie persistence;
  - `CapacitorHttp` for portal requests (no CORS, shares cookies);
  - file cache;
  - downloads.

  **Status (2026-10-27):** working on the emulator (Android 15, debug APK).
  - Capacitor 8 project in `android/`. `npm run android:sync` copies the UI into `www/` (`build-www.js`) and adds `portal-android.js`, which provides the same `window.portal` as `preload.js`. `app.js` is unchanged, except that PDFs open in the system app.
  - Portal requests go through CapacitorHttp. The offline copy lives in IndexedDB.
  - `UlPortalPlugin.java` handles sign-in and portal pages (an overlay WebView in the activity window; a Dialog put the keyboard under it), Downloads, the theme and version info.
  - The MoodleSession cookie is re-set with a 30-day expiry on sign-in and on pause, so the session survives the app being killed (verified with force-stop).
  - Verified: sign-in with the MAX code, `/my/`, AJAX, files.
  - Not yet: About shows Electron rows, the "Ctrl K" label, `openData`. Unread counts, polling and session events wait for A3.
  - Build: JDK 21 and `android/local.properties` with `sdk.dir`, then `gradlew assembleDebug`. minSdk 29.
- **A2:** mobile layout: bottom tab bar, single-column screens, touch targets ≥ 44 px.

  **Status (2026-10-27):** done on the emulator (Pixel 7 size, light and dark).
  - Below 760 px wide (Android only; the desktop window's minimum is 760), app.css switches to the phone layout. A bottom tab bar has Сегодня, Расписание, Курсы, Сообщения and Ещё; Ещё opens the whole sidebar as a bottom sheet with 48 px rows.
  - Header tools (filters, search) move to their own row, which scrolls sideways.
  - Notifications and messages show the list first; tapping an item opens its detail.
  - The calendar puts the month grid above the day panel; event chips become colour bars.
  - The Android back button closes things in order: a dialog, a popover, the sheet, the detail view. Then it goes up a level, then to Today, then leaves the app.
  - Theme: the activity is recreated on a light/dark change (`uiMode` taken out of `configChanges`), so the WebView's `prefers-color-scheme` follows it.
  - localStorage never reached disk before Android killed the app, so settings and "welcome seen" were lost. It is now mirrored in SharedPreferences (`UlPrefs`).
  - About lists Android and WebView versions; the data-folder row is hidden.
  - An open chat or notification has a ‹ button that returns to the list. Header tools fill the width and wrap onto extra rows. The More sheet uses 44 px rows and up to the full screen height, so it fits without scrolling on a Pixel 7.
  - A settings change that reloads the UI (language; theme on Android) comes back to the same tab with Settings open. A one-shot, timestamped `resume` pref does this.
  - Smoothness (measured with requestAnimationFrame frame times and Long Animation Frames): tab switches, the sheet, list ↔ detail (now a short slide), settings and the palette run at 60 fps on the emulator. Android skips the View Transition snapshot, which cost about 50 ms per switch; the new view still rises in. A theme switch repaints over the theme's own background colour (`res/values*/page.xml` with a transparent WebView) instead of flashing white. The first Courses open after launch takes about 80 ms before its first frame.
  - Fixed: Services' wide tab row made the page wider than the screen, which pushed the tab bar off-screen. The header tools now have `min-width: 0`, and there is a viewport meta tag.
  - Not yet: 44 px for small icon buttons (refresh, month arrows); a real phone.
- **A3:** background check via WorkManager (≥ 15 min); session keepalive best-effort; local notifications.

  **Status (2026-10-27):** working on the emulator.
  - `PortalCheck.java` is the Android version of main.js `poll()`. It sends one `service.php` request with both calls (popup notifications + conversations), using the WebView's cookies and a cached sesskey/userid; on a stale sesskey it looks at `/my/` once.
  - It returns the unread counts and the session state (ok / expired / maintenance).
  - It notifies about new unread items (at most 3 of each kind; the first run only records what exists) and, once, about a session that ended. Seen ids and state live in SharedPreferences `poll`; logout clears them, so a logout doesn't count as an ended session.
  - The app runs it every 3 min while on screen and whenever it comes back (`portal.poll`). This drives the badges and the session bar.
  - WorkManager runs it every 15 min in the background (needs network). It doubles as the keepalive; Doze can stretch the interval, so the keepalive is best-effort.
  - Android 13+ asks for notification permission once, after the first session is seen. A notification tap opens its view (Notifications / Messages / Today), from a cold start too.
  - Verified with a temporary test build that treated read items as new: the foreground path, the background job starting the app with no UI (cookies work), the bell status icon, and tap → Messages.
  - Not verified: the "session ended" notification (it needs a real expiry); how long the session survives overnight under Doze.
  - Capacitor's console logging is off (`loggingBehavior: none`): debug builds were printing every portal response to logcat.
- **A4:** APK in GitHub Releases. Google Play later ($25 one-time).

  **Status (2026-10-27):** ready locally; CI not run yet.
  - The APK's version comes from package.json. versionCode = major·1000000 + minor·10000 + patch·100 + (beta number, or 99 for a release), so every pre-release sorts below its release.
  - Release key: `~/.android/ulportal-release.jks` (PKCS12, alias `ulportal`), with its password in `ulportal-release-keystore.txt` next to it. **Back it up:** losing it means users can't update without uninstalling.
  - Gradle signs when the `ULPORTAL_KEYSTORE` / `ULPORTAL_KEYSTORE_PASSWORD` env vars are set.
  - A local signed build passes `apksigner verify`. It installs on a clean emulator, isn't debuggable, and opens the portal sign-in page.
  - CI: an `android` job (JDK 21) builds `ULSU-Portal-Android-<version>.apk`, checks the signature, and joins the release with the Windows and macOS files. It needs the repo secrets `ANDROID_KEYSTORE` (the .jks, base64) and `ANDROID_KEYSTORE_PASSWORD`.
  - README (EN/RU) has an Android row and install steps; PRIVACY (EN/RU) describes Android storage and the background check; the site has an Android button (the main one on Android phones); CHANGELOG has an Unreleased entry.
  - 1.2.0-beta.1 was published as a pre-release on 2026-10-27. All 4 CI jobs passed. The `ULSU-Portal-Android-1.2.0-beta.1.apk` asset (versionCode 1020001) is signed with the release key (SHA-256 `36c93229…a04a23`).
  - After beta.1: the app's own launcher icon and launch screen, a sign-in overlay that opens before the app draws (spinner, fades, the portal page hidden after sign-in), no tap highlight or sticky hover on touch, and a stacked course header on phones.
  - **1.2.0 released (2026-10-27)** with Windows, macOS and Android assets. README/site describe the Android install.
  - Next: Google Play listing (optional, $25 one-time); more real-phone feedback.
