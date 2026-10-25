<div align="center">

<img src="logo.svg" width="96" alt="ULSU Portal Desktop logo">

# ULSU Portal Desktop

**An unofficial desktop app for [portal.ulsu.ru](https://portal.ulsu.ru), the student portal of Ulyanovsk State University.**
Stay signed in, see your day at a glance, and keep courses, deadlines, grades and messages one click away.

[![Version](https://img.shields.io/badge/version-1.0.0-0d45ca)](https://github.com/RGB-Outl4w/UlSU-Portal-Desktop/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-12a06a)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-5c677d)](#install)
[![Electron](https://img.shields.io/badge/Electron-45-47848f)](https://www.electronjs.org)
[![Unofficial](https://img.shields.io/badge/unofficial-not%20affiliated%20with%20ULSU-d9770b)](NOTICE.md)

**English** · [Русский](README.ru.md) · [Website](https://rgb-outl4w.github.io/UlSU-Portal-Desktop/)

</div>

---

## Why

The portal logs you out every time you close the browser, and signing back in means waiting for a MAX code again. ULSU Portal Desktop keeps your session on your own computer, so you sign in once. It also wraps the portal in a faster, cleaner interface.

## Features

| | |
|---|---|
| **Today** | Live "now / next class" banner, today's classes, upcoming deadlines, latest notifications, debts |
| **Schedule** | Current and next week with the I/II week parity, the class in progress highlighted |
| **Calendar** | Month view with classes and course events; later weeks estimated from the I/II alternation |
| **Courses** | Courses open inside the app: sections, completion checkboxes, a materials gallery, an in-app PDF viewer, participants, favourites |
| **Deadlines & grades** | Upcoming and overdue work; grades with sorting and filters |
| **Academic record** | Exam marks per semester with your average, and the full study plan with hours and syllabi |
| **Notifications & messages** | Reading pane, chats with bubbles, sending, unread badges, Windows notifications |
| **Services** | Certificate orders, questions to the university, personal files (upload/download), e-library sign-in links |
| **Offline** | Every section is saved after you open it, so it still works without a connection |
| **Comfort** | Light/dark theme, accent colours, Russian and English, Ctrl+K search, keyboard shortcuts, reduced-motion support |

## Install

> Windows 10/11. Installers will be published on the [Releases](https://github.com/RGB-Outl4w/UlSU-Portal-Desktop/releases) page.

### Run from source

```bash
git clone https://github.com/RGB-Outl4w/UlSU-Portal-Desktop.git
cd UlSU-Portal-Desktop
npm install
npm start
```

Requires [Node.js](https://nodejs.org) 20 or newer.

## How it works

- **Sign-in.** The app opens the portal's real login page in its own window. You enter your login, password and MAX code there. The app never reads those fields.
- **Staying signed in.** The portal's session cookie expires when a browser closes. The app saves it on disk for up to 30 days and touches the session every few minutes while running, including from the tray.
- **Data.** The portal has no public API for this, so the app uses the same requests the website makes, and reads some pages (schedule, academic record, study plan) directly.
- **Speed and offline.** Each section first shows its saved copy instantly, then refreshes quietly from the network.

## Privacy

Everything stays on your computer. No analytics, no telemetry, no servers of our own. The app talks only to portal.ulsu.ru, to sites you open yourself, and to GitHub when you press "Check for updates". Read the full [Privacy Policy](PRIVACY.md).

## Disclaimer

This is an **unofficial** project. It is not made, endorsed or supported by Ulyanovsk State University. Names such as "УлГУ" and "ULSU" are used only to say which website the app works with. Always check important information on the official portal. See [NOTICE.md](NOTICE.md).

## Project layout

```
main.js        Electron main process: session, network, disk cache, tray, notifications
preload.js     The small API the window may use (window.portal)
app.js         Interface: views, portal page parsers, navigation
i18n.js        English strings (the interface is written in Russian)
index.html     Window markup, icons, dialogs
app.css        Design tokens, layout, animations
offline.html   Page shown in portal windows when there's no connection
docs/          Project website (GitHub Pages)
```

The development notes and milestones live in [ROADMAP.md](ROADMAP.md).

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/RGB-Outl4w/UlSU-Portal-Desktop/issues). The portal changes from time to time; if a section stops loading, an issue with the section name and what you see helps the most. Please never include your password, MAX codes, cookies or screenshots with other people's personal data.

## Credits

Created by **Maksim Surgutskii** (Сургутский Максим Эдуардович), student, group ИС-О-25/1, with the help of [Claude Code](https://claude.com/claude-code), an AI coding assistant by Anthropic.

Built with [Electron](https://www.electronjs.org). Icons based on [Lucide](https://lucide.dev). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE) © 2026 Maksim Surgutskii
