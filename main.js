const { app, BrowserWindow, ipcMain, session, shell, Tray, Menu, powerMonitor, nativeTheme, Notification, dialog } = require('electron');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

const BASE = 'https://portal.ulsu.ru';
const PARTITION = 'persist:ulsu';
const RELOGIN = ['servicerequireslogin', 'invalidsesskey', 'requireloginerror'];
const KEEP_DAYS = 30;            // how long the saved MoodleSession cookie lives on disk
const POLL_MS = 3 * 60 * 1000;   // unread check + keepalive interval; tune from session.log
// Dev runs electron.exe, so autostart must pass the app folder too.
const LOGIN_ARGS = app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'];

let ses, mainWin, tray, sesskey, userid, loginPromise, quitting = false, lastOk = Date.now();
let seen = null; // newest notification/message ids already known, so only new ones toast

// Main-process strings; the renderer tells us the UI language (setLang), remembered in lang.json.
const LANG_FILE = () => path.join(app.getPath('userData'), 'lang.json');
let lang = 'ru';
const MAIN_EN = {
  'Вход в портал УлГУ': 'Sign in to the ULSU portal',
  'Вход отменён': 'Sign-in cancelled',
  'Портал вернул страницу вместо файла': 'The portal returned a page instead of the file',
  'УлГУ · Портал студента': 'ULSU · Student Portal',
  '{0} непрочитанных': '{0} unread',
  'Новое сообщение': 'New message',
  'Открыть': 'Open',
  'Запускать с Windows': 'Start with Windows',
  'Выход': 'Quit',
};
const t = (key, ...args) => ((lang === 'en' && MAIN_EN[key]) || key).replace(/\{(\d)\}/g, (_, i) => args[i]);

const log = (msg) => fs.appendFileSync(path.join(app.getPath('userData'), 'session.log'), `${new Date().toISOString()} ${msg}\n`);

// Network failures (no connection, DNS, portal down) become one recognisable error for the renderer.
async function net(url, opts) {
  try {
    return await ses.fetch(url, opts);
  } catch (e) {
    throw new Error(`OFFLINE: ${e.message}`);
  }
}

// Disk copy of every read (pages and *_get_* AJAX calls), one JSON file per request, so views
// open instantly and still work offline. mode 'cache' answers from disk only, as { at, data }.
const CACHE_DIR = () => path.join(app.getPath('userData'), 'cache');
async function cached(key, fetcher, mode) {
  const file = path.join(CACHE_DIR(), `${crypto.createHash('sha1').update(JSON.stringify(key)).digest('hex')}.json`);
  if (mode === 'cache') {
    const hit = await fs.promises.readFile(file, 'utf8').catch(() => null);
    if (!hit) throw new Error('NOCACHE');
    return JSON.parse(hit);
  }
  const data = await fetcher();
  fs.promises.mkdir(CACHE_DIR(), { recursive: true })
    .then(() => fs.promises.writeFile(file, JSON.stringify({ at: Date.now(), data })))
    .catch((e) => log(`cache write failed: ${e.message}`));
  return data;
}

// Real portal login page: user types login/password and waits for the MAX code countdown.
// We never touch the form, only watch for landing on a logged-in page outside login/2FA paths.
function login() {
  if (loginPromise) return loginPromise;
  loginPromise = new Promise((resolve, reject) => {
    const visible = mainWin?.isVisible();
    const win = new BrowserWindow({
      width: 520, height: 760, parent: visible ? mainWin : undefined, modal: !!visible,
      title: t('Вход в портал УлГУ'), autoHideMenuBar: true,
      webPreferences: { partition: PARTITION },
    });
    let done = false;
    win.webContents.on('did-finish-load', async () => {
      const url = win.webContents.getURL();
      if (done || !url.startsWith(`${BASE}/`) || /login|auth|mfa/i.test(new URL(url).pathname)) return; // not the portal (offline page) or still logging in
      if (await win.webContents.executeJavaScript("document.body.classList.contains('notloggedin')")) return;
      done = true; lastOk = Date.now(); log('logged in'); win.close(); resolve();
    });
    win.on('closed', () => { loginPromise = null; if (!done) reject(new Error(t('Вход отменён'))); });
    guardOffline(win);
    win.loadURL(`${BASE}/login/index.php`);
  });
  return loginPromise;
}

