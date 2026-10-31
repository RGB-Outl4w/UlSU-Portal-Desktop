# Changelog / История изменений

## 1.2.6-beta.2 — 2026-10-31 (pre-release)

**Sign-in fix.** / **Исправление входа.**

**English**
- Sign-in no longer gets stuck after the MAX code. If the session ended while the app was fetching a file (such as the sync file), the portal sent the sign-in window to that file after you signed in: the desktop app asked where to save `sync.json`, the Android app downloaded it, and the window stayed open. Now the app sees you're signed in and closes the window.

**Русский**
- Вход больше не зависает после кода из MAX. Если сессия заканчивалась, пока приложение загружало файл (например, файл синхронизации), после входа портал открывал этот файл в окне входа: на компьютере появлялся вопрос, куда сохранить `sync.json`, на Android файл скачивался, а окно оставалось открытым. Теперь приложение понимает, что вход выполнен, и закрывает окно.

## 1.2.6-beta.1 — 2026-10-31 (pre-release)

**Session diagnostics.** / **Диагностика сессии.**

**English**
- Desktop: the session log (`%APPDATA%\ulportal\session.log`) now records app start, quit, sleep and wake, and every ended session, including one found when a page or file opens. Each entry says how long it had been since the portal last answered, even across restarts. This helps find out what ends portal sessions so early.

**Русский**
- Компьютер: журнал сессии (`%APPDATA%\ulportal\session.log`) теперь записывает запуск, выход, сон и пробуждение, а также каждое завершение сессии, в том числе обнаруженное при открытии страницы или файла. В каждой записи указано, сколько прошло с последнего ответа портала, даже после перезапуска. Это поможет понять, почему сессия на портале заканчивается так рано.

## 1.2.5 — 2026-10-29

**Sync fixes.** / **Исправления синхронизации.**

**English**
- Android: synced pins, archive and unread marks now actually reach the phone. The phone couldn't read the shared sync file, took it as missing and overwrote it with its own copy; this also broke archive sync in earlier versions.
- Sync never overwrites newer data: before writing, the app reads the shared file again and keeps the newer copy of each part.
- A change made while a sync is running is sent right after it instead of at the next check.
- Desktop: settings (Today layout, theme, filters, chat state) are also saved to a file at once, so an update or a forced quit no longer resets them.
- Phones: the chat and notification lists use the full width again.

**Русский**
- Android: закрепление, архив и отметки «непрочитано» теперь действительно доходят до телефона. Телефон не мог прочитать общий файл синхронизации, считал, что его нет, и перезаписывал своей копией; из-за этого в прошлых версиях не синхронизировался и архив.
- Синхронизация больше не затирает более новые данные: перед записью приложение заново читает общий файл и оставляет более свежую версию каждой части.
- Изменение, сделанное во время синхронизации, отправляется сразу после неё, а не при следующей проверке.
- Компьютер: настройки (вид «Сегодня», тема, фильтры, состояние диалогов) сразу сохраняются и в файл, поэтому обновление или принудительное закрытие их больше не сбрасывает.
- Телефон: списки диалогов и уведомлений снова занимают всю ширину.

## 1.2.4 — 2026-10-29

**Messages, sync and Android polish.** / **Сообщения, синхронизация и доработка Android.**

