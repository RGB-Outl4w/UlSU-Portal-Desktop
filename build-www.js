// Android: copy the desktop UI into www/ for Capacitor and load portal-android.js (window.portal) before app.js.
const fs = require('fs');

const FILES = ['app.js', 'app.css', 'i18n.js', 'logo.svg', 'icon.png', 'portal-android.js',
  'PRIVACY.md', 'PRIVACY.ru.md', 'NOTICE.md', 'LICENSE', 'LICENSE.ru.md', 'THIRD_PARTY_NOTICES.md'];

fs.rmSync('www', { recursive: true, force: true });
fs.mkdirSync('www');
for (const f of FILES) fs.copyFileSync(f, `www/${f}`);
const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('<script src="app.js">')) throw new Error('index.html: app.js script tag not found');
fs.writeFileSync('www/index.html', html.replace('<script src="app.js">', '<script src="portal-android.js"></script>\n  <script src="app.js">'));