async function get(p) {
  // session.fetch leaves res.url empty, so detect the login redirect by page content.
  const html = await (await net(BASE + p)).text();
  if (/<body[^>]*\bnotloggedin\b/.test(html)) { await login(); return get(p); }
  sesskey = html.match(/"sesskey":"(\w+)"/)?.[1] || sesskey;
  const id = Number(html.match(/data-userid="(\d+)"/)?.[1]);
  if (id && !userid) setTimeout(poll, 2000); // first unread counts right after login/startup
  userid = id || userid;
  return html;
}

// Portal file bytes for in-app viewing. A frame inside the app is cross-site to the portal, so
// the Lax session cookie isn't sent there (it lands on the login page); fetching here sends it.
// ponytail: whole file in memory; stream through a custom protocol if big videos show up.
async function file(url) {
  if (!url.startsWith(`${BASE}/`)) throw new Error('not a portal file');
  const res = await net(url);
  const type = res.headers.get('content-type') || '';
  if (type.startsWith('text/html')) {
    const html = await res.text();
    if (/<body[^>]*\bnotloggedin\b/.test(html)) { await login(); return file(url); }
    throw new Error(t('Портал вернул страницу вместо файла'));
  }
  return { type, bytes: new Uint8Array(await res.arrayBuffer()) };
}

// Save a portal file to disk (asks where); returns the saved path or null if cancelled.
async function download(url, name) {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWin, { defaultPath: path.join(app.getPath('downloads'), name) });
  if (canceled || !filePath) return null;
  const { bytes } = await file(url);
  await fs.promises.writeFile(filePath, bytes);
  shell.showItemInFolder(filePath);
  return filePath;
}

// Upload into a Moodle draft area (personal files); the caller then saves the files form to commit it.
async function upload({ itemid, filepath, name, bytes }) {
  if (!sesskey) await get('/my/');
  const form = new FormData();
  for (const [k, v] of Object.entries({ sesskey, repo_id: '4', itemid, savepath: filepath, title: name, overwrite: '0', author: '', license: 'allrightsreserved' })) form.append(k, v);
  form.append('repo_upload_file', new Blob([bytes]), name);
  const res = await net(`${BASE}/repository/repository_ajax.php?action=upload`, { method: 'POST', body: form });
  const r = await res.json();
  if (r.error) throw new Error(r.error);
  return r;
}

// Form POST to a portal page (e.g. manual completion toggle); sesskey is added here.
async function post(p, fields) {
  if (!sesskey) await get('/my/');
  const res = await net(BASE + p, { method: 'POST', body: new URLSearchParams({ ...fields, sesskey }) });
  return res.text();
}

