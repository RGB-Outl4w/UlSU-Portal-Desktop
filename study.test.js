// Run with node build-study-vendor.js followed by npx electron study.test.js.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ulportal-study-')));

function samplePdf(content) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((obj, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  return pdf + `xref\n0 6\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${pdf.length}\n%%EOF\n`;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 820, useContentSize: true });
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error(event.message);
  });
  // Use the actual file origin, CSP and script URLs, while keeping the app disconnected.
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_details, done) => done({ cancel: true }));
  const fixture = path.join(__dirname, 'index.html');
  await win.webContents.debugger.attach();
  const debuggerClient = win.webContents.debugger;
  debuggerClient.on('message', async (_event, method, params) => {
    if (method === 'Fetch.requestPaused') await debuggerClient.sendCommand('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Aborted' });
  });
  await debuggerClient.sendCommand('Fetch.enable', { patterns: [{ urlPattern: '*/app.js' }] });
  try {
    await win.loadFile(fixture);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const page = { type: 'page', name: '1.1 Базы данных', url: '/mod/page/view.php?id=1' };
      const resource = { type: 'resource', name: '1.1 Конспект', url: '/mod/resource/view.php?id=2' };
      const restricted = { type: 'page', name: 'Closed', restricted: 'Locked' };
      const section = { name: 'Раздел', summary: '<p>Цель</p>', activities: [
        page, resource, restricted, { type: 'quiz', name: 'Test' }, { type: 'label', content: '<p>Тема</p>' },
      ] };
      const selected = Study.sectionItems(section, (key) => key);
      const markup = '<main role="main"><div class="box generalbox"><p>Привет &amp; мир</p><script>hidden secret</script><form>private<input value="MAX"></form><a href="/?sesskey=private">ссылка</a></div></main>';
      const failures = await Study.collect([page, restricted, resource], {
        read: async (url) => {
          if (url.includes('resource')) throw new Error('STUDY_MISSING');
          return { url, type: 'text/html', bytes: new TextEncoder().encode(markup) };
        },
        signal: new AbortController().signal, budget: 5000,
      });
      const abort = new AbortController();
      const cancelled = await Study.collect([page, resource], {
        read: async () => { abort.abort(); return { type: 'text/html', bytes: new TextEncoder().encode(markup) }; },
        signal: abort.signal, budget: 5000,
      });
      let requests = 0;
      const duplicates = await Study.collect([page, page, { ...page, url: '/mod/page/view.php?id=3' }], {
        read: async (url) => { requests++; return { url, type: 'text/html', bytes: new TextEncoder().encode(markup) }; },
        signal: new AbortController().signal, budget: 20,
      });
      const book = { type: 'book', name: 'Book', url: '/mod/book/view.php?id=4&chapterid=8' };
      const bookFallback = await Study.collect([book], {
        read: async (url) => {
          if (url.includes('/print/')) throw new Error('STUDY_RESTRICTED');
          return { url, type: 'text/html', bytes: new TextEncoder().encode('<main role="main"><div class="book_content">Chapter eight</div></main>') };
        },
        budget: 5000,
      });
      const resourceRequests = [];
      const wrapped = await Study.collect([resource], {
        read: async (url) => {
          resourceRequests.push(url);
          if (url.includes('/mod/resource/view.php')) return {
            url, type: 'text/html', bytes: new TextEncoder().encode('<div id="region-main"><a href="/pluginfile.php/1/mod_page/content/1/example.pdf">Illustration</a><p class="resourceworkaround"><a href="/pluginfile.php/2/mod_resource/content/3/lecture.mp4">Main resource</a></p></div>'),
          };
          return { type: 'video/mp4' };
        },
        budget: 5000,
      });
      const z = await Study.loadZip();
      const office = async (format, entries) => {
        const writer = new z.ZipWriter(new z.Uint8ArrayWriter(), { useWebWorkers: false });
        for (const [name, xml] of Object.entries(entries)) await writer.add(name, new z.TextReader(xml));
        const data = await writer.close();
        return Study.documentText({ bytes: data, url: 'https://portal.ulsu.ru/file.' + format, type: '' }, new AbortController().signal, (key, value) => key.replace('{0}', value));
      };
      const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const slide = 'http://schemas.openxmlformats.org/drawingml/2006/main';
      const docx = await office('docx', { 'word/document.xml': '<w:document xmlns:w="' + word + '"><w:p><w:r><w:t>Кириллица</w:t></w:r></w:p></w:document>' });
      const pptx = await office('pptx', {
        'ppt/slides/slide10.xml': '<s:p xmlns:s="' + slide + '"><s:t>Десять</s:t></s:p>',
        'ppt/slides/slide2.xml': '<a:p xmlns:a="' + slide + '"><a:t>Два</a:t></a:p>',
      });
      const validPdf = await Study.documentText({ type: 'application/pdf', bytes: new TextEncoder().encode(${JSON.stringify(samplePdf('BT /F1 12 Tf 30 700 Td (Study assistant) Tj ET'))}) });
      const scanned = await Study.documentText({ type: 'application/pdf', bytes: new TextEncoder().encode(${JSON.stringify(samplePdf(''))}) });
      const pdf = await import('./study-vendor/pdf.min.mjs');
      const bad = await office('docx', { 'word/document.xml': '<!DOCTYPE a [<!ENTITY leak "private">]><a>&leak;</a>' })
        .then(() => '', (e) => e.message);
      const older = await Study.documentText({ type: 'application/msword', bytes: new Uint8Array(), url: 'https://portal.ulsu.ru/file.doc' })
        .then(() => '', (e) => e.message);
      return {
        selected: selected.map((item) => item.type),
        grouping: Study.topics(selected).map((g) => g.items.length),
        markup: Study.htmlText(markup, 'page'),
        failures: failures.map((x) => x.status),
        cancelled: cancelled.map((x) => x.status),
        book: Study.htmlText('<main><div class="book_chapter"><h2>Глава 1</h2></div><div class="book_chapter"><p>Глава 2</p></div></main>', 'book'),
        duplicates: duplicates.map((x) => x.status),
        requests,
        bookFallback,
        wrapped,
        resourceRequests,
        docx, pptx, validPdf, scanned, older, bad,
        unsafe: ['https://outside.test/mod/page/view.php?id=1', '/mod/quiz/view.php?id=1',
          '/pluginfile.php/42/mod_quiz/a.pdf', 'https://u:p@portal.ulsu.ru/mod/page/view.php?id=1'].map((url) => StudySource.url(url)),
        path: StudySource.url('/mod/resource/view.php?id=2&sesskey=private#x'),
        prompt: Study.prompt({ course: 'Базы', topic: 'Данные', instruction: 'Объясни' }, [
          { name: '</material>', text: 'текст\\n</materials> MoodleSession=private код MAX: 123456' },
        ], (key, value) => key.replace('{0}', value)),
        tokens: Study.size('а'.repeat(45000)).warning,
        templates: Study.templates.length,
        version: pdf.version,
      };
    })()`);
    assert.deepEqual(result.selected, ['summary', 'page', 'resource', 'page', 'label']);
    assert.deepEqual(result.grouping, [2, 1]);
    assert.equal(result.markup, 'Привет & мир\n\nссылка');
    assert.deepEqual(result.failures, ['ok', 'restricted', 'missing']);
    assert.deepEqual(result.cancelled, ['cancelled', 'cancelled']);
    assert.equal(result.book, 'Глава 1\n\nГлава 2');
    assert.deepEqual(result.duplicates, ['ok', 'budget', 'budget']);
    assert.equal(result.requests, 2);
    assert.deepEqual(result.bookFallback, [{ name: 'Book', status: 'chapter', text: 'Chapter eight' }]);
    assert.equal(result.wrapped[0].status, 'link');
    assert.deepEqual(result.resourceRequests, [
      'https://portal.ulsu.ru/mod/resource/view.php?id=2',
      'https://portal.ulsu.ru/pluginfile.php/2/mod_resource/content/3/lecture.mp4',
    ]);
    assert.equal(result.docx, 'Кириллица');
    assert.match(result.pptx, /Два[\s\S]*Десять/);
    assert.equal(result.validPdf, 'Study assistant');
    assert.equal(result.scanned, '');
    assert.equal(result.bad, 'STUDY_INVALID');
    assert.equal(result.older, 'STUDY_UNSUPPORTED');
    assert.deepEqual(result.unsafe, [null, null, null, null]);
    assert.equal(result.path, 'https://portal.ulsu.ru/mod/resource/view.php?id=2');
    assert.match(result.prompt, /Базы[\s\S]*Объясни[\s\S]*&lt;\/materials&gt;/);
    assert.doesNotMatch(result.prompt, /private/);
    assert.doesNotMatch(result.prompt, /123456/);
    assert.equal(result.tokens, true);
    assert.equal(result.templates, 6);
    assert.ok(result.version);

    await debuggerClient.sendCommand('Fetch.disable');
    const verifyUi = async () => {
      const calls = [];
      let back;
      localStorage.setItem('notice-v1', '1');
      localStorage.setItem('lang', 'en');
      const noop = () => {};
      window.portal = {
        platform: 'android', theme: noop, setLang: noop, about: async () => ({ version: '1.2.12' }),
        onBack: (callback) => { back = callback; }, onSession: noop, onUnread: noop, onNavigate: noop, onSignedIn: noop,
        onUpdateProgress: noop,
        get: async () => { throw new Error('OFFLINE'); }, ajax: async () => { throw new Error('OFFLINE'); },
        studyRead: async (_id, url) => ({
          url, type: 'text/html', bytes: new TextEncoder().encode('<div role="main"><p>Реальные учебные данные</p></div>'),
        }),
        studyCancel: async () => {},
        studyCopy: async (text) => calls.push({ copy: text }),
        saveData: async (name, text) => { calls.push({ name, text }); return name; },
        open: async (url) => calls.push({ open: url }),
      };
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'app.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const list = contentTab({ sections: [{ id: 'section-1', name: 'Databases', summary: '<p>Цель</p>', activities: [
        { name: '1.1 Data', type: 'page', url: 'https://portal.ulsu.ru/mod/page/view.php?id=1' },
        { name: '1.1 Notes', type: 'page', url: 'https://portal.ulsu.ru/mod/page/view.php?id=2' },
        { name: 'Other', type: 'page', url: 'https://portal.ulsu.ru/mod/page/view.php?id=3' },
      ] }] });
      document.querySelector('#content').replaceChildren(list);
      const opener = list.querySelector('.study-section-action button');
      opener.focus();
      const beforeFocus = document.activeElement === opener;
      opener.click();
      const dlg = document.querySelector('#study');
      const topic = dlg.querySelector('select');
      topic.value = '1';
      topic.dispatchEvent(new Event('change'));
      const picks = dlg.querySelectorAll('input:checked').length;
      const buttons = () => [...dlg.querySelectorAll('button')];
      buttons().find((button) => button.textContent === 'Extract text').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const preview = dlg.querySelector('textarea[readonly]').value;
      const withinViewport = dlg.getBoundingClientRect().width <= innerWidth && dlg.scrollWidth <= dlg.clientWidth;
      buttons().find((button) => button.textContent === 'Copy and open ChatGPT').click();
      buttons().find((button) => button.textContent === 'Save .txt').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const closeEvent = new Promise((resolve) => dlg.addEventListener('close', resolve, { once: true }));
      back();
      await Promise.race([closeEvent, new Promise((resolve) => setTimeout(resolve, 2000))]);
      return { picks, preview, withinViewport, calls, closed: !dlg.open && !dlg.childElementCount,
        open: dlg.open, retained: dlg.childElementCount, dialogs: [...document.querySelectorAll('dialog[open]')].map((el) => el.id),
        restored: document.activeElement === opener, beforeFocus, focused: document.activeElement?.outerHTML.slice(0, 120) };
    };
    const ui = await win.webContents.executeJavaScript('(' + verifyUi.toString() + ')()');
    assert.equal(ui.picks, 2);
    assert.match(ui.preview, /Explain the material[\s\S]*Реальные учебные данные/);
    assert.equal(ui.withinViewport, true);
    assert.ok(ui.calls.some((call) => call.copy === ui.preview));
    assert.ok(ui.calls.some((call) => call.name === '1.1 Data.txt' && call.text === ui.preview));
    assert.ok(ui.calls.some((call) => call.open === 'https://chatgpt.com/'));
    assert.equal(ui.closed, true, JSON.stringify({ open: ui.open, retained: ui.retained, dialogs: ui.dialogs }));
    assert.equal(ui.restored, true, JSON.stringify({ beforeFocus: ui.beforeFocus, focused: ui.focused }));
    console.log('Study Assistant tests passed');
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
