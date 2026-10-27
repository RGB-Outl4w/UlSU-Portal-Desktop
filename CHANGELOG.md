# Changelog / История изменений

## 1.2.0 — 2026-10-27

**Android app.** / **Приложение для Android.**

**English**
- Android 10+ app (`.apk`): the same sections as on desktop, in a phone layout: a bottom tab bar, a More sheet, and list → detail for messages and notifications. The back button works, and there are light and dark themes.
- Sign-in on the real portal page inside the app. When there's no live session it opens straight away, and after sign-in the app takes over smoothly. The session survives the app being closed.
- Background check about every 15 minutes: notifications for new portal notifications and messages, and when the session ends. It also keeps the session alive (Android may run it less often to save battery). Tapping a notification opens its section.
- PDFs open in the phone's own viewer; downloads go to Downloads.
- Since 1.2.0-beta.1: the app's own icon and launch screen, no flash or text selection when tapping buttons, and a tidier course header on phones.
- Windows and macOS: no changes for users.

**Русский**
- Приложение для Android 10+ (`.apk`): те же разделы, что на компьютере, в телефонном интерфейсе: нижняя панель вкладок, лист «Ещё», список → подробности для сообщений и уведомлений. Работает кнопка «Назад», есть светлая и тёмная тема.
- Вход на настоящей странице портала внутри приложения. Если живой сессии нет, страница входа открывается сразу, а после входа плавно сменяется приложением. Сессия сохраняется и после закрытия приложения.
- Фоновая проверка примерно раз в 15 минут: уведомления о новых уведомлениях и сообщениях портала и о завершении сессии. Она же поддерживает сессию (для экономии батареи Android может запускать её реже). Нажатие на уведомление открывает нужный раздел.
- PDF открываются в программе просмотра на телефоне; файлы сохраняются в «Загрузки».
- После 1.2.0-beta.1: собственный значок и экран запуска, кнопки не подсвечиваются и не выделяются при нажатии, аккуратнее шапка курса на телефоне.
- Windows и macOS: для пользователей ничего не изменилось.

## 1.2.0-beta.1 — 2026-10-27 (pre-release)

**Android app.** / **Приложение для Android.**

**English**
- Android 10+ app (`.apk`): the same sections as on desktop, in a phone layout: a bottom tab bar, a More sheet, and list → detail for messages and notifications. The back button works, and there are light and dark themes.
- Sign-in on the real portal page inside the app; the session survives the app being closed.
- Background check about every 15 minutes: notifications for new portal notifications and messages, and when the session ends. It also keeps the session alive (Android may run it less often to save battery).
- PDFs open in the phone's own viewer; downloads go to Downloads.

**Русский**
- Приложение для Android 10+ (`.apk`): те же разделы, что на компьютере, в телефонном интерфейсе: нижняя панель вкладок, лист «Ещё», список → подробности для сообщений и уведомлений. Работает кнопка «Назад», есть светлая и тёмная тема.
- Вход на настоящей странице портала внутри приложения; сессия сохраняется и после закрытия приложения.
- Фоновая проверка примерно раз в 15 минут: уведомления о новых уведомлениях и сообщениях портала и о завершении сессии. Она же поддерживает сессию (для экономии батареи Android может запускать её реже).
- PDF открываются в программе просмотра на телефоне; файлы сохраняются в «Загрузки».

## 1.1.0 — 2026-10-25

**macOS support.** / **Поддержка macOS.**

**English**
- macOS builds for Apple Silicon and Intel (`.dmg`, `.zip`): native window with traffic lights and a translucent sidebar, app menu, menu bar icon, Dock, ⌘ shortcuts, "Open at login".
- Calendar opens at once even when the portal is slow to answer its first calendar request; events arrive afterwards.
- Alerts when the portal ends your session (with a "Sign in" button) and during portal maintenance (saved data stays visible).
- Ctrl/⌘K search shows icons for every section.
- Update check understands pre-releases.
- macOS: the build isn't notarized by Apple yet; see the first-launch steps in the README.

**Русский**
- Сборки для macOS на Apple Silicon и Intel (`.dmg`, `.zip`): нативное окно со «светофором» и полупрозрачной боковой панелью, меню приложения, значок в строке меню, Dock, сочетания с ⌘, «Открывать при входе в систему».
- Календарь открывается сразу, даже если портал долго отвечает на первый запрос календаря; события подгружаются следом.
- Предупреждения, когда портал завершил сессию (с кнопкой «Войти»), и во время техработ на портале (сохранённые данные остаются видны).
- В поиске Ctrl/⌘K у всех разделов есть значки.
- Проверка обновлений понимает тестовые версии.
- macOS: сборка пока не заверена Apple — шаги первого запуска есть в README.

## 1.1.0-beta.2 — 2026-10-25 (pre-release)