**English**
- Messages: a new chat appears in the list at once, and sending the first message keeps it open (on phones it used to jump back to the list).
- Messages: a chat is marked read only when you actually see it (the app in front, and on phones the chat itself, not the list). The unread mark clears at once and on your other devices.
- Messages: the list and the open chat refresh by themselves every 20 seconds while Messages is open, loading only new messages.
- Messages: Mark as read / Mark as unread and Pin / Unpin in the menu (right-click, or long press on Android). Up to 5 pinned chats stay at the top in your order; drag the handle to reorder.
- Sync: archived and pinned chats (with their order) and chats marked unread sync between devices; changes show up within a few minutes without reloading. Each part syncs on its own, so changes on two devices don't overwrite each other.
- Avatars in the chat list load reliably: initials show until the picture arrives, and failed loads are retried.
- Courses: the filter and sort now match the portal's Course overview (All, In progress, Future, Past, Starred, Removed from view; Course name or Last accessed) and are shared with the website.
- Tapping outside Settings, the profile card or a menu closes it without also opening what's underneath.
- About: the update buttons are aligned.
- Android: drag the More sheet down to close it.
- Android: a new launch screen with a sharp, animated logo that fades into the app, and a branded loader with a progress bar on portal pages instead of the system spinner.
- Sign-in: the portal's own sign-in page (password, then the MAX code) now looks like the app, in light and dark. It is still the real page: what you type goes only to the portal. An RU | EN switch in its header changes the page language.
- Tablets held upright and narrow windows: the sidebar collapses to icons, the toolbar moves under the title, and the calendar's day panel goes under the month instead of squeezing it.
- Android: text on portal pages no longer breaks into one letter per line; a table too wide for the screen scrolls sideways inside itself.
- The welcome notice now waits for "I agree": reading the privacy policy or the disclaimer no longer closes it, and neither do Back or a tap outside.

**Русский**
- Сообщения: новый диалог сразу появляется в списке, а после первого сообщения остаётся открытым (на телефоне раньше возвращался к списку).
- Сообщения: диалог отмечается прочитанным, только когда вы его действительно видите (приложение на экране, а на телефоне — сам диалог, а не список). Отметка о непрочитанном исчезает сразу и на других устройствах.
- Сообщения: пока открыт раздел, список и открытый диалог обновляются сами каждые 20 секунд, подгружая только новые сообщения.
- Сообщения: в меню (правый клик, на Android — долгое нажатие) есть «Прочитано» / «Непрочитано» и «Закрепить» / «Открепить». До 5 закреплённых диалогов стоят наверху в вашем порядке; порядок меняется перетаскиванием за ручку.
- Синхронизация: архивные и закреплённые диалоги (с порядком) и отметки «непрочитано» синхронизируются между устройствами; изменения появляются за несколько минут без перезагрузки. Каждая часть синхронизируется отдельно, поэтому изменения с двух устройств не затирают друг друга.
- Аватары в списке диалогов загружаются надёжно: до загрузки видны инициалы, неудачные загрузки повторяются.
- Курсы: фильтр и сортировка теперь как в «Обзоре курсов» портала (Все, Текущие, Предстоящие, Прошедшие, Помеченные, Скрытые; Название курса или Последнее посещение) и общие с сайтом.
- Нажатие мимо «Настроек», карточки профиля или меню закрывает их и больше не открывает то, что под ними.
- «О приложении»: кнопки обновления выровнены.
- Android: лист «Ещё» закрывается движением вниз.
- Android: новый экран запуска с чётким анимированным логотипом, плавно переходящим в приложение, и фирменный загрузчик с полосой прогресса на страницах портала вместо системного индикатора.
- Вход: собственная страница входа портала (пароль, затем код MAX) теперь выглядит как приложение, в светлой и тёмной теме. Это по-прежнему настоящая страница: то, что вы вводите, уходит только на портал. Переключатель RU | EN в её шапке меняет язык страницы.
- Планшет в вертикальном положении и узкие окна: боковая панель сворачивается до значков, инструменты переносятся под заголовок, а панель дня в календаре встаёт под месяц, а не сжимает его.
- Android: текст на страницах портала больше не разбивается по одной букве в строке; слишком широкая таблица прокручивается вбок внутри себя.
- Приветствие теперь ждёт «Принимаю»: чтение политики конфиденциальности или отказа от ответственности больше его не закрывает, как и «Назад» или нажатие мимо.

## 1.2.3 — 2026-10-29

**Profile picture fix.** / **Исправление фото профиля.**

