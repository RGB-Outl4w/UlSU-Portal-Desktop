const DAY = 86400;

// Moodle's grade overview uses a stable table ID and two data cells before the optional rank.
// Scan only these cells. An unexpected page must never replace a valid baseline.
function courseGrades(html) {
  const table = /<table\b(?=[^>]*\bid\s*=\s*(['"])overview-grade\1)[^>]*>([\s\S]*?)<\/table\s*>/i.exec(html)?.[2];
  if (table == null) return null;
  const grades = {};
  let hasRows = false;
  for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const [course, mark] = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)];
    if (!mark) continue;
    hasRows = true;
    const href = /\bhref\s*=\s*(['"])((?:https:\/\/portal\.ulsu\.ru)?\/(?:course\/user|grade\/report\/user\/index)\.php\?[^'"]+)\1/i.exec(course[1])?.[2];
    const id = /[?&]id=(\d+)(?=&|$)/.exec(href?.replace(/&amp;/gi, '&') || '')?.[1];
    if (!id) continue;
    if (/<(?:script|style|svg|iframe|object)\b/i.test(mark[1])) continue;
    const text = mark[1].replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
      .replace(/&[nm]dash;/gi, '—').replace(/\s+/g, ' ').trim();
    if (/^(?:[-–—]|Ошибка|Error)?$/i.test(text)) grades[id] = '';
    else if (text.length <= 80) grades[id] = text.replace(/(\d+)[.,](\d*?[1-9])0*(?!\d)/g, '$1.$2')
      .replace(/(\d+)[.,]0+(?!\d)/g, '$1').replace(/\s+%/g, '%');
  }
  return Object.keys(grades).length || !hasRows ? grades : null;
}

const changedGrades = (previous, current) => Object.keys(current).filter((id) =>
  Object.hasOwn(previous, id) && previous[id] !== current[id]);

function deadlineReminders(events, previous, now) {
  const sent = Object.fromEntries(Object.entries(previous).filter(([, when]) => when > now));
  let count = 0;
  for (const event of events) {
    if (!event || event.action?.actionable === false) continue;
    const { id, timesort } = event;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(timesort) || timesort <= now || timesort > now + DAY) continue;
    const key = id + ':' + timesort;
    if (Object.hasOwn(sent, key)) continue;
    sent[key] = timesort;
    count++;
  }
  return { sent, count };
}

module.exports = { courseGrades, changedGrades, deadlineReminders, DAY };
