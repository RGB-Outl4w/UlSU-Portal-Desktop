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
**TODO — session expired banner (item 5):** when `poll()` sees the session is dead, main process sends `session-expired` to the renderer. The renderer shows a non-blocking banner "Сессия истекла — войти" at the top instead of a login window popping up on the next click. Requests that fail meanwhile go into a queue and replay after login. Hook point: the `sesskey = null` branch in `poll()` in `main.js`.

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