**English**
- A profile picture changed on one device now shows on your other devices too. Before, the picture only appeared after signing in again there.

**Русский**
- Фото профиля, изменённое на одном устройстве, теперь видно и на других. Раньше оно появлялось там только после повторного входа.

## 1.2.2 — 2026-10-28

**Fixes and features.** / **Исправления и новые возможности.**

**English**
- Android: one Back press closes a portal page opened from the app and returns to the screen you came from. Back no longer leaves the app while a portal page is open. A page left open for 5+ minutes in the background doesn't come back when you reopen the app.
- Android: portal pages fit the screen width, so they scroll vertically only.
- Messages: New chat (search for people on the portal), delete your own messages and delete chats (for you only, as the portal allows), and an Archive for chats you want out of the way (reversible). Archive and Delete are also in a menu on right-click, or a long press on Android.
- Profile picture: change it (gallery or camera on Android, a file on desktop) with a square crop, or remove it. JPG, PNG or WebP up to 5 MB.
- Today: Customize lets you add, remove, move and resize blocks on a grid, with Reset. The layout is saved per account.
- Courses: Recent shows at most 3 courses, newest first, on one line.
- Sync between your devices: the chat archive and the Courses sort and filter are kept in a small `ulportal-sync` folder in your personal files on the portal (hidden in the app). Today layout, theme and other visual settings stay per device.
- Not possible on the portal (Moodle 3.7): editing sent messages, deleting messages for everyone, and starting group chats (they come only from course groups).

**Русский**
- Android: одно нажатие «Назад» закрывает открытую из приложения страницу портала и возвращает на прежний экран. «Назад» больше не сворачивает приложение, пока открыта страница портала. Страница, оставленная в фоне на 5+ минут, не возвращается при повторном открытии приложения.
- Android: страницы портала умещаются по ширине экрана, прокрутка только вертикальная.
- Сообщения: «Новый диалог» (поиск людей на портале), удаление своих сообщений и диалогов (только у себя, как позволяет портал) и «Архив» для диалогов, которые хочется убрать с глаз (можно вернуть). «В архив» и «Удалить» есть и в меню по правому клику, на Android — по долгому нажатию.
- Фото профиля: смена (галерея или камера на Android, файл на компьютере) с квадратной обрезкой и удаление. JPG, PNG или WebP до 5 МБ.
- Сегодня: «Настроить» — добавление, удаление, перемещение и изменение размера блоков по сетке, есть «Сбросить». Раскладка сохраняется для каждой учётной записи.
- Курсы: в «Недавних» не больше 3 курсов, сначала последние, в одну строку.
- Синхронизация между устройствами: архив диалогов, сортировка и фильтр курсов хранятся в небольшой папке `ulportal-sync` в ваших личных файлах на портале (в приложении она скрыта). Вид «Сегодня», тема и прочие настройки внешнего вида остаются на каждом устройстве свои.
- Невозможно на портале (Moodle 3.7): редактирование отправленных сообщений, удаление сообщений у всех и создание групповых бесед (они появляются только из групп курса).

## 1.2.1 — 2026-10-28

**Personal files and small fixes.** / **Личные файлы и мелкие исправления.**

**English**
- Personal files: the name sits over its size and date, so it's no longer squeezed out on phones. Tapping a file's name opens its details (size, dates, author), where you can rename, download or open, and delete it.
- Personal files: new folders, and renaming folders (Edit).
- Desktop: the logo's glow is no longer cut off when the sidebar is collapsed.

**Русский**
- Личные файлы: название стоит над размером и датой и больше не пропадает на телефоне. Нажатие на название файла открывает подробности (размер, даты, автор), где файл можно переименовать, скачать или открыть и удалить.
- Личные файлы: создание папок и переименование папок («Изменить»).
- Компьютер: свечение логотипа больше не обрезается при свёрнутой боковой панели.

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