async function call(methodname, args) {
  const res = await net(`${BASE}/lib/ajax/service.php?sesskey=${sesskey}&info=${methodname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ index: 0, methodname, args }]),
  });
  return (await res.json())[0];
}

async function ajax(methodname, args, retried) {
  if (!sesskey) await get('/my/');
  const r = await call(methodname, args);
  if (!r.error) return r.data;
  const code = r.exception?.errorcode || r.errorcode;
  if (!retried && RELOGIN.includes(code)) { sesskey = null; await get('/my/'); return ajax(methodname, args, true); }
  throw new Error(r.exception?.message || code);
}

const strip = (s = '') => s.replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

function toast(title, body, view) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body: body.slice(0, 200), icon: path.join(__dirname, 'icon.png') });
  n.on('click', () => { showMain(); mainWin.webContents.send('navigate', view); });
  n.show();
  if (!mainWin.isFocused()) mainWin.flashFrame(true);
}

// Checks unread notifications/messages; doubles as the keepalive that stops Moodle's idle timeout.
// Never opens the login window: a dead session is only logged; the next view load asks to log in.
// First run only records what exists, so old items don't toast on startup.
async function poll() {
  if (!sesskey || !userid || loginPromise) return null;
  try {
    const [notes, convs] = await Promise.all([
      call('message_popup_get_popup_notifications', { useridto: userid, newestfirst: true, limit: 10, offset: 0 }),
      call('core_message_get_conversations', { userid, limitfrom: 0, limitnum: 20 }),
    ]);
    const dead = [notes, convs].find((r) => r.error);
    if (dead) {
      log(`session lost (${dead.exception?.errorcode}), ${Math.round((Date.now() - lastOk) / 60000)} min after last ok poll`);
      sesskey = null;
      return null;
    }
    lastOk = Date.now();
    const list = notes.data.notifications;
    const conversations = convs.data.conversations;
    const unread = {
      notifications: notes.data.unreadcount ?? list.filter((n) => !n.read).length,
      messages: conversations.filter((c) => c.unreadcount).length,
    };
    mainWin.webContents.send('unread', unread);
    const total = unread.notifications + unread.messages;
    tray.setToolTip(t('УлГУ · Портал студента') + (total ? ` — ${t('{0} непрочитанных', total)}` : ''));

    const newNotes = seen ? list.filter((n) => !n.read && n.id > seen.note) : [];
    const newMsgs = seen ? conversations.filter((c) => c.unreadcount && c.messages[0]?.id > seen.msg && c.messages[0].useridfrom !== userid) : [];
    seen = {
      note: Math.max(seen?.note || 0, ...list.map((n) => n.id)),
      msg: Math.max(seen?.msg || 0, ...conversations.map((c) => c.messages[0]?.id || 0)),
    };
    for (const n of newNotes.slice(0, 3)) toast(strip(n.subject), strip(n.smallmessage || n.fullmessage), 'notifications');
    for (const c of newMsgs.slice(0, 3)) toast(c.name || c.members[0]?.fullname || t('Новое сообщение'), strip(c.messages[0].text), 'messages');
    return unread;
  } catch (e) {
    log(`poll failed: ${e.message}`); // offline; keep sesskey and retry next tick
    return null;
  }
}

// MoodleSession has no expiry, so Chromium drops it on exit. Re-set it with an expiry to keep it on disk.
function persistSessionCookie() {
  ses.cookies.on('changed', (_e, c, _cause, removed) => {
    if (removed || !c.session || c.name !== 'MoodleSession') return;
    ses.cookies.set({
      url: BASE, name: c.name, value: c.value, path: c.path,
      domain: c.hostOnly ? undefined : c.domain,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      expirationDate: Date.now() / 1000 + KEEP_DAYS * 86400,
    }).then(() => ses.cookies.flushStore()).catch((e) => log(`cookie persist failed: ${e.message}`));
  });
}

// A portal/login window that can't reach the site shows offline.html (with Повторить) instead of white.
function guardOffline(win) {
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = aborted: redirects, downloads
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { url, err: desc, lang } });
  });
}

function open(url) {
  if (!url.startsWith(BASE)) return shell.openExternal(url);
  const win = new BrowserWindow({ width: 1200, height: 850, autoHideMenuBar: true, webPreferences: { partition: PARTITION, plugins: true } });
  guardOffline(win);
  win.loadURL(url);
}

function showMain() {
  mainWin.show();
  mainWin.focus();
}

// Called again on language change: reuses the icon, rebuilds tooltip and menu.
function createTray() {
  if (!tray) {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    tray.on('click', showMain);
  }
  tray.setToolTip(t('УлГУ · Портал студента'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('Открыть'), click: showMain },
    {
      label: t('Запускать с Windows'), type: 'checkbox',
      checked: app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: LOGIN_ARGS }),
    },
    { type: 'separator' },
    { label: t('Выход'), click: () => app.quit() },
  ]));
}

// One instance only: a second launch would fight over the same cookie store.
if (!app.requestSingleInstanceLock()) app.exit(0);
// Windows toasts need an app id; in dev it must be the electron.exe path.
app.setAppUserModelId(app.isPackaged ? 'ru.ulportal.app' : process.execPath);
app.on('second-instance', showMain);

app.whenReady().then(() => {
  ses = session.fromPartition(PARTITION);
  try { lang = JSON.parse(fs.readFileSync(LANG_FILE(), 'utf8')); } catch { lang = app.getLocale().startsWith('ru') ? 'ru' : 'en'; }
  persistSessionCookie();
  // mode 'live': no disk copy (portal endpoints that change things over GET, e.g. /CDO/lib.php?API=sendQ)
  ipcMain.handle('get', (_e, p, mode) => (mode === 'live' ? get(p) : cached(['get', p], () => get(p), mode)));
  ipcMain.handle('download', (_e, url, name) => download(url, name));
  ipcMain.handle('upload', (_e, args) => upload(args));
  ipcMain.handle('post', (_e, p, fields) => post(p, fields));
  ipcMain.handle('file', (_e, url) => file(url));
  // Only reads are cached; writes (mark read, send, toggle) always hit the network.
  ipcMain.handle('ajax', (_e, m, a, mode) => (/_get_/.test(m) ? cached(['ajax', m, a], () => ajax(m, a), mode)
    : mode === 'cache' ? Promise.reject(new Error('NOCACHE')) : ajax(m, a)));
  ipcMain.handle('open', (_e, url) => open(url));
  ipcMain.handle('poll', () => poll());
  // About screen: versions, bundled legal docs, data controls.
  ipcMain.handle('about', () => ({
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, v8: process.versions.v8, os: `${os.version()} (${os.release()}, ${process.arch})`,
    dataDir: app.getPath('userData'),
  }));
  const DOCS = ['PRIVACY.md', 'PRIVACY.ru.md', 'NOTICE.md', 'LICENSE', 'LICENSE.ru.md', 'THIRD_PARTY_NOTICES.md'];
  ipcMain.handle('doc', (_e, name) => (DOCS.includes(name) ? fs.promises.readFile(path.join(__dirname, name), 'utf8') : null));
  ipcMain.handle('clearCache', () => fs.promises.rm(CACHE_DIR(), { recursive: true, force: true }));
  ipcMain.handle('openData', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('lang', async (_e, l) => {
    if (l === lang) return;
    lang = l;
    createTray();
    mainWin.setTitle(t('УлГУ · Портал студента'));
    await fs.promises.writeFile(LANG_FILE(), JSON.stringify(lang)).catch(() => {});
  }); // renderer asks after marking things read
  ipcMain.handle('logout', async () => {
    // End the server session too, not just our cookie copy.
    if (sesskey) await ses.fetch(`${BASE}/login/logout.php?sesskey=${sesskey}`).catch(() => {});
    sesskey = null;
    userid = null;
    seen = null;
    await ses.clearStorageData();
    await fs.promises.rm(CACHE_DIR(), { recursive: true, force: true }); // cached pages hold personal data
    log('logged out');
  });

  // Renderer picks system/light/dark; Mica, title bar buttons and prefers-color-scheme all follow nativeTheme.
  ipcMain.handle('theme', (_e, mode) => { nativeTheme.themeSource = mode; });
  const symbolColor = () => (nativeTheme.shouldUseDarkColors ? '#e4e8f1' : '#1b2333');
  nativeTheme.on('updated', () => mainWin.setTitleBarOverlay({ symbolColor: symbolColor() }));

  Menu.setApplicationMenu(null); // no menu bar; also frees Ctrl+R for the app's own refresh
  mainWin = new BrowserWindow({
    width: 1240, height: 820, minWidth: 760, minHeight: 500,
    title: t('УлГУ · Портал студента'), icon: path.join(__dirname, 'icon.png'),
    show: !process.argv.includes('--hidden'),
    // ponytail: Mica needs Windows 11; on Windows 10 the window just gets the transparent fallback color.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: symbolColor(), height: 44 },
    backgroundMaterial: 'mica',
    backgroundColor: '#00000000',
    // Same partition so course images (pluginfile.php) load with the session cookie.
    // plugins: Chromium's PDF viewer only runs with it (otherwise PDFs render blank).
    webPreferences: { partition: PARTITION, preload: path.join(__dirname, 'preload.js'), plugins: true },
  });
  mainWin.loadFile('index.html');
  // Close = hide to tray, so keepalive keeps running. Real quit only from the tray menu.
  mainWin.on('close', (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });

  mainWin.on('focus', () => mainWin.flashFrame(false));

  createTray();
  setInterval(poll, POLL_MS);
  powerMonitor.on('resume', () => setTimeout(poll, 10_000)); // give network time to come back
});

app.on('before-quit', () => { quitting = true; ses?.cookies.flushStore(); });
// Main window only hides, so this fires just on quit; keep it from quitting early otherwise.
app.on('window-all-closed', () => {});
