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

  return { gradeDetail, currentProgress, folder };
})();

if (typeof module === 'object') module.exports = Parse;
