// Android: window.portal for app.js, the same API as preload.js + main.js on desktop.
// Portal requests go through CapacitorHttp (native: no CORS, cookies shared with the sign-in WebView).
// Sign-in, portal pages, saving files and the theme go through the UlPortal plugin (UlPortalPlugin.java).
(() => {
  const BASE = 'https://portal.ulsu.ru';
  const RELOGIN = ['servicerequireslogin', 'invalidsesskey', 'requireloginerror'];
  const REPO_API = 'https://api.github.com/repos/RGB-Outl4w/UlSU-Portal-Desktop/releases';
  const native = (method, opts = {}) => Capacitor.nativePromise('UlPortal', method, opts);
  let sesskey, userid, loginPromise;

  // Network failures (no connection, DNS, portal down) become one recognisable error for the renderer.
  async function net(url, opts = {}) {
    try {
      return await Capacitor.nativePromise('CapacitorHttp', 'request', { url, method: 'GET', responseType: 'text', ...opts });
    } catch (e) {
      throw new Error(`OFFLINE: ${e.message}`);
    }
  }
  const header = (res, name) => Object.entries(res.headers || {}).find(([k]) => k.toLowerCase() === name)?.[1] || '';
  const text = (res) => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // Disk copy of every read in IndexedDB (the WebView's own storage), so views open instantly and offline.
  // mode 'cache' answers from the copy only, as { at, data }.
  const db = new Promise((ok, fail) => {
    const r = indexedDB.open('cache', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('c');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  const store = async (mode, fn) => {
    const s = (await db).transaction('c', mode).objectStore('c');
    return new Promise((ok, fail) => { const r = fn(s); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
  };
  async function cached(key, fetcher, mode) {
    const k = JSON.stringify(key);
    if (mode === 'cache') {
      const hit = await store('readonly', (s) => s.get(k)).catch(() => null);
      if (!hit) throw new Error('NOCACHE');
      return hit;
    }
    const data = await fetcher();
    store('readwrite', (s) => s.put({ at: Date.now(), data }, k)).catch((e) => console.warn('cache write failed', e));
    return data;
  }

  // Real portal login page in a native WebView; the user types everything, we only watch for landing logged in.
  function login() {
    loginPromise ||= native('login').finally(() => { loginPromise = null; });
    return loginPromise;
  }

  const isMaintenance = (status, html) => status === 503 || /<body[^>]*\bpagelayout-maintenance\b/.test(html);

  async function get(p) {
    const res = await net(BASE + p);
    const html = text(res);
    if (isMaintenance(res.status, html)) throw new Error('MAINTENANCE');
    if (/<body[^>]*\bnotloggedin\b/.test(html)) { await login(); return get(p); }
    sesskey = html.match(/"sesskey":"(\w+)"/)?.[1] || sesskey;
    userid = Number(html.match(/data-userid="(\d+)"/)?.[1]) || userid;
    return html;
  }

  // ponytail: whole file as base64 over the bridge; a native download-to-file path if big videos show up.
  async function file(url) {
    if (!url.startsWith(`${BASE}/`)) throw new Error('not a portal file');
    const res = await net(url, { responseType: 'arraybuffer' });
    const type = header(res, 'content-type');
    if (type.startsWith('text/html')) {
      const html = new TextDecoder().decode(fromB64(res.data));
      if (/<body[^>]*\bnotloggedin\b/.test(html)) { await login(); return file(url); }
      throw new Error(T('Портал вернул страницу вместо файла'));
    }
    return { type, bytes: fromB64(res.data) };
  }

  // Saved to Downloads and opened in the system viewer; returns the file name.
  async function download(url, name) {
    const { type, bytes } = await file(url);
    return (await native('save', { name, type, data: toB64(bytes) })).name;
  }

  async function upload({ itemid, filepath, name, bytes }) {
    if (!sesskey) await get('/my/');
    const fields = { sesskey, repo_id: '4', itemid, savepath: filepath, title: name, overwrite: '0', author: '', license: 'allrightsreserved' };
    const res = await net(`${BASE}/repository/repository_ajax.php?action=upload`, {
      method: 'POST',
      dataType: 'formData',
      data: [
        ...Object.entries(fields).map(([key, value]) => ({ key, value: String(value), type: 'string' })),
        { key: 'repo_upload_file', value: toB64(bytes), type: 'base64File', fileName: name, contentType: 'application/octet-stream' },
      ],
      responseType: 'json',
    });
    const r = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (r.error) throw new Error(r.error);
    return r;
  }

  async function post(p, fields) {
    if (!sesskey) await get('/my/');
    const res = await net(BASE + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: { ...fields, sesskey },
    });
    return text(res);
  }

  async function call(methodname, args) {
    const res = await net(`${BASE}/lib/ajax/service.php?sesskey=${sesskey}&info=${methodname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: [{ index: 0, methodname, args }],
    });
    const body = text(res);
    if (isMaintenance(res.status, body)) throw new Error('MAINTENANCE');
    return JSON.parse(body)[0];
  }

  async function ajax(methodname, args, retried) {
    if (!sesskey) await get('/my/');
    const r = await call(methodname, args);
    if (!r.error) return r.data;
    const code = r.exception?.errorcode || r.errorcode;
    if (code === 'sitemaintenance') throw new Error('MAINTENANCE');
    if (!retried && RELOGIN.includes(code)) { sesskey = null; await get('/my/'); return ajax(methodname, args, true); }
    throw new Error(r.exception?.message || code);
  }

  // Semver order, prereleases included (copy of main.js newer()).
  function newer(a, b) {
    const parse = (v) => {
      const m = String(v).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/) || [];
      return { core: [1, 2, 3].map((i) => Number(m[i]) || 0), pre: m[4] ? m[4].split('.') : [] };
    };
    const x = parse(a), y = parse(b);
    for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] > y.core[i];
    if (!x.pre.length || !y.pre.length) return !x.pre.length && y.pre.length > 0;
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
      const [p, q] = [x.pre[i], y.pre[i]];
      if (p === undefined || q === undefined) return q === undefined;
      if (p === q) continue;
      const [np, nq] = [/^\d+$/.test(p), /^\d+$/.test(q)];
      if (np && nq) return Number(p) > Number(q);
      if (np !== nq) return nq;
      return p > q;
    }
    return false;
  }
  async function checkUpdate() {
    const current = (await native('info')).version;
    const beta = current.includes('-');
    const res = await net(beta ? `${REPO_API}?per_page=20` : `${REPO_API}/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ulportal/${current}` },
      responseType: 'json',
    });
    if (res.status === 404) return { current, latest: null };
    if (res.status >= 400) throw new Error(`GitHub: ${res.status}`);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const r = beta ? data.filter((x) => !x.draft).reduce((best, x) => (!best || newer(x.tag_name, best.tag_name) ? x : best), null) : data;
    if (!r) return { current, latest: null };
    return { current, latest: r.tag_name.replace(/^v/, ''), url: r.html_url, update: newer(r.tag_name, current) };
  }

  const clearCache = () => store('readwrite', (s) => s.clear());
  const DOCS = ['PRIVACY.md', 'PRIVACY.ru.md', 'NOTICE.md', 'LICENSE', 'LICENSE.ru.md', 'THIRD_PARTY_NOTICES.md'];

  window.portal = {
    platform: 'android',
    get: (p, mode) => (mode === 'live' ? get(p) : cached(['get', p], () => get(p), mode)),
    post,
    file,
    download,
    upload,
    // Only reads are cached; writes (mark read, send, toggle) always hit the network.
    ajax: (m, a, mode) => (/_get_/.test(m) ? cached(['ajax', m, a], () => ajax(m, a), mode)
      : mode === 'cache' ? Promise.reject(new Error('NOCACHE')) : ajax(m, a)),
    open: (url) => native('open', { url }),
    async logout() {
      if (sesskey) await net(`${BASE}/login/logout.php?sesskey=${sesskey}`).catch(() => {});
      sesskey = null;
      userid = null;
      await native('clearCookies');
      await clearCache(); // cached pages hold personal data
    },
    theme: (mode) => native('theme', { mode }),
    setLang: async () => {},
    async about() {
      const i = await native('info');
      return { version: i.version, electron: '—', chrome: i.webview, node: '—', v8: '—', os: `Android ${i.android} (API ${i.sdk})`, dataDir: '—' };
    },
    doc: (name) => (DOCS.includes(name) ? fetch(name).then((r) => r.text()) : Promise.resolve(null)),
    clearCache,
    openData: async () => 'Android',
    checkUpdate,
    poll: async () => null, // A3: background check via WorkManager
    onUnread: () => {},
    onNavigate: () => {},
    onSession: () => {},
  };
})();