Fixes from the first macOS test round. / Исправления по итогам первого круга тестов на macOS.

**English**
- macOS: the window no longer flashes half-transparent when brought back from the Dock or menu bar.
- Ctrl/⌘K search: Messages and Notifications now have their icons.
- Calendar opens right away: the portal's first calendar request in a session can take minutes, so classes and saved events show immediately and fresh events appear when ready. The current month is also loaded in the background shortly after start.
- If the portal ends your session (for example from its side), a bar with a "Sign in" button appears, plus a system notification when the window is hidden.
- During portal maintenance the app shows saved data with an "under maintenance" bar instead of empty sections.

**Русский**
- macOS: окно больше не появляется полупрозрачным при возврате из Dock или строки меню.
- Поиск Ctrl/⌘K: у «Сообщений» и «Уведомлений» появились значки.
- Календарь открывается сразу: первый запрос календаря к порталу за сессию может идти минутами, поэтому занятия и сохранённые события показываются сразу, а свежие события подгружаются следом. Текущий месяц также подгружается в фоне вскоре после запуска.
- Если портал завершил сессию (например, со своей стороны), появляется плашка с кнопкой «Войти», а при скрытом окне — системное уведомление.
- Во время техработ на портале приложение показывает сохранённые данные с плашкой «Портал на техническом обслуживании», а не пустые разделы.

## 1.1.0-beta.1 — 2026-10-25 (pre-release)

First macOS test build. / Первая тестовая сборка для macOS.

**English**
- macOS: separate builds for Apple Silicon (arm64) and Intel (x64), `.dmg` and `.zip`.
- Native macOS window: traffic lights, translucent sidebar, app menu (⌘C/⌘V/⌘Q/⌘W work), menu bar icon, Dock.
- ⌘ shortcuts on macOS (⌘K, ⌘R, ⌘1–9, ⌘B); "Open at login" in the menu bar icon's menu.
- Update check now understands pre-releases; beta builds are told about newer betas too.
- Privacy policy lists the macOS data folder.

**Русский**
- macOS: отдельные сборки для Apple Silicon (arm64) и Intel (x64), `.dmg` и `.zip`.
- Нативное окно macOS: «светофор», полупрозрачная боковая панель, меню приложения (работают ⌘C/⌘V/⌘Q/⌘W), значок в строке меню, Dock.
- Сочетания с ⌘ на macOS (⌘K, ⌘R, ⌘1–9, ⌘B); «Открывать при входе в систему» в меню значка.
- Проверка обновлений понимает тестовые версии и сообщает о более новых бета-версиях.
- В политике конфиденциальности указана папка данных macOS.

**macOS first launch / Первый запуск на macOS:** the build isn't notarized by Apple yet. macOS 15+: open it once, then System Settings → Privacy & Security → "Open Anyway". macOS 12–14: Control-click the app → Open. / Сборка пока не заверена Apple. macOS 15+: попробуйте открыть, затем «Системные настройки → Конфиденциальность и безопасность → Всё равно открыть». macOS 12–14: правый клик по приложению → «Открыть».

## 1.0.0 — 2026-10-25

First public release. / Первый публичный выпуск.

**English**
- Stays signed in: the portal session is saved for up to 30 days and kept alive while the app runs (also from the tray).
- Today screen with a live "now / next class" banner, schedule with I/II weeks, month calendar.
- Courses inside the app: sections, completion, materials, PDF viewer, participants, favourites.
- Deadlines, grades, academic record with averages, study plan with hours.
- Notifications and messages with Windows notifications and unread badges.
- Services: certificate orders, questions to the university, personal files, e-library links.
- Works offline from saved copies; Russian and English interface; light/dark themes.
- About screen, privacy policy, MIT license; update check on request.

**Русский**
- Не нужно входить заново: сессия портала хранится до 30 дней и поддерживается, пока приложение работает (в том числе из трея).
- Экран «Сегодня» с баннером «идёт сейчас / следующая пара», расписание с I/II неделями, календарь на месяц.
- Курсы внутри приложения: разделы, отметки о выполнении, материалы, просмотр PDF, участники, избранное.
- Дедлайны, оценки, успеваемость со средним баллом, учебный план с часами.
- Уведомления и сообщения с уведомлениями Windows и счётчиками непрочитанного.
- Сервисы: заказ справок, вопросы университету, личные файлы, ссылки на электронные библиотеки.
- Работа без сети по сохранённым копиям; русский и английский интерфейс; светлая и тёмная темы.
- Раздел «О приложении», политика конфиденциальности, лицензия MIT; проверка обновлений по кнопке.

**Installation note / Установка:** the installer isn't code-signed yet, so Windows SmartScreen may warn on first run: choose "More info" → "Run anyway". / Установщик пока без цифровой подписи, поэтому SmartScreen может предупредить при первом запуске: «Подробнее» → «Выполнить в любом случае».
