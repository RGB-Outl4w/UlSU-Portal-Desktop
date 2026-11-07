// Parsers kept apart from the views so other code can reuse them (grade alerts will diff gradeDetail).
// Pure functions of a Document; parse.test.js runs them on sample markup.
const Parse = (() => {
  const BASE = 'https://portal.ulsu.ru';
  const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() || '';
  // No value: the portal prints "-", or "Ошибка" for a total with nothing graded yet.
  const noValue = (s) => (/^([-–—]|Ошибка|Error)$/.test(s) ? '' : s);

  // /course/user.php?mode=grade: kind is 'category' (heading), 'item', 'subtotal' or 'total' (the course).
  function gradeDetail(doc) {
    return [...doc.querySelectorAll('table.user-grade tbody tr')].map((tr) => {
      const head = tr.querySelector('.column-itemname');
      const cell = (name) => noValue(text(tr.querySelector(`.column-${name}`)));
      const kind = !tr.querySelector('.column-grade') ? 'category'
        : !/\bbagg[tb]\b/.test(head?.className) ? 'item' // baggt/baggb mark aggregate rows
          : head.classList.contains('level1') ? 'total' : 'subtotal';
      return {
        name: text(head), kind, grade: cell('grade'), range: cell('range'), percent: cell('percentage'),
        weight: cell('weight'), contribution: cell('contributiontocoursetotal'), feedback: cell('feedback'),
      };
    }).filter((r) => r.name);
  }

  // /CDO/academic_progress_inside.php: only ever seen empty ("Текущая успеваемость не найдена!" in .accordion),
  // so its real markup is unknown. Any tables are kept as plain rows; note is the page's text when there are none.
  function currentProgress(doc) {
    const box = doc.querySelector('[role=main] .accordion') || doc.querySelector('[role=main]');
    const tables = [...box?.querySelectorAll('table') || []].map((t) => ({
      title: text(t.caption) || text(t.closest('.card, .panel, .accordion-group')?.querySelector('.card-header, .panel-heading, .accordion-heading')),
      head: [...t.querySelectorAll('thead th')].map(text),
      rows: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map(text)).filter((r) => r.some(Boolean)),
    })).filter((t) => t.rows.length);
    return { tables, note: tables.length ? '' : text(box) };
  }

  // /mod/folder/view.php: nested ul/li under .filemanager. A subfolder has items, a file has url.
  function folder(doc) {
    const walk = (ul) => [...ul?.children || []].filter((li) => li.tagName === 'LI').map((li) => {
      const name = text(li.querySelector('.fp-filename'));
      const sub = li.querySelector(':scope > ul');
      if (sub) return { name, items: walk(sub) };
      const href = li.querySelector('a')?.getAttribute('href');
      return { name, url: href && new URL(href, BASE).href };
    }).filter((f) => f.name && (f.items || f.url));
    return walk(doc.querySelector('.filemanager > ul, .foldertree ul'));
  }

  // Tags portal text may keep: rich() in app.js and the saved copies share this list.
  const RICH_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);

  // A clean copy of a portal page for saving: those tags plus DIV (it separates text), absolute links,
  // portal images only, embeds as links. Built in the page's own inert document, so nothing loads.
  function cleanPage(src, embedLabel) {
    const doc = src.ownerDocument;
    const url = (s) => { try { return s ? new URL(s, BASE).href : ''; } catch { return ''; } };
    const walk = (from, to) => {
      for (const n of from.childNodes) {
        if (n.nodeType === 3) to.append(n.textContent);
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') {
          const u = url(n.getAttribute('src'));
          if (!u.startsWith(`${BASE}/`)) continue;
          const img = doc.createElement('img');
          img.setAttribute('src', u);
          img.setAttribute('alt', n.getAttribute('alt') || '');
          to.append(img);
        } else if (/^(IFRAME|VIDEO|AUDIO)$/.test(n.tagName)) {
          const u = url(n.getAttribute('src') || n.querySelector('source')?.getAttribute('src'));
          if (!/^https?:/.test(u)) continue;
          const a = doc.createElement('a');
          a.setAttribute('href', u);
          a.textContent = embedLabel;
          const p = doc.createElement('p');
          p.append(a);
          to.append(p);
        } else if (!/^(SCRIPT|STYLE|OBJECT|EMBED|TEMPLATE)$/.test(n.tagName)) {
          if (!RICH_TAGS.has(n.tagName) && n.tagName !== 'DIV') { walk(n, to); continue; } // unwrap, keep text
          const el = doc.createElement(n.tagName);
          if (n.tagName === 'A' && /^https?:/.test(url(n.getAttribute('href')))) el.setAttribute('href', url(n.getAttribute('href')));
          walk(n, el);
          to.append(el);
        }
      }
    };
    const box = doc.createElement('div');
    if (src) walk(src, box);
    return box;
  }

  const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  function toMdTable(head, rows) {
    const line = (r) => `| ${head.map((_, i) => mdCell(r[i])).join(' | ')} |`;
    return [line(head), `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n');
  }

  // Semicolons and a BOM: what Excel with Russian regional settings opens as columns. A leading = + @ or
  // -text would run as a formula there, so it gets a quote mark; plain numbers and a lone "-" stay.
  function toCsv(head, rows) {
    const cell = (v) => {
      const s = String(v ?? '').replace(/^(?=[=+@\t\r]|-[^\d\s])/, "'");
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return `\ufeff${[head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
  }

  // A cleanPage tree as Markdown, or as plain text with plain = true.
  function toMarkdown(root, plain = false) {
    const BLOCK = /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|TABLE)$/;
    const esc = (s) => (plain ? s : s.replace(/[\\`*_[\]]/g, '\\$&'));
    const mark = (t, m) => {
      const [, lead, body, trail] = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return plain || !body ? t : `${lead}${m}${body}${m}${trail}`;
    };
    const inline = (nodes) => [...nodes].map((n) => {
      if (n.nodeType === 3) return esc(n.textContent.replace(/\s+/g, ' '));
      if (n.nodeType !== 1) return '';
      const t = inline(n.childNodes);
      const href = n.getAttribute('href');
      switch (n.tagName) {
        case 'BR': return plain ? '\n' : '  \n';
        case 'B': case 'STRONG': return mark(t, '**');
        case 'I': case 'EM': return mark(t, '*');
        case 'S': return mark(t, '~~');
        case 'CODE': return plain ? n.textContent : `\`${n.textContent}\``;
        case 'IMG': return plain ? '' : `![${esc(n.getAttribute('alt'))}](${n.getAttribute('src')})`;
        case 'A':
          if (!href || !t.trim()) return t;
          if (plain) return t === href ? t : `${t} (${href})`;
          return `[${t}](${href})`;
        default: return BLOCK.test(n.tagName) ? `${t} ` : t; // a paragraph inside a table cell
      }
    }).join('');
    const para = (s) => (plain ? s : s.replace(/^([#>+-])(?=\s)/, '\\$1').replace(/^(\d+)\.(?=\s)/, '$1\\.'));
    const table = (el) => {
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.cells].map((c) => inline(c.childNodes).replace(/\s+/g, ' ').trim()));
      if (!rows.length) return [];
      if (plain) return [rows.map((r) => r.join('\t')).join('\n')];
      const width = Math.max(...rows.map((r) => r.length));
      return [toMdTable(Array.from({ length: width }, (_, i) => rows[0][i] ?? ''), rows.slice(1))];
    };
    const list = (el) => [...el.children].filter((li) => li.tagName === 'LI').map((li, i) => {
      const m = el.tagName === 'OL' ? `${i + 1}. ` : '- ';
      return m + blocks(li).join('\n').replace(/\n/g, `\n${' '.repeat(m.length)}`);
    }).join('\n');
    const block = (n) => {
      if (/^H\d$/.test(n.tagName)) {
        const t = inline(n.childNodes).trim();
        return t ? [plain ? t : `${'#'.repeat(n.tagName[1])} ${t}`] : [];
      }
      switch (n.tagName) {
        case 'UL': case 'OL': return [list(n)].filter(Boolean);
        case 'BLOCKQUOTE': return [blocks(n).join('\n\n').replace(/^/gm, plain ? '    ' : '> ')];
        case 'PRE': return [plain ? n.textContent : `\`\`\`\n${n.textContent}\n\`\`\``];
        case 'HR': return plain ? [] : ['---'];
        case 'TABLE': return table(n);
        default: return blocks(n);
      }
    };
    const blocks = (el) => {
      const out = [];
      let run = [];
      const flush = () => {
        const t = inline(run).trim();
        if (t) out.push(para(t));
        run = [];
      };
      for (const n of el.childNodes) {
        if (n.nodeType === 1 && BLOCK.test(n.tagName)) { flush(); out.push(...block(n)); } else run.push(n);
      }
      flush();
      return out;
    };
    return `${blocks(root).join('\n\n')}\n`;
  }

  // A cleanPage tree as a page of its own: no scripts, images already inside it as data: URLs.
  function toHtml(title, root) {
    const d = root.ownerDocument.implementation.createHTMLDocument(title);
    const meta = d.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    const style = d.createElement('style');
    style.textContent = 'body{font:16px/1.55 system-ui,sans-serif;max-width:46em;margin:2em auto;padding:0 1em}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 8px}';
    const h1 = d.createElement('h1');
    h1.textContent = title;
    d.head.prepend(meta);
    d.head.append(style);
    d.body.append(h1, ...root.childNodes);
    return `<!doctype html>\n${d.documentElement.outerHTML}`;
  }

  // Safe on Windows, macOS and Android; a very long title is cut before its extension. main.js does the same.
  function fileName(s) {
    const ext = s.match(/\.\w{1,8}$/)?.[0] || '';
    return (s.slice(0, s.length - ext.length).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 120) || '_') + ext;
  }

  return { gradeDetail, currentProgress, folder, RICH_TAGS, cleanPage, toMarkdown, toMdTable, toCsv, toHtml, fileName };
})();

if (typeof module === 'object') module.exports = Parse;
