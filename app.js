const BASE = 'https://portal.ulsu.ru';

// ---- language ----
// UI strings are written in Russian and wrapped in T(); English comes from EN in i18n.js.
// Switching language reloads the window, so T() at load time is enough.
const LANG = (() => { try { return localStorage.getItem('lang'); } catch { return null; } })()
  || (navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en');
const LOCALE = LANG === 'en' ? 'en-GB' : 'ru-RU';
document.documentElement.lang = LANG;
function T(key, ...args) {
  const s = (LANG === 'en' && EN[key]) || key;
  return args.length ? s.replace(/\{(\d)\}/g, (_, i) => args[i]) : s;
}

const $ = (s) => document.querySelector(s);
const html = (s) => new DOMParser().parseFromString(s, 'text/html');
const txt = (el, s) => el?.querySelector(s)?.textContent.trim() || '';
const ACCENTS = ['#0d45ca', '#7048e8', '#0c8f7f', '#e8590c', '#d6336c', '#5c677d']; // first = ULSU blue
const rel = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const weekday = (d) => cap(d.toLocaleDateString(LOCALE, { weekday: 'long' }));

// Child lists may nest and hold null/false from conditionals; DOM append would print those as text.
const clean = (list) => list.flat(Infinity).filter((k) => k != null && k !== '' && k !== false);

// Portal reads. While fromDisk() runs a loader, they answer from the disk cache instead of the
// network; the oldest copy used becomes the "данные от" time.
// ponytail: one global flag; fine while disk loads are short and never overlap each other.
let diskMode = false;
let diskAt = Infinity;
let staleAt = null; // set when a network read fell back to the disk copy (portal unreachable)
const viaDisk = (call) => {
  const mode = diskMode ? 'cache' : undefined;
  return call(mode).then((r) => {
    if (!mode) return r;
    diskAt = Math.min(diskAt, r.at);
    return r.data;
  }, async (e) => {
    if (mode || !isOffline(e)) throw e;
    const r = await call('cache').catch(() => { throw e; }); // no saved copy: still "offline"
    staleAt = Math.min(staleAt ?? Infinity, r.at);
    offline(staleAt, e);
    return r.data;
  });
};
const pget = (path) => viaDisk((mode) => portal.get(path, mode));
const pajax = (method, args) => viaDisk((mode) => portal.ajax(method, args, mode));

async function fromDisk(load) {
  diskMode = true;
  diskAt = Infinity;
  try {
    const data = await load();
    return { data, at: diskAt };
  } catch {
    return null; // nothing saved yet for some part of this view
  } finally {
    diskMode = false;
  }
}

// Builds DOM safely: strings become text nodes, never HTML.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  el.append(...clean(kids));
  return el;
}

function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const use = document.createElementNS(NS, 'use');
  svg.setAttribute('class', 'i');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

// Per-viewer UI prefs only; storage may be unavailable.
function pref(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
}

// Children of el animate in one after another (see .stagger in app.css).
function stagger(el) {
  [...el.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14)));
  el.classList.add('stagger');
  return el;
}

// Moves the .ind pill of a nav/segmented control under its .active child.
function slide(box) {
  const a = box?.querySelector('.active');
  const ind = box?.querySelector('.ind');
  if (!a || !ind) return;
  const first = !ind.style.transform; // a freshly built control: place the pill without growing it from zero
  if (first) ind.style.transition = 'none';
  Object.assign(ind.style, {
    width: `${a.offsetWidth}px`, height: `${a.offsetHeight}px`,
    transform: `translate(${a.offsetLeft}px, ${a.offsetTop}px)`,
  });
  if (first) { ind.getBoundingClientRect(); ind.style.transition = ''; } // apply, then re-enable sliding
}

function seg(items, active, onpick) {
  const box = h('div', { class: 'seg' }, h('span', { class: 'ind' }), items.map(([key, label]) =>
    h('button', { class: key === active ? 'active' : null, 'data-key': key, onclick: () => {
      box.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
      slide(box);
      onpick(key);
    } }, label)));
  return box;
}

// ---- parsers (take a Document from the portal) ----

function parseSchedule(doc) {
  const n = Number(txt(doc, '.card__heading-second-note--week').match(/(\d)-я/)?.[1]);
  const weeks = {};
  for (const panel of doc.querySelectorAll('[data-schedule-week-panel]')) {
    const key = panel.dataset.scheduleWeekPanel;
    const days = [...panel.querySelectorAll('a.schedule__item')].map((a) => {
      const id = a.getAttribute('href').slice(1); // dayYYYYMMDD
      const [, y, m, d] = id.match(/(\d{4})(\d\d)(\d\d)/);
      const date = new Date(y, m - 1, d);
      const pairs = [...(doc.getElementById(id)?.querySelectorAll('tbody tr') || [])].map((tr) => ({
        time: txt(tr, '.schedule-table_time'),
        place: txt(tr, '.schedule-table_adress'),
        type: txt(tr, '.schedule-table_type'),
        subject: txt(tr, '.schedule-table_exam'),
        teacher: txt(tr, '.schedule-table_category'),
        link: tr.querySelector('.schedule-table_vcs-button-column a')?.href,
      })).filter((p) => p.time);
      return { date, pairs };
    });
    const range = txt(doc, `[data-schedule-week="${key}"] .schedule-week-switch__range`);
    weeks[key] = { range, days };
  }
  // Portal shows parity of the current week only; next week flips it.
  if (n) {
    if (weeks.current) weeks.current.parity = n;
    if (weeks.next) weeks.next.parity = n === 1 ? 2 : 1;
  }
  return weeks;
}

function parseGrades(doc) {
  return [...doc.querySelectorAll('#overview-grade tbody tr:not(.emptyrow)')].map((tr) => ({
    course: txt(tr, '.c0'),
    url: tr.querySelector('.c0 a')?.href,
    grade: txt(tr, '.c1'),
  })).filter((g) => g.course);
}

// /my/ block "proffesional_info": table#table_info rows of label | value.
function parseProfile(doc) {
  const fields = [...doc.querySelectorAll('#table_info tr')]
    .filter((tr) => tr.cells.length >= 2)
    .map((tr) => [tr.cells[0].textContent.trim(), tr.cells[tr.cells.length - 1].textContent.trim()])
    .filter(([, v]) => v);
  const get = (re) => fields.find(([k]) => re.test(k))?.[1] || '';
  return { name: get(/ФИО/), group: get(/Группа/), year: get(/^Курс/), fields: fields.filter(([k]) => !/ФИО/.test(k)) };
}

function parseDebts(doc) {
  return { academic: txt(doc, '.academy-counter'), finance: txt(doc, '.finance-counter') };
}

// Links in a parsed page resolve against the renderer's file:// URL, so rebuild them on the portal.
const abs = (a) => a && new URL(a.getAttribute('href'), BASE).href;
const links = (cell) => [...cell?.querySelectorAll('a') || []].map((a) => ({ title: a.textContent.trim(), url: abs(a) }));

// Both CDO pages are Bootstrap tabs "N семестр" -> pane with one table.
function semesterTabs(doc) {
  return [...doc.querySelectorAll('a[data-toggle][href^="#"]')].filter((a) => /семестр/.test(a.textContent))
    .map((a) => ({ name: a.textContent.trim(), pane: doc.getElementById(a.getAttribute('href').slice(1)) }));
}

// /blocks/buttons/academic_progress.php: Оценка качества | Дисциплина | Дата | Вид контроля | Отметка | Пересдача | Преподаватель
function parseProgress(doc) {
  return semesterTabs(doc).map(({ name, pane }) => ({
    name,
    rows: [...pane?.querySelectorAll('tbody tr') || []].filter((tr) => tr.cells.length >= 7).map((tr) => {
      const c = (i) => tr.cells[i].textContent.trim();
      return {
        survey: abs(tr.cells[0].querySelector('a')), subject: c(1), date: c(2).replace(/г\.?$/, ''),
        control: c(3), mark: c(4), retake: c(5),
        teachers: [...tr.cells[6].childNodes].map((n) => n.textContent.trim()).filter(Boolean),
      };
    }),
  }));
}

// /CDO/eduplan.php: № | Код | Дисциплина (syllabus link) | Форма контроля | Всего | Лек | Пр | Лаб | СРС | Методические материалы | Файлы
function parsePlan(doc) {
  return semesterTabs(doc).map(({ name, pane }) => ({
    name,
    rows: [...pane?.querySelectorAll('tbody tr') || []].filter((tr) => tr.cells.length >= 11).map((tr) => {
      const c = (i) => tr.cells[i].textContent.trim();
      const n = (i) => Number(c(i)) || 0;
      return {
        code: c(1), name: c(2), syllabus: abs(tr.cells[2].querySelector('a')), control: c(3).replace(/\s+/g, ' '),
        total: n(4), lect: n(5), pract: n(6), lab: n(7), self: n(8),
        materials: links(tr.cells[9]), files: links(tr.cells[10]),
      };
    }),
  }));
}

// ---- views: load() fetches, tools()/render() build DOM from the cached result ----

// /my/ holds week parity and profile; the timetable itself is loaded by the schedule block via AJAX.
async function loadMy() {
  const [my, sched] = await Promise.all([pget('/my/'), pget('/blocks/schedule/ajax_schedule.php')]);
  const doc = html(my + JSON.parse(sched).html);
  const data = { weeks: parseSchedule(doc), profile: parseProfile(doc), userid: Number(doc.querySelector('[data-userid]')?.dataset.userid) };
  renderProfile(data.profile);
  mySesskey = my.match(/"sesskey":"(\w+)"/)?.[1] || mySesskey;
  myUserid = data.userid || myUserid;
  return data;
}

// Absolute start/end for every pair in the loaded weeks, in time order.
function allPairs(weeks) {
  const at = (date, hhmm) => { const d = new Date(date); d.setHours(...hhmm.split(':').map(Number), 0, 0); return d; };
  return Object.values(weeks).flatMap((w) => w.days.flatMap((d) => d.pairs.map((p) => {
    const [from, to] = p.time.split(/\s*-\s*/);
    return { ...p, day: d, start: at(d.date, from), end: at(d.date, to) };
  }))).sort((a, b) => a.start - b.start);
}

function pairRow(p, isToday, nowMin) {
  const [from, to] = p.time.split(/\s*-\s*/);
  const state = !isToday ? '' : nowMin >= minutes(to) ? ' past' : nowMin >= minutes(from) ? ' now' : '';
  return h('div', { class: 'pair' + state },
    h('div', { class: 'time' }, `${from}–${to}`),
    h('div', { class: 'subj' }, h('span', { class: 'badge ' + typeClass(p.type) }, T(p.type)), p.subject),
    h('div', { class: 'meta' }, [p.place, p.teacher].filter(Boolean).join(' · '),
      p.link ? h('div', {}, h('a', { href: '#', class: 'online', onclick: (e) => { e.preventDefault(); portal.open(p.link); } },
        icon('video'), T('Подключиться онлайн'))) : null));
}

function dayCard(d, now = new Date()) {
  const isToday = d.date.toDateString() === now.toDateString();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return h('div', { class: 'card day' + (isToday ? ' today' : '') },
    h('h3', {}, weekday(d.date), h('small', {}, d.date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })),
      isToday ? h('span', { class: 'chip' }, T('Сегодня')) : null),
    d.pairs.map((p) => pairRow(p, isToday, nowMin)));
}

let week = new Date().getDay() === 0 ? 'next' : 'current'; // Sunday: show upcoming week, like the portal
const roman = (n) => (n === 1 ? 'I' : 'II');
const minutes = (hhmm) => { const [hh, mm] = hhmm.split(':').map(Number); return hh * 60 + mm; };

function typeClass(t) {
  if (/лекц/i.test(t)) return 'lecture';
  if (/практ|семин/i.test(t)) return 'practice';
  if (/лаб/i.test(t)) return 'lab';
  return '';
}

// Toolbar state for the list views; sort/filter choices are remembered.
const ui = {
  courses: { q: '', sort: pref('sort-courses') || 'name', only: pref('only-courses') || 'all' },
  course: { id: null, info: null, closed: new Set(), tab: 'content', q: '' }, // course opened inside the app; closed = collapsed section ids
  grades: { q: '', sort: pref('sort-grades') || 'name', only: pref('only-graded') || 'all' },
  progress: { sem: 'all' },
  plan: { q: '', sem: null }, // null = pick the current semester from the profile
  notes: { filter: 'all', open: null },
  cal: { y: new Date().getFullYear(), m: new Date().getMonth(), sel: new Date().toDateString(), show: 'all' },
  chat: { q: '', open: null, draft: null }, // draft = person to write to with no conversation yet
  svc: { tab: 'orders', path: '/', fs: null, flash: null }, // Сервисы: sub-tab, files folder, files draft area
};
const byName = (a = '', b = '') => a.localeCompare(b, 'ru');
const matches = (text, q) => text.toLowerCase().includes(q.toLowerCase());

// Search hides cards in place (no re-render, so no replayed animation per keystroke).
function search(placeholder, state) {
  return h('input', { type: 'search', placeholder, value: state.q, oninput: (e) => {
    state.q = e.target.value;
    for (const el of document.querySelectorAll('#content [data-name]')) el.hidden = !matches(el.dataset.name, state.q);
  } });
}

function select(options, value, onchange) {
  return h('select', { class: 'select', onchange: (e) => onchange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value ? '' : null }, label)));
}

const hhmm = (d) => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
const relTime = (sec) => {
  const left = sec - Date.now() / 1000;
  return Math.abs(left) < 86400 ? rel.format(Math.round(left / 3600), 'hour') : rel.format(Math.round(left / 86400), 'day');
};
function duration(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m < 60) return T('{0} мин', m);
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return m % 60 ? T('{0} ч {1} мин', hrs, m % 60) : T('{0} ч', hrs);
  return T('{0} дн.', Math.round(hrs / 24));
}

// "Now / next pair" banner on the Today screen; rebuilt every 30 s by the ticker below.
function hero(pairs) {
  const now = new Date();
  const cur = pairs.find((p) => p.start <= now && now < p.end);
  const p = cur || pairs.find((x) => x.start > now);
  if (!p) return h('div', { class: 'hero' }, h('div', { class: 'hero-label' }, T('Занятий не запланировано')), h('div', { class: 'hero-title' }, T('Можно отдохнуть')));
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const dayWord = p.start.toDateString() === now.toDateString() ? T('сегодня')
    : p.start.toDateString() === tomorrow.toDateString() ? T('завтра')
    : p.start.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  return h('div', { class: 'hero' + (cur ? ' live' : '') },
    h('div', { class: 'hero-label' }, cur ? h('span', { class: 'live-dot' }) : null, cur ? T('Идёт сейчас') : T('Следующая пара')),
    h('div', { class: 'hero-title' }, p.subject),
    h('div', { class: 'hero-meta' }, [p.type, p.place, p.teacher].filter(Boolean).join(' · ')),
    h('div', { class: 'hero-when' }, cur
      ? T('до {0} · осталось {1}', hhmm(p.end), duration(p.end - now))
      : T('{0} в {1} · через {2}', dayWord, hhmm(p.start), duration(p.start - now))),
    cur ? h('div', { class: 'hero-bar' }, h('i', { style: `width:${((now - p.start) / (p.end - p.start)) * 100}%` })) : null,
    p.link ? h('button', { class: 'hero-btn', onclick: () => portal.open(p.link) }, icon('video'), T('Подключиться')) : null);
}

function paneHead(iconName, title, extra, onMore) {
  return h('div', { class: 'pane-head' }, icon(iconName), h('h3', {}, title), extra,
    onMore ? h('button', { class: 'more', onclick: onMore }, T('Все →')) : null);
}

const views = {
  today: {
    title: T('Сегодня'),
    sk: 'grid',
    async load() {
      const [my, deadlines, debts] = await Promise.all([loadMy(), views.deadlines.load(), pget('/blocks/buttons/debts.php')]);
      cache.schedule = my.weeks; // warm the other tabs for free
      cache.deadlines = deadlines;
      const [unread, notes] = my.userid ? await Promise.all([
        pajax('message_popup_get_unread_popup_notification_count', { useridto: my.userid }),
        pajax('message_popup_get_popup_notifications', { useridto: my.userid, newestfirst: true, limit: 5, offset: 0 }),
      ]) : [0, { notifications: [] }];
      return { ...my, events: deadlines.events, debts: parseDebts(html(debts)), unread, notes: notes.notifications };
    },
    render(d) {
      const now = new Date();
      const hr = now.getHours();
      const hello = hr < 5 ? T('Доброй ночи') : hr < 12 ? T('Доброе утро') : hr < 18 ? T('Добрый день') : T('Добрый вечер');
      const first = d.profile.name.split(/\s+/)[1];
      const parity = d.weeks.current?.parity;
      const pairs = allPairs(d.weeks);
      const todayDay = Object.values(d.weeks).flatMap((w) => w.days).find((x) => x.date.toDateString() === now.toDateString());
      const nextDay = pairs.find((p) => p.start > now && p.day !== todayDay)?.day;
      const upcoming = d.events.filter((e) => e.timesort * 1000 > now).slice(0, 4);
      const overdue = d.events.length - d.events.filter((e) => e.timesort * 1000 > now).length;
      const debtsOk = /^0\D*$/.test(d.debts.academic) && /^0([,.]0+)?\D*$/.test(d.debts.finance);
      const debtsPage = () => portal.open(`${BASE}/blocks/buttons/debts.php`);

      return [
        h('p', { class: 'greet' }, h('b', {}, first ? `${hello}, ${first}` : hello),
          ` · ${now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}`,
          parity ? h('span', { class: 'week-num' }, T('{0} неделя', roman(parity))) : null),
        // Two aligned columns under the banner: classes left, everything else stacked right.
        stagger(h('div', { class: 'dash' },
          hero(pairs),

          h('div', { class: 'dash-col' }, h('div', { class: 'card pane' },
            paneHead('schedule', todayDay ? T('Пары сегодня') : T('Ближайшие занятия'),
              !todayDay && nextDay ? h('span', { class: 'pill' }, nextDay.date.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })) : null,
              () => show('schedule')),
            (todayDay || nextDay)
              ? (todayDay || nextDay).pairs.map((p) => pairRow(p, !!todayDay, now.getHours() * 60 + now.getMinutes()))
              : h('div', { class: 'empty' }, T('Пар на ближайшие дни нет')))),

          h('div', { class: 'dash-col' },
          h('div', { class: 'card pane' },
            paneHead('deadlines', T('Дедлайны'), overdue ? h('span', { class: 'pill danger' }, T('{0} просрочено', overdue)) : null, () => show('deadlines')),
            upcoming.length ? upcoming.map((e) => h('button', { class: 'mini', onclick: () => portal.open(e.url) },
              h('span', { class: 'dot' }),
              h('div', { class: 'main' }, h('div', { class: 't' }, e.name), h('div', { class: 'sub' }, [e.course?.fullname, relTime(e.timesort)].filter(Boolean).join(' · ')))))
              : h('div', { class: 'empty' }, T('Нет предстоящих дедлайнов'))),

          h('div', { class: 'card pane' },
            paneHead('bell', T('Уведомления'), d.unread ? h('span', { class: 'pill' }, T('{0} новых', d.unread)) : null,
              () => show('notifications')),
            d.notes.length ? d.notes.map((n) => h('button', { class: 'mini' + (n.read ? ' read' : ''), onclick: () => portal.open(n.contexturl || `${BASE}/message/output/popup/notifications.php?notificationid=${n.id}`) },
              h('span', { class: 'dot' }),
              h('div', { class: 'main' }, h('div', { class: 't' }, n.shortenedsubject || n.subject), h('div', { class: 'sub' }, relTime(n.timecreated)))))
              : h('div', { class: 'empty' }, T('Уведомлений нет'))),

          h('div', { class: 'card pane' },
            paneHead('wallet', T('Задолженности'), h('span', { class: 'pill ' + (debtsOk ? 'ok' : 'danger') }, debtsOk ? T('Всё чисто') : T('Есть долги')), debtsPage),
            h('div', { class: 'stats' },
              h('button', { class: 'stat' + (/^0\D*$/.test(d.debts.academic) ? '' : ' bad'), onclick: debtsPage },
                h('b', {}, d.debts.academic || '—'), h('span', {}, T('академических долгов'))),
              h('button', { class: 'stat' + (/^0([,.]0+)?\D*$/.test(d.debts.finance) ? '' : ' bad'), onclick: debtsPage },
                h('b', {}, d.debts.finance || '—'), h('span', {}, T('финансовая задолженность')))))),
        )),
      ];
    },
  },

  schedule: {
    title: T('Расписание'),
    sk: 'grid',
    load: async () => (await loadMy()).weeks,
    tools(weeks) {
      if (!weeks[week]) week = Object.keys(weeks)[0];
      return seg(Object.entries(weeks).map(([k, v]) =>
        [k, (k === 'current' ? T('Текущая') : T('Следующая')) + (v.parity ? ` · ${roman(v.parity)}` : '')]), week,
      (k) => { week = k; swap(views.schedule.render(weeks), true); });
    },
    render(weeks) {
      const w = weeks[week];
      if (!w) return msg(T('Расписание не найдено на портале'));
      return [
        h('div', { class: 'week-line' }, w.parity ? h('span', { class: 'week-num' }, T('{0} неделя', roman(w.parity))) : null, w.range),
        w.days.length ? stagger(h('div', { class: 'days' }, w.days.map((d) => dayCard(d)))) : msg(T('Занятий нет')),
      ];
    },
  },

  courses: {
    title: T('Курсы'),
    sk: 'grid',
    async load() {
      const [{ courses }, recent] = await Promise.all([
        pajax('core_course_get_enrolled_courses_by_timeline_classification', { classification: 'inprogress', limit: 0, offset: 0, sort: 'fullname' }),
        pajax('core_course_get_recent_courses', { userid: await myId(), limit: 6 }).catch(() => []),
      ]);
      return { courses, recent };
    },
    tools: () => [
      search(T('Поиск курса'), ui.courses),
      select([['all', T('Все курсы')], ['fav', T('Избранные')], ['active', T('Незавершённые')]],
        ui.courses.only, (v) => { ui.courses.only = v; pref('only-courses', v); swap(views.courses.render(cache.courses), true); }),
      select([['name', T('По названию')], ['progress-asc', T('Меньше пройдено')], ['progress-desc', T('Больше пройдено')], ['category', T('По категории')]],
        ui.courses.sort, (v) => { ui.courses.sort = v; pref('sort-courses', v); swap(views.courses.render(cache.courses), true); }),
    ],
    render({ courses, recent }) {
      const pct = (c) => (c.hasprogress ? c.progress : -1); // courses without progress tracking go last
      const list = courses.filter((c) => !c.hidden && {
        all: true, fav: c.isfavourite, active: !c.hasprogress || c.progress < 100,
      }[ui.courses.only]).sort((a, b) => b.isfavourite - a.isfavourite || {
        name: (a, b) => byName(a.fullname, b.fullname),
        'progress-asc': (a, b) => (pct(a) < 0) - (pct(b) < 0) || pct(a) - pct(b),
        'progress-desc': (a, b) => pct(b) - pct(a),
        category: (a, b) => byName(a.coursecategory, b.coursecategory) || byName(a.fullname, b.fullname),
      }[ui.courses.sort](a, b)); // favourites always first
      const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
      const recentRow = recent?.length && ui.courses.only === 'all' ? h('div', { class: 'recent' },
        h('span', { class: 'tool-label' }, T('Недавние')),
        recent.map((r) => h('button', { class: 'chip-btn', onclick: () => openCourse(byId[r.id] || r) }, r.fullname))) : null;
      if (!list.length) return [recentRow, msg(ui.courses.only === 'fav' ? T('Нет избранных курсов: отметьте звёздочкой') : T('Нет курсов'))];
      return [recentRow, stagger(h('div', { class: 'courses' }, list.map((c) =>
        h('div', { class: 'card course lift', role: 'button', tabindex: 0, 'data-name': c.fullname.toLowerCase(), hidden: !matches(c.fullname, ui.courses.q),
          onclick: () => openCourse(c), onkeydown: (e) => { if (e.key === 'Enter') openCourse(c); } },
          h('div', { class: 'img', style: `background-image:url("${c.courseimage}")` },
            favButton(c)),
          h('div', { class: 'body' },
            h('div', { class: 'cat' }, c.coursecategory),
            h('div', { class: 'name' }, c.fullname),
            c.hasprogress ? [
              h('div', { class: 'bar' }, h('i', { style: `width:${c.progress}%` })),
              h('div', { class: 'pct' }, T('{0}% пройдено', Math.round(c.progress))),
            ] : null)))))];
    },
  },

  deadlines: {
    title: T('Дедлайны'),
    sk: 'rows',
    load: () => pajax('core_calendar_get_action_events_by_timesort',
      // start of today (not "now") so the request, and its disk-cache key, is the same all day
      { timesortfrom: Math.floor(new Date().setHours(0, 0, 0, 0) / 1000) - 14 * 86400, limitnum: 50 }),
    render({ events }) {
      if (!events.length) return msg(T('Нет предстоящих дедлайнов'));
      const now = Date.now() / 1000;
      const out = h('div', { class: 'list' });
      let last;
      for (const e of events) {
        const d = new Date(e.timesort * 1000);
        const day = d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
        if (day !== last) out.append(h('h4', {}, (last = day)));
        const left = e.timesort - now;
        const when = relTime(e.timesort);
        out.append(h('button', { class: 'card row lift' + (left < 0 ? ' overdue' : ''), onclick: () => portal.open(e.url) },
          h('span', { class: 'dot' }),
          h('div', { class: 'main' }, h('div', {}, e.name), h('div', { class: 'sub' }, [e.course?.fullname, when].filter(Boolean).join(' · '))),
          h('div', { class: 'right' }, left < 0 ? T('просрочено') : d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }))));
      }
      return stagger(out);
    },
  },

  grades: {
    title: T('Оценки'),
    sk: 'rows',
    load: async () => parseGrades(html(await pget('/grade/report/overview/index.php'))),
    tools: () => [
      search(T('Поиск предмета'), ui.grades),
      select([['all', T('Все предметы')], ['graded', T('Только с оценкой')]],
        ui.grades.only, (v) => { ui.grades.only = v; pref('only-graded', v); swap(views.grades.render(cache.grades), true); }),
      select([['name', T('По названию')], ['grade-desc', T('Сначала высокие')], ['grade-asc', T('Сначала низкие')]],
        ui.grades.sort, (v) => { ui.grades.sort = v; pref('sort-grades', v); swap(views.grades.render(cache.grades), true); }),
    ],
    render(grades) {
      const num = (g) => parseFloat(g.grade.replace(',', '.')); // "12,50" -> 12.5, "-" -> NaN
      const ungraded = (a, b) => isNaN(num(a)) - isNaN(num(b)); // ungraded always last
      const list = grades.filter((g) => ui.grades.only === 'all' || !isNaN(num(g))).sort({
        name: (a, b) => byName(a.course, b.course),
        'grade-desc': (a, b) => ungraded(a, b) || num(b) - num(a),
        'grade-asc': (a, b) => ungraded(a, b) || num(a) - num(b),
      }[ui.grades.sort]);
      if (!list.length) return msg(T('Оценок нет'));
      return stagger(h('div', { class: 'list' }, list.map((g) => {
        const none = isNaN(num(g));
        return h('button', { class: 'card row lift', 'data-name': g.course.toLowerCase(), hidden: !matches(g.course, ui.grades.q), onclick: () => g.url && portal.open(g.url) },
          h('div', { class: 'main' }, g.course),
          h('div', { class: 'right grade' + (none ? ' none' : '') }, none ? '—' : g.grade));
      })));
    },
  },

  progress: {
    title: T('Успеваемость'),
    sk: 'rows',
    load: async () => parseProgress(html(await pget('/blocks/buttons/academic_progress.php'))),
    tools: (sems) => seg([['all', T('Все')], ...sems.map((s, i) => [String(i), s.name])], ui.progress.sem,
      (k) => { ui.progress.sem = k; swap(views.progress.render(sems), true); }),
    render(sems) {
      if (!sems.length) return msg(T('Нет данных об успеваемости'));
      const pick = ui.progress.sem === 'all' ? sems : [sems[ui.progress.sem]].filter(Boolean);
      const rows = pick.flatMap((s) => s.rows);
      const exams = rows.filter((r) => markScore(r.mark));
      const credits = rows.filter((r) => !markScore(r.mark));
      const gpa = exams.length ? exams.reduce((a, r) => a + markScore(r.mark), 0) / exams.length : null;
      const top = exams.filter((r) => markScore(r.mark) === 5).length;
      return [
        h('div', { class: 'kpis' },
          kpi(gpa ? gpa.toFixed(2).replace('.', ',') : '—', T('средний балл'), T('по экзаменам')),
          kpi(String(exams.length), T('экзаменов'), top ? T('{0} на «отлично»', top) : ''),
          kpi(`${credits.filter((r) => /^зачтено$/i.test(r.mark)).length}/${credits.length}`, T('зачётов сдано')),
          kpi(String(rows.filter((r) => r.retake).length), T('пересдач'))),
        stagger(h('div', { class: 'list' }, pick.map((s) => [
          pick.length > 1 ? h('h4', {}, s.name) : null,
          s.rows.map((r) => h('div', { class: 'card row' },
            h('div', { class: 'main' },
              h('div', {}, r.subject),
              h('div', { class: 'sub' }, [T(r.control), r.date, r.teachers.join(', ')].filter(Boolean).join(' · ')),
              r.retake ? h('div', { class: 'sub warn' }, T('Пересдача: {0}', r.retake)) : null),
            r.survey ? h('button', { class: 'more', title: T('Оценить качество преподавания'), onclick: () => portal.open(r.survey) }, T('Оценить')) : null,
            h('div', { class: 'mark ' + markClass(r.mark) }, T(r.mark) || '—'))),
        ]))),
      ];
    },
  },

  plan: {
    title: T('Учебный план'),
    sk: 'rows',
    load: async () => parsePlan(html(await pget('/CDO/eduplan.php'))),
    tools: (sems) => [
      search(T('Поиск дисциплины'), ui.plan),
      h('span', { class: 'tool-label' }, T('Семестр')),
      seg(sems.map((s, i) => [String(i), s.name.replace(/\D+/g, '')]), planSem(sems),
        (k) => { ui.plan.sem = k; swap(views.plan.render(sems), true); }),
    ],
    render(sems) {
      const s = sems[planSem(sems)];
      if (!s) return msg(T('Учебный план не найден'));
      const sum = (k) => s.rows.reduce((a, r) => a + r[k], 0);
      const count = (re) => s.rows.filter((r) => re.test(r.control)).length;
      const load = Object.fromEntries(HOURS.map(([k]) => [k, sum(k)]));
      return [
        h('div', { class: 'kpis' },
          kpi(String(s.rows.length), T('дисциплин')),
          kpi(String(sum('total')), T('часов всего'), T('{0} аудиторных', sum('total') - sum('self'))),
          kpi(String(count(/экзамен/i)), T('экзаменов')),
          kpi(String(count(/зач/i)), T('зачётов'), count(/курсов/i) ? T('курсовых: {0}', count(/курсов/i)) : '')),
        h('div', { class: 'card pane load' },
          h('div', { class: 'pane-head' }, h('h3', {}, T('Нагрузка семестра')), h('span', { class: 'hours-total' }, T('{0} ч', sum('total')))),
          hoursBar(load), hoursLegend(load)),
        stagger(h('div', { class: 'list' }, s.rows.map(planRow))),
      ];
    },
  },
};

// ---- notifications & messages ----

let myUserid;
let mySesskey; // from /my/; some portal forms want it in the URL
const myId = async () => myUserid || (await loadMy()).userid;
const textOf = (src) => html(src || '').body.textContent.replace(/\s+/g, ' ').trim();

// Portal HTML (messages, notifications, course pages) rebuilt from a tag whitelist: no scripts,
// styles or attributes survive; links open through portal.open.
// media: course pages may show portal-hosted images; embeds (video players) become an "open" button.
const RICH_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
function rich(src, media = false) {
  const walk = (from, to) => {
    for (const n of from.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) to.append(n.textContent);
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      if (media && n.tagName === 'IMG') {
        const url = new URL(n.getAttribute('src') || '', BASE).href;
        if (url.startsWith(`${BASE}/`)) to.append(portalImg(url, { alt: n.getAttribute('alt') || '' }));
        continue;
      }
      if (media && /^(IFRAME|VIDEO|AUDIO)$/.test(n.tagName)) {
        const url = new URL(n.getAttribute('src') || n.querySelector('source')?.getAttribute('src') || '', BASE).href;
        if (/^https?:/.test(url)) to.append(h('button', { class: 'embed-btn', onclick: () => portal.open(url) }, icon('video'), T('Открыть встроенное видео / материал')));
        continue;
      }
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|IMG|VIDEO|AUDIO)$/.test(n.tagName)) continue;
      if (!RICH_TAGS.has(n.tagName)) { walk(n, to); continue; } // unwrap, keep text
      const el = document.createElement(n.tagName);
      if (n.tagName === 'A') {
        const url = abs(n);
        if (/^https?:/.test(url)) { el.href = '#'; el.title = url; el.addEventListener('click', (e) => { e.preventDefault(); portal.open(url); }); }
      }
      walk(n, el);
      to.append(el);
    }
  };
  const box = h('div', { class: 'rich' });
  walk(html(src || '').body, box);
  return box;
}

// Session-protected images (pluginfile.php) load through the main process like files: the app
// page is cross-site to the portal, so the browser won't send the session cookie itself.
function portalImg(url, attrs = {}) {
  const img = h('img', { alt: '', ...attrs });
  if (!url.includes('/pluginfile.php/')) { img.src = url; return img; } // theme images are public
  portal.file(url)
    .then(({ type, bytes }) => {
      img.onload = () => URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(new Blob([bytes], { type }));
    })
    .catch(() => img.remove());
  return img;
}

// Phones show a list or its detail (.split.detail, app.css); this closes the detail.
const splitBack = () => h('button', { class: 'icon-btn split-back', title: T('Назад'), onclick: (e) => e.target.closest('.split').classList.remove('detail') }, '‹');

function setBadge(view, count) {
  for (const b of document.querySelectorAll(`#nav [data-view="${view}"], #tabbar [data-view="${view}"]`)) {
    b.querySelector('.count')?.remove();
    if (count) b.append(h('span', { class: 'count' }, count > 99 ? '99+' : String(count)));
  }
}
portal.onUnread((c) => { setBadge('notifications', c.notifications); setBadge('messages', c.messages); });
portal.onNavigate((view) => show(view, true));

const NEWS = 'block_cdo_notif_center'; // university notice center ("Мои уведомления") items

Object.assign(views, {
  notifications: {
    title: T('Уведомления'),
    sk: 'rows',
    load: async () => pajax('message_popup_get_popup_notifications', { useridto: await myId(), newestfirst: true, limit: 50, offset: 0 }),
    tools: (d) => [
      seg([['all', T('Все')], ['unread', T('Непрочитанные')], ['news', T('Объявления')]], ui.notes.filter,
        (k) => { ui.notes.filter = k; swap(views.notifications.render(d), true); }),
      d.notifications.some((n) => !n.read) ? h('button', { class: 'tool-btn', onclick: async (e) => {
        e.currentTarget.disabled = true;
        await pajax('core_message_mark_all_notifications_as_read', { useridto: await myId() });
        d.notifications.forEach((n) => { n.read = true; });
        paint('notifications');
        portal.poll();
      } }, T('Прочитать все')) : null,
    ],
    render(d) {
      const list = d.notifications.filter((n) => ({ all: true, unread: !n.read, news: n.component === NEWS })[ui.notes.filter]);
      if (!list.length) return msg(T('Уведомлений нет'));
      const reader = h('div', { class: 'card reader' });
      const open = (n, item) => {
        ui.notes.open = n.id;
        item.parentNode.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        item.classList.add('sel');
        reader.replaceChildren(...clean([
          h('div', { class: 'reader-head' }, splitBack(),
            h('span', { class: 'pill' + (n.component === NEWS ? ' ok' : '') }, n.component === NEWS ? T('Объявление') : T('Портал')),
            h('h2', {}, textOf(n.subject)),
            h('div', { class: 'sub' }, new Date(n.timecreated * 1000).toLocaleString(LOCALE, { dateStyle: 'long', timeStyle: 'short' }))),
          rich(n.fullmessagehtml || n.text),
          n.contexturl ? h('button', { class: 'btn', onclick: () => portal.open(n.contexturl) }, n.contexturlname ? T('Открыть: {0}', textOf(n.contexturlname)) : T('Открыть на портале')) : null]));
        reader.scrollTop = 0;
      };
      const items = list.map((n) => {
        const item = h('button', { class: 'inbox-item' + (n.read ? '' : ' unread'), onclick: async () => {
          open(n, item);
          if (n.read) return;
          n.read = true;
          item.classList.remove('unread');
          await pajax('core_message_mark_notification_read', { notificationid: n.id, timeread: Math.floor(Date.now() / 1000) });
          portal.poll();
        } },
        h('span', { class: 'dot' }),
        h('div', { class: 'main' }, h('div', { class: 't' }, textOf(n.subject)),
          h('div', { class: 'sub' }, [n.component === NEWS ? T('Объявление') : null, relTime(n.timecreated)].filter(Boolean).join(' · '))));
        return item;
      });
      const first = list.findIndex((n) => n.id === ui.notes.open);
      requestAnimationFrame(() => open(list[Math.max(first, 0)], items[Math.max(first, 0)]));
      return h('div', { class: 'split' }, stagger(h('div', { class: 'card inbox' }, items)), reader);
    },
  },

  messages: {
    title: T('Сообщения'),
    sk: 'rows',
    load: async () => {
      const uid = await myId();
      const { conversations } = await pajax('core_message_get_conversations', { userid: uid, limitfrom: 0, limitnum: 50 });
      return { uid, conversations };
    },
    tools: () => search(T('Поиск диалога'), ui.chat),
    render({ uid, conversations: loaded }) {
      // New contact (from Участники): a draft chat until the first message creates the conversation.
      const d = ui.chat.draft;
      const existing = d && loaded.find((c) => c.type === 1 && c.members[0]?.id === d.id);
      if (existing) { ui.chat.open = existing.id; ui.chat.draft = null; }
      const conversations = d && !existing
        ? [{ id: 'draft', type: 1, draft: true, messages: [], members: [{ id: d.id, fullname: d.name, profileimageurlsmall: d.picture, canmessage: true }] }, ...loaded]
        : loaded;
      if (!conversations.length) return msg(T('Диалогов нет'));
      const chat = h('div', { class: 'card chat' });
      const nameOf = (c) => c.name || c.members.map((m) => m.fullname).join(', ') || T('Диалог');
      const items = conversations.map((c) => {
        const last = c.messages[0];
        const item = h('button', { class: 'inbox-item conv' + (c.unreadcount ? ' unread' : ''), 'data-name': nameOf(c).toLowerCase(),
          hidden: !matches(nameOf(c), ui.chat.q), onclick: () => openChat(c, item) },
        avatarOf(c.members[0], nameOf(c)),
        h('div', { class: 'main' },
          h('div', { class: 't' }, nameOf(c)),
          h('div', { class: 'sub' }, last ? `${last.useridfrom === uid ? T('Вы: ') : ''}${textOf(last.text)}` : '')),
        h('div', { class: 'conv-side' },
          last ? h('small', {}, relTime(last.timecreated)) : null,
          c.unreadcount ? h('span', { class: 'count' }, String(c.unreadcount)) : null));
        return item;
      });

      async function openChat(c, item) {
        ui.chat.open = c.id;
        item.parentNode.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        item.classList.add('sel');
        const other = c.members[0];
        const feed = h('div', { class: 'feed' }, h('div', { class: 'msg' }, T('Загрузка…')));
        const input = h('textarea', { rows: 1, placeholder: T('Сообщение…'), onkeydown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        }, oninput: () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; } });
        const sendBtn = h('button', { class: 'send', title: T('Отправить (Enter)'), onclick: () => send() }, icon('send'));
        const err = h('div', { class: 'send-err' });
        const canSend = c.type === 2 || other?.canmessage !== false;
        chat.replaceChildren(
          h('div', { class: 'chat-head' }, splitBack(), avatarOf(other, nameOf(c)),
            h('div', {}, h('b', {}, nameOf(c)), h('small', {}, c.type === 2 ? T('{0} участников', c.membercount) : other?.isonline ? T('в сети') : ''))),
          feed,
          canSend ? h('div', { class: 'composer' }, input, sendBtn) : h('div', { class: 'note composer-off' }, T('Этому собеседнику нельзя написать')),
          err);

        let lastDay;
        const bubble = (m) => {
          const d = new Date(m.timecreated * 1000);
          const day = d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
          return [
            day !== lastDay ? h('div', { class: 'day-sep' }, (lastDay = day)) : null,
            h('div', { class: 'bubble' + (m.useridfrom === uid ? ' mine' : '') }, rich(m.text), h('small', {}, hhmm(d))),
          ];
        };

        async function send() {
          const text = input.value.trim();
          if (!text || sendBtn.disabled) return;
          sendBtn.disabled = true;
          err.textContent = '';
          try {
            if (c.draft) {
              const [r] = await pajax('core_message_send_instant_messages', { messages: [{ touserid: other.id, text, textformat: 2 }] });
              if (r.errormessage) throw new Error(r.errormessage);
              ui.chat.draft = null;
              ui.chat.open = r.conversationid;
              show('messages', true); // reload: the new conversation now exists on the portal
              return;
            }
            const sent = await pajax('core_message_send_messages_to_conversation', { conversationid: c.id, messages: [{ text, textformat: 2 }] });
            feed.append(...sent.map(bubble).flat().filter(Boolean));
            input.value = '';
            input.style.height = 'auto';
            feed.scrollTop = feed.scrollHeight;
          } catch (e) {
            err.textContent = T('Не отправлено: {0}', errText(e));
          } finally {
            sendBtn.disabled = false;
            input.focus();
          }
        }

        if (c.draft) {
          feed.replaceChildren(h('div', { class: 'msg' }, T('Напишите первое сообщение — диалог появится после отправки')));
          input.focus();
          return;
        }
        try {
          const { messages } = await pajax('core_message_get_conversation_messages',
            { currentuserid: uid, convid: c.id, limitfrom: 0, limitnum: 50, newest: true });
          if (ui.chat.open !== c.id) return; // user already switched to another chat
          feed.replaceChildren(...messages.reverse().flatMap(bubble).filter(Boolean));
          feed.scrollTop = feed.scrollHeight;
        } catch (e) {
          feed.replaceChildren(errorBox(e));
        }
        if (c.unreadcount) {
          c.unreadcount = 0;
          item.classList.remove('unread');
          item.querySelector('.count')?.remove();
          await pajax('core_message_mark_all_conversation_messages_as_read', { userid: uid, conversationid: c.id });
          portal.poll();
        }
      }

      const first = Math.max(conversations.findIndex((c) => c.id === ui.chat.open), 0);
      requestAnimationFrame(() => openChat(conversations[first], items[first]));
      return h('div', { class: 'split' }, stagger(h('div', { class: 'card inbox' }, items)), chat);
    },
  },
});

// ---- course inside the app ----

// /course/view.php (format topics): sections -> activities with type, link, completion state.
function parseCourse(doc) {
  return {
    title: txt(doc, 'h1'),
    sections: [...doc.querySelectorAll('li.section')].map((s) => ({
      id: s.id,
      name: txt(s, 'h3.sectionname') || txt(s, '.sectionname'),
      summary: s.querySelector('.summary')?.innerHTML.trim() || '',
      activities: [...s.querySelectorAll('li.activity')].map((a) => {
        const nameEl = a.querySelector('.instancename');
        nameEl?.querySelector('.accesshide')?.remove(); // screen-reader suffix like " Файл"
        const state = a.querySelector('.actions img')?.getAttribute('src')?.match(/completion-(manual|auto)-(\w+)$/);
        const form = a.querySelector('form.togglecompletion');
        return {
          id: a.id.replace('module-', ''),
          type: a.className.match(/modtype_(\w+)/)?.[1] || '',
          name: nameEl?.textContent.trim() || '',
          url: abs(a.querySelector('.activityinstance a')),
          icon: a.querySelector('.activityicon')?.getAttribute('src'),
          content: a.querySelector('.contentwithoutlink')?.innerHTML || '',
          after: a.querySelector('.contentafterlink')?.innerHTML || '',
          restricted: txt(a, '.availabilityinfo'),
          completion: state && {
            manual: state[1] === 'manual', done: /^(y|pass)$/.test(state[2]), fail: state[2] === 'fail',
            toggle: form && Object.fromEntries(['id', 'modulename'].map((k) => [k, form.querySelector(`[name=${k}]`)?.value])),
          },
        };
      }),
    })).filter((s) => s.activities.length || s.summary),
  };
}

const MOD_NAMES = {
  page: T('Страница'), resource: T('Файл'), quiz: T('Тест'), assign: T('Задание'), forum: T('Форум'), url: T('Ссылка'), folder: T('Папка'),
  book: T('Книга'), lesson: T('Лекция'), feedback: T('Обратная связь'), choice: T('Опрос'), glossary: T('Глоссарий'), wiki: T('Вики'),
  workshop: T('Семинар'), scorm: 'SCORM', lti: T('Внешний ресурс'), attendance: T('Посещаемость'), bigbluebuttonbn: T('Вебинар'),
  h5pactivity: 'H5P', questionnaire: T('Анкета'), chat: T('Чат'), data: T('База данных'),
};

function openCourse(c) {
  if (ui.course.id !== c.id) { delete cache.course; Object.assign(ui.course, { closed: new Set(), tab: 'content', q: '' }); }
  ui.course.id = c.id;
  ui.course.info = c;
  show('course');
}

function favButton(c) {
  const b = h('button', { class: 'fav' + (c.isfavourite ? ' on' : ''), title: T('Избранное'), onclick: async (e) => {
    e.stopPropagation();
    c.isfavourite = !c.isfavourite;
    b.classList.toggle('on', c.isfavourite);
    try {
      await pajax('core_course_set_favourite_courses', { courses: [{ id: c.id, favourite: c.isfavourite }] });
    } catch {
      c.isfavourite = !c.isfavourite; // revert on failure
      b.classList.toggle('on', c.isfavourite);
    }
  } }, icon('star'));
  return b;
}

// Re-read the course after something may have changed completion (viewed a page, opened a file).
async function refreshCourse() {
  const id = ui.course.id;
  const fresh = await views.course.load().catch(() => null);
  if (!fresh || ui.course.id !== id) return;
  cache.course = fresh;
  if (current === 'course') swap(views.course.render(fresh), true);
}

// Resources by file type, from the activity icon (theme/image.php/.../f/pdf-24).
function kindOf(a) {
  if (a.type === 'page') return 'page';
  if (a.type === 'url') return 'link';
  if (a.type === 'folder') return 'other';
  if (a.type !== 'resource') return null; // tests, forums, assignments are not "materials"
  const f = a.icon?.match(/\/f\/([a-z]+)/)?.[1] || '';
  if (/mpeg|video|quicktime|avi|wmv|mp4/.test(f)) return 'video';
  if (f === 'pdf') return 'pdf';
  if (/powerpoint|impress/.test(f)) return 'slides';
  if (/document|writer|text|spreadsheet|calc/.test(f)) return 'docs';
  return 'other';
}
const KINDS = [['video', T('Видео')], ['pdf', 'PDF'], ['slides', T('Презентации')], ['docs', T('Документы')], ['page', T('Страницы и лекции')], ['link', T('Ссылки')], ['other', T('Другое')]];

async function openActivity(a) {
  const kind = kindOf(a);
  if (kind === 'page') return openReader(a);
  if (kind === 'pdf' || kind === 'video') return openFile(a, kind);
  portal.open(a.url); // tests, assignments, forums, presentations: portal window / download
  if (a.completion && !a.completion.done && !a.completion.manual) setTimeout(refreshCourse, 2000);
}

function showReader(a, body, media = false) {
  $('#reader-title').textContent = a.name;
  $('#reader-open').onclick = () => portal.open(a.url);
  $('#reader').classList.toggle('media', media);
  $('#reader-body').replaceChildren(body);
  $('#reader').showModal();
}

// Course "page" activities are read in an in-app dialog; viewing it on the portal marks it complete.
async function openReader(a) {
  showReader(a, msg(T('Загрузка…')));
  try {
    const doc = html(await pget(a.url.replace(BASE, '')));
    const box = doc.querySelector('[role=main] .box.generalbox') || doc.querySelector('[role=main]');
    $('#reader-body').replaceChildren(rich(box?.innerHTML, true));
  } catch (e) {
    $('#reader-body').replaceChildren(errorBox(e));
  }
  if (a.completion && !a.completion.done) refreshCourse();
}

// PDFs use Chromium's built-in viewer, video files a <video>. The bytes come through the main
// process (it has the session cookie) and are shown from a local blob: URL.
let blobUrl;
async function openFile(a, kind) {
  if (kind === 'pdf' && portal.platform === 'android') { // Android WebView has no PDF viewer: system app
    portal.download(a.url, a.name).then(() => a.completion && !a.completion.done && refreshCourse(), (e) => showReader(a, errorBox(e)));
    return;
  }
  showReader(a, msg(T('Загрузка файла…')), true);
  try {
    const { type, bytes } = await portal.file(a.url);
    if (!$('#reader').open || $('#reader-title').textContent !== a.name) return; // closed or switched meanwhile
    URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([bytes], { type: kind === 'pdf' ? 'application/pdf' : type }));
    $('#reader-body').replaceChildren(kind === 'video'
      ? h('video', { class: 'player', src: blobUrl, controls: '', autoplay: '' })
      : h('iframe', { class: 'pdf', src: blobUrl, title: a.name }));
  } catch (e) {
    $('#reader-body').replaceChildren(isOffline(e)
      ? stateBox({ kind: 'offline', title: T('Файл недоступен без подключения'), text: T('PDF и видео открываются только при связи с порталом.') })
      : errorBox(e));
  }
  if (a.completion && !a.completion.done) refreshCourse(); // downloading counts as viewing
}
$('#reader-close').addEventListener('click', () => $('#reader').close());
$('#reader').addEventListener('click', (e) => { if (e.target === $('#reader')) $('#reader').close(); });
// Stop video/PDF and free the file after the close animation, unless the dialog was reopened meanwhile.
$('#reader').addEventListener('close', () => setTimeout(() => {
  if ($('#reader').open) return;
  $('#reader-body').replaceChildren();
  URL.revokeObjectURL(blobUrl);
}, 300));

function completionCheck(a) {
  const c = a.completion;
  if (!c) return null;
  const titleOf = () => (c.manual ? (c.done ? T('Снять отметку о выполнении') : T('Отметить как выполненное')) : (c.done ? T('Выполнено') : T('Отметится автоматически')));
  const el = h(c.manual ? 'button' : 'span', { class: 'check' + (c.done ? ' done' : '') + (c.fail ? ' fail' : '') + (c.manual ? ' manual' : ''), title: titleOf() }, icon('check'));
  if (c.manual && c.toggle) {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      el.disabled = true;
      const r = await portal.post('/course/togglecompletion.php', { ...c.toggle, completionstate: c.done ? '0' : '1', fromajax: '1' }).catch(() => '');
      if (/OK/.test(r)) {
        c.done = !c.done;
        swap(views.course.render(cache.course), true); // update counters quietly
      } else {
        el.disabled = false;
      }
    });
  }
  return el;
}

function activityRow(a) {
  if (a.type === 'label') return h('div', { class: 'act label-act' }, rich(a.content, true), completionCheck(a));
  return h('div', { class: 'act' + (a.restricted ? ' locked' : ''), 'data-name': a.name.toLowerCase(), hidden: !matches(a.name, ui.course.q) },
    a.icon ? h('img', { class: 'act-icon', src: a.icon, alt: '' }) : null,
    h('div', { class: 'act-main' },
      h('button', { class: 'act-link', disabled: a.url ? null : '', onclick: () => openActivity(a) }, a.name),
      h('div', { class: 'sub' }, [MOD_NAMES[a.type] || a.type, a.restricted].filter(Boolean).join(' · ')),
      a.after ? rich(a.after, true) : null),
    completionCheck(a));
}

function contentTab(c) {
  if (!c.sections.length) return msg(T('В курсе пока нет материалов'));
  return stagger(h('div', { class: 'sections' }, c.sections.map((s) => {
    const t = tally(s.activities);
    const det = h('details', { class: 'card section', open: ui.course.closed.has(s.id) ? null : '' },
      h('summary', {}, h('span', { class: 'sec-name' }, s.name || T('Без названия')),
        t.total ? h('span', { class: 'pill' + (t.done === t.total ? ' ok' : '') }, `${t.done}/${t.total}`) : null),
      s.summary ? rich(s.summary, true) : null,
      h('div', { class: 'acts' }, s.activities.map(activityRow)));
    det.addEventListener('toggle', () => { if (det.open) ui.course.closed.delete(s.id); else ui.course.closed.add(s.id); });
    return det;
  })));
}

function materialsTab(c) {
  const items = c.sections.flatMap((s) => s.activities.map((a) => ({ a, kind: kindOf(a), sec: s.name }))).filter((x) => x.kind);
  if (!items.length) return msg(T('Файлов и страниц в курсе нет'));
  return stagger(h('div', { class: 'mat-groups' }, KINDS.map(([kind, label]) => {
    const group = items.filter((x) => x.kind === kind);
    if (!group.length) return null;
    return h('section', { class: 'mat-group' },
      h('h4', {}, label, h('span', { class: 'n' }, String(group.length))),
      h('div', { class: 'mat-grid' }, group.map(({ a, sec }) =>
        h('button', { class: 'card mat lift', 'data-name': a.name.toLowerCase(), hidden: !matches(a.name, ui.course.q), onclick: () => openActivity(a) },
          a.icon ? h('img', { src: a.icon, alt: '' }) : icon('courses'),
          h('div', { class: 'main' }, h('div', { class: 't' }, a.name), h('div', { class: 'sub' }, sec)),
          a.completion?.done ? h('span', { class: 'mat-done', title: T('Просмотрено') }, icon('check')) : null))));
  })));
}

// /user/index.php participants table: name (+profile link, picture) | roles | groups | last access.
function parsePeople(doc) {
  return [...doc.querySelectorAll('table tbody tr:not(.emptyrow)')].filter((tr) => tr.cells.length >= 4).map((tr) => {
    const a = tr.cells[0].querySelector('a');
    const img = tr.cells[0].querySelector('img');
    return {
      id: Number(a && new URL(abs(a)).searchParams.get('id')),
      name: tr.cells[0].textContent.trim(),
      picture: img && !img.classList.contains('defaultuserpic') ? img.getAttribute('src') : null,
      roles: tr.cells[1].textContent.trim(),
      groups: tr.cells[2].textContent.trim(),
      last: tr.cells[3].textContent.trim(),
    };
  }).filter((p) => p.id);
}

// Opens the chat with that person in Сообщения; without one yet, a draft chat there.
async function writeTo(userid, name, picture) {
  try {
    const conv = await pajax('core_message_get_conversation_between_users',
      { userid: await myId(), otheruserid: userid, includecontactrequests: false, includeprivacyinfo: false });
    ui.chat.open = conv.id;
    ui.chat.draft = null;
  } catch {
    ui.chat.draft = { id: userid, name, picture };
    ui.chat.open = 'draft';
  }
  show('messages', true);
}

function peopleTab(c) {
  if (!c.people) {
    pget(`/user/index.php?id=${ui.course.id}&perpage=5000`)
      .then((t) => { c.people = parsePeople(html(t)); })
      .catch((e) => { c.people = { error: e }; })
      .then(() => { if (current === 'course' && ui.course.tab === 'people' && cache.course === c) swap(views.course.render(c), true); });
    return skeleton('rows');
  }
  if (c.people.error) return errorBox(c.people.error, () => { delete c.people; swap(views.course.render(c), true); });
  const teacher = (p) => /преподав|учител|teacher|ассистент|менеджер/i.test(p.roles);
  const row = (p) => h('div', { class: 'card row person', 'data-name': p.name.toLowerCase(), hidden: !matches(p.name, ui.course.q) },
    avatarOf({ profileimageurlsmall: p.picture }, p.name),
    h('div', { class: 'main' }, h('div', {}, p.name),
      h('div', { class: 'sub' }, [p.roles, p.groups, p.last && T('в курсе: {0}', p.last.toLowerCase())].filter(Boolean).join(' · '))),
    p.id !== myUserid ? h('button', { class: 'more', onclick: () => writeTo(p.id, p.name, p.picture) }, T('Написать')) : null);
  const teachers = c.people.filter(teacher);
  const students = c.people.filter((p) => !teacher(p));
  return stagger(h('div', { class: 'list' },
    teachers.length ? [h('h4', {}, T('Преподаватели · {0}', teachers.length)), teachers.map(row)] : null,
    students.length ? [h('h4', {}, T('Студенты · {0}', students.length)), students.map(row)] : null));
}

const tally = (acts) => {
  const tracked = acts.filter((a) => a.completion);
  return { done: tracked.filter((a) => a.completion.done).length, total: tracked.length };
};

Object.assign(views, {
  course: {
    title: () => ui.course.info?.fullname || T('Курс'),
    hidden: true,      // not a sidebar tab; opened from Курсы
    parent: 'courses', // sidebar highlight
    sk: 'rows',
    load: async () => parseCourse(html(await pget(`/course/view.php?id=${ui.course.id}`))),
    tools: (c) => [
      h('button', { class: 'tool-btn', onclick: () => show('courses') }, T('← Курсы')),
      seg([['content', T('Содержание')], ['materials', T('Материалы')], ['people', T('Участники')]], ui.course.tab,
        (k) => { ui.course.tab = k; swap(views.course.render(c), true); }),
      search(T('Поиск'), ui.course),
      h('button', { class: 'icon-btn', title: T('Открыть на портале'), onclick: () => portal.open(`${BASE}/course/view.php?id=${ui.course.id}`) }, icon('external')),
    ],
    render(c) {
      const info = ui.course.info || {};
      const all = tally(c.sections.flatMap((s) => s.activities));
      return [
        h('div', { class: 'card course-hero' },
          info.courseimage ? h('div', { class: 'img', style: `background-image:url("${info.courseimage}")` }) : null,
          h('div', { class: 'body' },
            h('div', { class: 'cat' }, info.coursecategory || c.title),
            all.total ? [
              h('div', { class: 'bar' }, h('i', { style: `width:${(all.done / all.total) * 100}%` })),
              h('div', { class: 'pct' }, T('Выполнено {0} из {1}', all.done, all.total)),
            ] : h('div', { class: 'pct' }, T('Отслеживание выполнения не включено')),
            h('div', { class: 'hero-actions' },
              info.id ? favButton(info) : null,
              h('button', { class: 'chip-btn', onclick: () => portal.open(`${BASE}/grade/report/user/index.php?id=${ui.course.id}`) }, T('Оценки по курсу'))))),
        { content: contentTab, materials: materialsTab, people: peopleTab }[ui.course.tab](c),
      ];
    },
  },
});

// ---- calendar ----

const DAY_MS = 86400000;
const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const monthKey = (y, m) => `${y}-${m}`;

async function loadMonth(y, m) {
  const d = await pajax('core_calendar_get_calendar_monthly_view', { year: y, month: m + 1, courseid: 1, includenavigation: false, mini: false });
  return d.weeks.flatMap((w) => w.days).flatMap((day) => day.events);
}

// Pairs for a date: the two loaded weeks are exact; later weeks repeat the I/II pattern
// (even week offset = current week's layout, odd = next week's) and are marked as a guess.
// ponytail: the guess ignores holidays and semester end; only shown up to 8 weeks ahead.
function pairsOn(date, weeks) {
  const key = date.toDateString();
  for (const w of Object.values(weeks)) {
    const day = w.days.find((d) => d.date.toDateString() === key);
    if (day) return { pairs: day.pairs, guess: false };
  }
  const cur = weeks.current?.days[0]?.date;
  if (!cur || date < new Date().setHours(0, 0, 0, 0)) return { pairs: [], guess: false };
  const offset = Math.round((mondayOf(date) - mondayOf(cur)) / (7 * DAY_MS));
  if (offset < 2 || offset > 8) return { pairs: [], guess: false };
  const template = offset % 2 ? weeks.next : weeks.current;
  const day = template?.days.find((d) => d.date.getDay() === date.getDay());
  return { pairs: day?.pairs || [], guess: true };
}

const isDeadline = (e) => e.isactionevent || /due|close/.test(e.eventtype);

Object.assign(views, {
  calendar: {
    title: T('Календарь'),
    sk: 'grid',
    // The portal's first calendar request in a session can take minutes (it builds its cache; later
    // ones take ~0.2 s). So the grid doesn't wait for it: classes show at once, the last saved events
    // stay visible, and fresh events are painted in silently when they arrive.
    async load() {
      const key = monthKey(ui.cal.y, ui.cal.m);
      const month = loadMonth(ui.cal.y, ui.cal.m);
      const my = cache.schedule ? { weeks: cache.schedule } : await loadMy();
      cache.schedule = my.weeks;
      const d = { weeks: my.weeks, months: {} };
      const settled = await Promise.race([month.then((ev) => { d.months[key] = ev; return true; }), new Promise((r) => setTimeout(r, 1500, false))]);
      if (settled) return d;
      d.months[key] = cache.calendar?.months?.[key] || []; // keep what was on screen
      d.loading = true;
      month.then((ev) => { d.months[key] = ev; }, () => {}).finally(() => {
        d.loading = false;
        if (current === 'calendar' && cache.calendar === d) paint('calendar', 'silent');
      });
      return d;
    },
    tools(d) {
      const go = async (delta) => {
        const t = delta == null ? new Date() : new Date(ui.cal.y, ui.cal.m + delta, 1);
        ui.cal.y = t.getFullYear();
        ui.cal.m = t.getMonth();
        if (delta == null) ui.cal.sel = new Date().toDateString();
        const key = monthKey(ui.cal.y, ui.cal.m);
        if (!d.months[key]) {
          $('#refresh').classList.add('spin');
          try {
            d.months[key] = await loadMonth(ui.cal.y, ui.cal.m); // falls back to a saved copy offline
          } catch {
            d.months[key] = []; // offline and never opened: show the grid with classes only
            offline();
          } finally {
            $('#refresh').classList.remove('spin');
          }
        }
        $('#content').dataset.dir = delta > 0 ? 'next' : 'prev'; // grid slides in from that side
        paint('calendar');
        setTimeout(() => delete $('#content').dataset.dir, 500);
      };
      return [
        d.loading ? h('span', { class: 'pill loading-pill' }, T('Загрузка событий…')) : null,
        seg([['all', T('Всё')], ['pairs', T('Занятия')], ['events', T('События')]], ui.cal.show,
          (k) => {
            // No rebuild: chips fade via CSS on [data-show]; only the day panel refreshes, quietly.
            ui.cal.show = k;
            $('#content').classList.add('quiet');
            const split = $('#content .cal-split');
            if (split) split.dataset.show = k;
            $('#content .cal-cell.sel')?.click();
          }),
        h('div', { class: 'month-nav' },
          h('button', { class: 'icon-btn', title: T('Предыдущий месяц'), onclick: () => go(-1) }, '‹'),
          h('span', { class: 'month-name' }, `${cap(new Date(ui.cal.y, ui.cal.m).toLocaleDateString(LOCALE, { month: 'long' }))} ${ui.cal.y}`),
          h('button', { class: 'icon-btn', title: T('Следующий месяц'), onclick: () => go(1) }, '›')),
        h('button', { class: 'tool-btn', onclick: () => go(null) }, T('Сегодня')),
        h('button', { class: 'icon-btn', title: T('Экспорт в iCal (на портале)'), onclick: () => portal.open(`${BASE}/calendar/export.php`) }, icon('external')),
      ];
    },
    render(d) {
      const events = d.months[monthKey(ui.cal.y, ui.cal.m)] || [];
      const byDay = {};
      for (const e of events) (byDay[new Date(e.timestart * 1000).toDateString()] ||= []).push(e);
      const todayKey = new Date().toDateString();

      const panel = h('div', { class: 'card reader day-panel' });
      const select = (date, cell) => {
        const showPairs = ui.cal.show !== 'events'; // read now: the filter can change without a re-render
        const showEvents = ui.cal.show !== 'pairs';
        ui.cal.sel = date.toDateString();
        cell.parentNode.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        cell.classList.add('sel');
        const { pairs, guess } = pairsOn(date, d.weeks);
        const evs = byDay[date.toDateString()] || [];
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        panel.replaceChildren(...clean([
          h('div', { class: 'reader-head' },
            h('h2', {}, date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })),
            h('div', { class: 'sub' }, [pairs.length ? `${pairs.length} ${plural(pairs.length, 'пара|пары|пар')}` : T('Пар нет'),
              evs.length ? `${evs.length} ${plural(evs.length, 'событие|события|событий')}` : null].filter(Boolean).join(' · '))),
          showEvents && evs.length ? [h('h4', { class: 'panel-h' }, T('События')), evs.map((e) =>
            h('button', { class: 'mini', onclick: () => portal.open(e.url || e.viewurl) },
              h('span', { class: 'dot' + (isDeadline(e) ? ' deadline' : '') }),
              h('div', { class: 'main' }, h('div', { class: 't' }, e.name),
                h('div', { class: 'sub' }, [hhmm(new Date(e.timestart * 1000)), e.course?.fullname].filter(Boolean).join(' · ')))))] : null,
          showPairs && pairs.length ? [h('h4', { class: 'panel-h' }, T('Занятия'),
            guess ? h('span', { class: 'pill', title: T('Расписание на портале есть только на 2 недели вперёд') }, T('по чередованию I/II')) : null),
          h('div', { class: guess ? 'guess' : '' }, pairs.map((p) => pairRow(p, date.toDateString() === todayKey, nowMin)))] : null,
          (!showEvents || !evs.length) && (!showPairs || !pairs.length) ? h('div', { class: 'empty' }, T('Ничего не запланировано')) : null]));
      };

      const first = new Date(ui.cal.y, ui.cal.m, 1);
      const start = mondayOf(first);
      const last = new Date(ui.cal.y, ui.cal.m + 1, 0);
      const weeksShown = Math.round((mondayOf(last) - start) / (7 * DAY_MS)) + 1; // Monday before the 1st .. Sunday after the last
      const cells = [];
      let selCell;
      let selDate;
      for (let i = 0; i < weeksShown * 7; i++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const key = date.toDateString();
        const evs = byDay[key] || [];
        const { pairs, guess } = pairsOn(date, d.weeks);
        const cell = h('button', {
          class: 'cal-cell' + (date.getMonth() !== ui.cal.m ? ' out' : '') + (key === todayKey ? ' today' : '')
            + (date.getDay() % 6 === 0 ? ' weekend' : ''),
          onclick: () => select(date, cell),
        },
        h('span', { class: 'cal-num' }, date.getDate()),
        pairs.length ? h('span', { class: 'cal-pairs' + (guess ? ' guess' : '') }, `${pairs.length} ${plural(pairs.length, 'пара|пары|пар')}`) : null,
        evs.slice(0, 2).map((e) => h('span', { class: 'cal-ev' + (isDeadline(e) ? ' deadline' : '') }, e.name)),
        evs.length > 2 ? h('span', { class: 'cal-more' }, T('ещё {0}', evs.length - 2)) : null);
        if (key === ui.cal.sel || (!selCell && key === todayKey)) { selCell = cell; selDate = date; }
        cells.push(cell);
      }
      if (!selCell) { selCell = cells[(first.getDay() + 6) % 7]; selDate = first; }
      requestAnimationFrame(() => select(selDate, selCell));

      return h('div', { class: 'split cal-split', 'data-show': ui.cal.show },
        h('div', { class: 'card cal' },
          h('div', { class: 'cal-head' }, [...Array(7)].map((_, i) => h('span', {}, cap(new Date(2024, 0, 1 + i).toLocaleDateString(LOCALE, { weekday: 'short' }))))), // 2024-01-01 is a Monday
          h('div', { class: 'cal-grid' }, cells)),
        panel);
    },
  },
});

// Noun form for a count in the current language. forms = Russian 'one|few|many', translated as a
// whole (English entry is 'one|other').
function plural(n, forms) {
  const f = T(forms).split('|');
  if (LANG === 'en') return f[n === 1 ? 0 : 1];
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return f[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return f[1];
  return f[2];
}

function avatarOf(member, name) {
  // Moodle's default picture is a theme image; show initials instead.
  const img = member?.profileimageurlsmall;
  if (img && !img.includes('/theme/image.php')) return portalImg(img, { class: 'avatar' });
  const [a = '', b = ''] = name.split(/\s+/);
  return h('span', { class: 'avatar' }, (b[0] || '') + (a[0] || ''));
}

// ---- services: справки, вопрос, личные файлы, библиотеки ----

// Styled yes/no dialog for anything that changes data on the portal. Resolves true/false.
function confirmBox(title, text, okLabel = T('Подтвердить')) {
  const dlg = $('#confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

const fmtSize = (b) => (b == null ? '' : b < 1024 ? T('{0} Б', b) : b < 1048576 ? T('{0} КБ', (b / 1024).toFixed(0)) : T('{0} МБ', (b / 1048576).toFixed(1).replace('.', ',')));
const formFields = (form) => Object.fromEntries([...form.querySelectorAll('input[type=hidden]')].filter((i) => i.name !== 'sesskey').map((i) => [i.name, i.value]));

// /CDO/inquiry/index.php: certificate types (select form_type) and my orders table.
function parseInquiry(doc) {
  return {
    types: [...doc.querySelector('select[name=form_type]')?.options || []].filter((o) => o.value !== '0').map((o) => [o.value, o.textContent.trim()]),
    orders: [...doc.querySelectorAll('[role=main] table tbody tr')].filter((tr) => tr.cells.length >= 4).map((tr) => {
      const c = (i) => tr.cells[i].textContent.replace(/\s+/g, ' ').trim();
      return { type: c(0), status: c(1), term: c(2), info: c(3) };
    }),
  };
}

// Step 2 of ordering: the portal's request form for one type (hidden ids + a few fields).
async function inquiryForm(type) {
  const doc = html(await pget(`/CDO/inquiry/index.php?sesskey=${mySesskey}&_qf__set_inquiry_form=1&form_type=${type}&submitbutton=1`));
  const form = [...doc.querySelectorAll('form')].find((f) => f.querySelector('[name=_qf__request_form]'));
  if (!form) throw new Error(T('Портал не вернул форму заказа'));
  const label = (el) => form.querySelector(`label[for="${el.id}"]`)?.textContent.trim() || el.name;
  return {
    hidden: formFields(form),
    submit: form.querySelector('[type=submit]')?.value || 'Заказать', // sent to the portal: stays Russian
    fields: [...form.querySelectorAll('input[type=text], textarea, select')].map((el) => ({
      name: el.name, label: label(el), value: el.value,
      options: el.tagName === 'SELECT' ? [...el.options].map((o) => [o.value, o.textContent.trim()]) : null,
    })),
  };
}

// "Полезные ссылки" block on /my/: library SSO links (signed per page load) and portal services.
const NATIVE = /Успеваемость|задолженност|Учебный план|Заказ справок|Мои уведомления|Задать вопрос|open the list/i;
function parseServiceLinks(doc) {
  return [...doc.querySelectorAll('[data-block=buttons] a')]
    .map((a) => ({ title: a.textContent.replace(/\s+/g, ' ').trim(), url: abs(a) }))
    .filter((l) => l.title && l.url && !l.url.includes('#') && !NATIVE.test(l.title));
}

const EXTRA_SERVICES = [
  [T('Курсы по выбору'), '/blocks/elective_courses/list_elective_courses.php'],
  [T('Открытые онлайн-курсы'), '/blocks/online_eduv2/list_open_courses.php'],
  [T('Портфолио'), '/blocks/exaport/view_items.php'],
  [T('Техподдержка'), 'https://support.ulsu.ru/open.php'],
];

Object.assign(views, {
  services: {
    title: T('Сервисы'),
    sk: 'rows',
    async load() {
      const [inq, qz, my] = await Promise.all([pget('/CDO/inquiry/index.php'), pget('/CDO/questionizer.php'), pget('/my/')]);
      const qdoc = html(qz);
      mySesskey = my.match(/"sesskey":"(\w+)"/)?.[1] || mySesskey;
      return {
        ...parseInquiry(html(inq)),
        categories: [...qdoc.querySelector('select[name=faculty]')?.options || []].map((o) => [o.value, o.textContent.trim()]),
        links: (() => {
          const links = parseServiceLinks(html(my));
          if (!diskMode) signed = { at: Date.now(), list: links, pending: null }; // freshly signed
          return links;
        })(),
      };
    },
    tools: (d) => seg([['orders', T('Справки')], ['question', T('Вопрос')], ['files', T('Личные файлы')], ['links', T('Библиотеки и сервисы')]], ui.svc.tab,
      (k) => { ui.svc.tab = k; swap(views.services.render(d), true); }),
    render(d) {
      return { orders: ordersTab, question: questionTab, files: filesTab, links: linksTab }[ui.svc.tab](d);
    },
  },
});

function ordersTab(d) {
  const order = h('div', { class: 'card pane form-card' });
  const step1 = () => {
    let type = d.types[0]?.[0];
    order.replaceChildren(
      h('div', { class: 'pane-head' }, icon('plan'), h('h3', {}, T('Заказать справку'))),
      h('label', { class: 'field' }, h('span', {}, T('Вид справки')),
        select(d.types, type, (v) => { type = v; })),
      h('button', { class: 'btn', onclick: () => step2(type, d.types.find(([v]) => v === type)?.[1]) }, T('Далее')));
  };
  const step2 = async (type, typeName) => {
    order.replaceChildren(msg(T('Загрузка формы…')));
    let f;
    try { f = await inquiryForm(type); } catch (e) { order.replaceChildren(errorBox(e, step1)); return; }
    const inputs = f.fields.map((x) => (x.options
      ? select(x.options, x.value, () => {})
      : h('input', { type: 'text', value: x.value || (/Телефон/i.test(x.name) ? profileData?.fields.find(([k]) => /Телефон/.test(k))?.[1] || '' : '') })));
    order.replaceChildren(
      h('div', { class: 'pane-head' }, icon('plan'), h('h3', {}, typeName)),
      f.fields.map((x, i) => h('label', { class: 'field' }, h('span', {}, T(x.label)), inputs[i])),
      h('div', { class: 'form-actions' },
        h('button', { class: 'tool-btn', onclick: step1 }, T('Назад')),
        h('button', { class: 'btn', onclick: async (e) => {
          if (!await confirmBox(T('Заказать справку?'), T('«{0}» будет заказана в деканате. Отменить заказ из приложения нельзя.', typeName), T('Заказать'))) return;
          e.currentTarget.disabled = true;
          const values = Object.fromEntries(f.fields.map((x, i) => [x.name, inputs[i].value]));
          try {
            await portal.post('/CDO/inquiry/index.php', { ...f.hidden, ...values, submitbutton: f.submit });
            ui.svc.flash = T('Заявка отправлена: {0}', typeName);
            show('services', true);
          } catch (err) {
            order.append(h('div', { class: 'send-err' }, T('Не отправлено: {0}', errText(err))));
            e.currentTarget.disabled = false;
          }
        } }, T('Заказать'))));
  };
  step1();
  const flash = ui.svc.flash;
  ui.svc.flash = null;
  return stagger(h('div', { class: 'svc' },
    flash ? h('div', { class: 'flash' }, icon('check'), flash) : null,
    h('div', { class: 'card pane' },
      h('div', { class: 'pane-head' }, icon('wallet'), h('h3', {}, T('Мои заявки'))),
      d.orders.length ? d.orders.map((o) => h('div', { class: 'order' },
        h('div', { class: 'main' }, h('div', {}, o.type), h('div', { class: 'sub' }, [o.term, o.info].filter(Boolean).join(' · '))),
        h('span', { class: 'pill' + (/забрать|готов/i.test(o.status) ? ' ok' : '') }, o.status)))
        : h('div', { class: 'empty' }, T('Заявок пока нет'))),
    order));
}

function questionTab(d) {
  const email = profileData?.fields.find(([k]) => /mail/i.test(k))?.[1] || '';
  const cat = select(d.categories, d.categories[0]?.[0], () => {});
  const subject = h('input', { type: 'text', placeholder: T('Коротко о чём вопрос') });
  const message = h('textarea', { rows: 6, placeholder: T('Опишите вопрос') });
  const reply = h('input', { type: 'text', value: email });
  const status = h('div', { class: 'send-err' });
  return stagger(h('div', { class: 'svc' }, h('div', { class: 'card pane form-card' },
    h('div', { class: 'pane-head' }, icon('chat'), h('h3', {}, T('Задать вопрос университету'))),
    h('label', { class: 'field' }, h('span', {}, T('Тема обращения')), cat),
    h('label', { class: 'field' }, h('span', {}, T('Заголовок')), subject),
    h('label', { class: 'field' }, h('span', {}, T('Вопрос')), message),
    h('label', { class: 'field' }, h('span', {}, T('Email для ответа')), reply),
    status,
    h('div', { class: 'form-actions' }, h('button', { class: 'btn', onclick: async (e) => {
      if (!subject.value.trim() || !message.value.trim()) { status.textContent = T('Заполните тему и вопрос'); return; }
      if (!await confirmBox(T('Отправить вопрос?'), T('Вопрос уйдёт в университет от вашего имени.'), T('Отправить'))) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      status.textContent = '';
      try {
        // The portal's own form sends this as a GET to /CDO/lib.php (API=sendQ); "live" = never cached.
        const answer = await portal.get(`/CDO/lib.php?${new URLSearchParams({
          API: 'sendQ', subject: subject.value.trim(), message: message.value.trim(), reply_type: reply.value.trim(), message_type: cat.value,
        })}`, 'live');
        if (!answer.trim()) throw new Error(T('портал не подтвердил отправку'));
        subject.value = '';
        message.value = '';
        status.replaceWith(h('div', { class: 'flash' }, icon('check'), T('Вопрос отправлен')));
      } catch (err) {
        status.textContent = T('Не отправлено: {0}', errText(err));
      } finally {
        btn.disabled = false;
      }
    } }, T('Отправить'))))));
}

// Personal files live in a Moodle draft area: list/delete via draftfiles_ajax.php, upload via
// repository_ajax.php, then saving the /user/files.php form commits the draft.
async function loadFiles() {
  const t = await pget('/user/files.php');
  const cfg = JSON.parse(t.match(/M\.form_filemanager\.init\(Y,\s*(\{.*?\})\);/s)?.[1] || 'null');
  const form = html(t).querySelector('[role=main] form');
  if (!cfg || !form) throw new Error(T('Не удалось открыть личные файлы'));
  const quota = textOf(t).match(/использовали\s+([\d.,]+\s*\S+?)\s+из своего лимита\s+([\d.,]+\s*\S+?)\./);
  return {
    itemid: cfg.itemid, client: cfg.client_id, maxbytes: cfg.maxbytes,
    save: { ...formFields(form), submitbutton: form.querySelector('[name=submitbutton]')?.value || 'Сохранить' }, // sent to the portal: stays Russian
    quota: quota && { used: quota[1], limit: quota[2] },
  };
}

async function listFiles(fs, filepath) {
  const r = JSON.parse(await portal.post('/repository/draftfiles_ajax.php?action=list', { client_id: fs.client, itemid: fs.itemid, filepath }));
  return r.list || [];
}

function filesTab() {
  const box = h('div', { class: 'svc' });
  const draw = async () => {
    try {
      ui.svc.fs ||= await loadFiles();
      const fs = ui.svc.fs;
      const list = await listFiles(fs, ui.svc.path);
      const crumbs = ui.svc.path.split('/').filter(Boolean);
      const go = (p) => { ui.svc.path = p; draw(); };
      const picker = h('input', { type: 'file', multiple: '', hidden: '', onchange: async () => {
        const files = [...picker.files];
        if (!files.length) return;
        const big = files.find((f) => f.size > fs.maxbytes);
        if (big) { alertLine(T('«{0}» больше {1}', big.name, fmtSize(fs.maxbytes))); return; }
        if (!await confirmBox(T('Загрузить в Личные файлы?'), files.map((f) => `${f.name} (${fmtSize(f.size)})`).join(', '), T('Загрузить'))) return;
        try {
          for (const f of files) await portal.upload({ itemid: fs.itemid, filepath: ui.svc.path, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
          await portal.post('/user/files.php', fs.save); // commit the draft area
          ui.svc.fs = null; // new draft itemid after saving
          draw();
        } catch (e) { alertLine(T('Не загружено: {0}', errText(e))); }
      } });
      const alertLine = (t) => box.querySelector('.send-err')?.replaceChildren(t);
      box.replaceChildren(
        fs.quota ? h('div', { class: 'card pane quota' },
          h('div', { class: 'pane-head' }, icon('courses'), h('h3', {}, T('Личные файлы')), h('span', { class: 'hours-total' }, T('{0} из {1}', fs.quota.used, fs.quota.limit))),
          h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (parseFloat(fs.quota.used.replace(',', '.')) / parseFloat(fs.quota.limit.replace(',', '.'))) * 100)}%` }))) : null,
        h('div', { class: 'files-bar' },
          h('div', { class: 'crumbs' },
            h('button', { onclick: () => go('/') }, T('Файлы')),
            crumbs.map((c, i) => [h('span', {}, '›'), h('button', { onclick: () => go(`/${crumbs.slice(0, i + 1).join('/')}/`) }, c)])),
          picker,
          h('button', { class: 'btn', onclick: () => picker.click() }, T('Загрузить файлы'))),
        h('div', { class: 'send-err' }),
        list.length ? stagger(h('div', { class: 'card files' }, list.map((f) => {
          const folder = f.type === 'folder';
          const name = folder ? f.fullname : f.filename;
          return h('div', { class: 'file-row', 'data-name': name.toLowerCase() },
            h('span', { class: 'file-ico' + (folder ? ' folder' : '') }, folder ? icon('folder') : (f.type || 'file').slice(0, 4).toUpperCase()),
            h('button', { class: 'act-link', onclick: () => (folder ? go(f.filepath)
              : /pdf/.test(f.mimetype || f.type) ? openFile({ name, url: f.url }, 'pdf') : portal.download(f.url, name)) }, name),
            h('span', { class: 'sub' }, folder ? T('папка') : [fmtSize(f.size), f.datemodified_f_s].filter(Boolean).join(' · ')),
            folder ? null : h('button', { class: 'more', title: T('Скачать'), onclick: () => portal.download(f.url, name) }, T('Скачать')),
            h('button', { class: 'more danger', title: T('Удалить'), onclick: async () => {
              if (!await confirmBox(T('Удалить «{0}»?', name), folder ? T('Папка будет удалена вместе со всем содержимым.') : T('Файл будет удалён из личных файлов на портале.'), T('Удалить'))) return;
              try {
                await portal.post('/repository/draftfiles_ajax.php?action=delete', { client_id: fs.client, itemid: fs.itemid, filepath: f.filepath, filename: folder ? '.' : f.filename });
                await portal.post('/user/files.php', fs.save);
                ui.svc.fs = null;
                draw();
              } catch (e) { alertLine(T('Не удалено: {0}', errText(e))); }
            } }, T('Удалить')));
        }))) : stateBox({ kind: 'empty', title: T('Здесь пусто'), text: T('Загрузите файлы кнопкой выше.') }));
    } catch (e) {
      box.replaceChildren(errorBox(e, () => { ui.svc.fs = null; draw(); }));
    }
  };
  box.append(skeleton('rows'));
  draw();
  return box;
}

// Library SSO links on /my/ are signed per page load (time + hash), so a copy from the disk cache
// may be expired. Keep a fresh set for a few minutes; the Сервисы network load also refreshes it.
// ponytail: 3 min is a guess at the signature lifetime; shorten if a library rejects the link.
const LINKS_TTL = 3 * 60_000;
const TIMED = /[?&](time|gmt|ts|timestamp)=/i; // Юрайт, Znanium, IPR SMART sign with a timestamp
// Hovering the Сервисы tab starts the refresh before the click.
document.querySelector('#nav [data-view="services"]').addEventListener('mouseenter', () => signedLinks());
let signed = { at: 0, list: null, pending: null };
function refreshLinks() {
  signed.pending ||= portal.get('/my/', 'live')
    .then((t) => { signed = { at: Date.now(), list: parseServiceLinks(html(t)), pending: null }; return signed.list; })
    .catch(() => { signed.pending = null; return signed.list || []; });
  return signed.pending;
}
// Fresh-enough set right away (renewed in the background past half-life); waits only once expired.
async function signedLinks() {
  const age = Date.now() - signed.at;
  if (signed.list && age < LINKS_TTL) {
    if (age > LINKS_TTL / 2) refreshLinks();
    return signed.list;
  }
  return refreshLinks();
}

function linksTab(d) {
  const libs = d.links.filter((l) => /ЭБС|библиотек|eLIBRARY|ELS/i.test(l.title));
  const other = d.links.filter((l) => !libs.includes(l));
  signedLinks(); // renew signatures now if needed, so a click opens at once
  const openLink = async (l, el) => {
    if (!TIMED.test(l.url)) return portal.open(l.url); // signature has no timestamp: any copy works
    el.classList.add('busy'); // visible only when the set had expired and we wait for a fresh one
    const fresh = (await signedLinks()).find((x) => x.title === l.title);
    el.classList.remove('busy');
    portal.open(fresh?.url || l.url);
  };
  const tile = (title, run, sub) => {
    const el = h('button', { class: 'card mat lift', 'data-name': title.toLowerCase(), onclick: () => run(el) },
      icon('external'), h('div', { class: 'main' }, h('div', { class: 't' }, title), sub ? h('div', { class: 'sub' }, sub) : null));
    return el;
  };
  return stagger(h('div', { class: 'mat-groups' },
    libs.length ? h('section', { class: 'mat-group' }, h('h4', {}, T('Электронные библиотеки'), h('span', { class: 'n' }, String(libs.length))),
      h('div', { class: 'mat-grid', onmouseenter: () => signedLinks() },
        libs.map((l) => tile(l.title.replace(/\s*\/.*$/, ''), (el) => openLink(l, el), new URL(l.url).hostname)))) : null,
    h('section', { class: 'mat-group' }, h('h4', {}, T('Сервисы портала')),
      h('div', { class: 'mat-grid' },
        other.map((l) => tile(l.title, () => portal.open(l.url))),
        EXTRA_SERVICES.map(([t, u]) => tile(t, () => portal.open(u.startsWith('http') ? u : BASE + u)))))));
}

// ---- about, legal docs, first-run notice ----

const REPO = 'https://github.com/RGB-Outl4w/UlSU-Portal-Desktop';
const docName = (base) => (LANG === 'ru' && /^(PRIVACY|LICENSE)/.test(base) ? base.replace(/(\.md)?$/, '.ru.md') : base);

// Minimal Markdown for the bundled docs (headings, lists, tables, code blocks, **bold**, `code`,
// links). Built with h(), so text never becomes HTML.
function markdown(src) {
  const inline = (s) => {
    const out = [];
    const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      out.push(s.slice(last, m.index));
      if (m[1]) out.push(h('b', {}, m[1]));
      else if (m[2]) out.push(h('code', {}, m[2]));
      else {
        const url = m[4];
        out.push(h('a', { href: '#', onclick: (e) => {
          e.preventDefault();
          if (/^https?:/.test(url)) portal.open(url);
          else if (/^[A-Z_.a-z]+$/.test(url)) openDoc(url); // another bundled doc, e.g. NOTICE.md
          else if (url.startsWith('#')) $(`#reader-body [data-anchor="${url.slice(1)}"]`)?.scrollIntoView({ behavior: 'smooth' });
        } }, m[3]));
      }
      last = re.lastIndex;
    }
    out.push(s.slice(last));
    return out;
  };
  const box = h('div', { class: 'rich doc' });
  const lines = src.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (l.startsWith('```')) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      box.append(h('pre', {}, code.join('\n')));
    } else if (/^#{1,6} /.test(l)) {
      const [, hashes, text] = l.match(/^(#+) (.*)$/);
      box.append(h(`h${Math.min(hashes.length + 1, 6)}`, { 'data-anchor': text.toLowerCase().replace(/\s+/g, '-') }, inline(text)));
    } else if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      i--;
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
      box.append(h('table', {}, rows.filter((r) => !/^\|[\s|:-]+\|$/.test(r)).map((r, n) =>
        h('tr', {}, cells(r).map((c) => h(n ? 'td' : 'th', {}, inline(c)))))));
    } else if (/^\s*- /.test(l)) {
      const items = [];
      for (; i < lines.length && /^\s*- /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*- /, ''));
      i--;
      box.append(h('ul', {}, items.map((t) => h('li', {}, inline(t)))));
    } else if (l.startsWith('> ')) {
      box.append(h('blockquote', {}, inline(l.slice(2))));
    } else {
      const para = [l];
      for (; i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||- |```|> )/.test(lines[i + 1]); i++) para.push(lines[i + 1]);
      box.append(h('p', {}, inline(para.join(' '))));
    }
  }
  return box;
}

async function openDoc(base) {
  const name = docName(base);
  showReader({ name, url: `${REPO}/blob/main/${name}` }, msg(T('Загрузка…')));
  const text = await portal.doc(name);
  $('#reader-body').replaceChildren(text ? markdown(text) : errorBox(new Error(name)));
}

Object.assign(views, {
  about: {
    title: T('О приложении'),
    hidden: true,
    sk: 'rows',
    load: () => portal.about(),
    render(a) {
      const row = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
      const docBtn = (label, base) => h('button', { class: 'chip-btn', onclick: () => openDoc(base) }, label);
      return stagger(h('div', { class: 'about' },
        h('div', { class: 'card about-hero' },
          h('img', { src: 'logo.svg', alt: '' }),
          h('div', {},
            h('h2', {}, T('УлГУ · Портал студента')),
            h('p', {}, T('Неофициальное настольное приложение для portal.ulsu.ru')),
            h('span', { class: 'pill' }, T('Версия {0}', a.version)))),

        updateCard(),

        h('div', { class: 'card pane' },
          paneHead('profile', T('Автор')),
          h('p', { class: 'about-author' }, h('b', {}, T('Сургутский Максим Эдуардович')), h('br'), T('студент группы ИС-О-25/1')),
          h('p', { class: 'sub' }, T('Разработано при участии Claude Code — ИИ-ассистента для программирования от Anthropic.'))),

        h('div', { class: 'card pane' },
          paneHead('settings', T('Работает на')),
          h('dl', { class: 'about-dl' },
            (a.runtime || [['Electron', a.electron], ['Chromium', a.chrome], ['Node.js', a.node], ['V8', a.v8], ['Windows', a.os]]).map(([k, v]) => row(k, v)))),

        h('div', { class: 'card pane' },
          paneHead('plan', T('Правовая информация')),
          h('p', { class: 'sub' }, T('Неофициальный проект. Не связан с УлГУ и не одобрен университетом. Данные хранятся только на вашем компьютере.')),
          h('div', { class: 'about-btns' },
            docBtn(T('Политика конфиденциальности'), 'PRIVACY.md'),
            docBtn(T('Лицензия MIT'), 'LICENSE'),
            docBtn(T('Отказ от ответственности'), 'NOTICE.md'),
            docBtn(T('Сторонние компоненты'), 'THIRD_PARTY_NOTICES.md'))),

        h('div', { class: 'card pane' },
          paneHead('services', T('Данные и проект')),
          a.dataDir ? h('p', { class: 'sub' }, T('Папка данных: {0}', a.dataDir)) : null, // Android: app-private, nothing to open
          h('div', { class: 'about-btns' },
            a.dataDir ? h('button', { class: 'chip-btn', onclick: async (e) => {
              // openPath resolves to an error string on failure, e.g. when Windows virtualizes %APPDATA%
              // for an app started from inside another packaged (MSIX) app.
              const err = await portal.openData();
              if (err) e.target.closest('.pane').append(h('div', { class: 'send-err' }, T('Не удалось открыть папку: {0}', err)));
            } }, T('Открыть папку данных')) : null,
            h('button', { class: 'chip-btn', onclick: async (e) => {
              if (!await confirmBox(T('Очистить кэш?'), T('Сохранённые копии разделов будут удалены. Вы останетесь в системе.'), T('Очистить'))) return;
              await portal.clearCache();
              e.target.textContent = T('Кэш очищен');
            } }, T('Очистить кэш')),
            h('button', { class: 'chip-btn', onclick: () => portal.open(REPO) }, 'GitHub'),
            h('button', { class: 'chip-btn', onclick: () => portal.open(`${REPO}/issues`) }, T('Сообщить о проблеме'))))));
    },
  },
});

// Asks GitHub for the latest release only when the button is pressed (see PRIVACY.md).
function updateCard() {
  const status = h('p', { class: 'sub' }, T('Обновления проверяются только по кнопке.'));
  const actions = h('div', { class: 'about-btns' });
  const check = h('button', { class: 'chip-btn', onclick: async () => {
    check.disabled = true;
    status.textContent = T('Проверка…');
    try {
      const u = await portal.checkUpdate();
      if (!u.latest) status.textContent = T('Опубликованных версий пока нет.');
      else if (!u.update) status.textContent = T('Установлена последняя версия ({0}).', u.current);
      else {
        status.replaceChildren(h('b', {}, T('Доступна версия {0}', u.latest)), ` · ${T('у вас {0}', u.current)}`);
        actions.replaceChildren(h('button', { class: 'btn', onclick: () => portal.open(u.url) }, T('Скачать')), check);
      }
    } catch (e) {
      status.textContent = errText(e);
    } finally {
      check.disabled = false;
    }
  } }, T('Проверить обновления'));
  actions.append(check);
  return h('div', { class: 'card pane' }, paneHead('refresh', T('Обновления')), status, actions);
}

// Shown once: what the app is and isn't, before anything else.
function firstRunNotice() {
  if (pref('notice-v1')) return;
  const dlg = $('#welcome');
  dlg.querySelectorAll('[data-doc]').forEach((b) => {
    b.onclick = () => { dlg.close(); openDoc(b.dataset.doc); };
  });
  dlg.addEventListener('close', () => pref('notice-v1', '1'), { once: true });
  dlg.showModal();
}

// ---- academic records helpers ----

const MARKS = { отлично: 5, хорошо: 4, удовлетворительно: 3, неудовлетворительно: 2 };
const markScore = (m) => MARKS[m.toLowerCase()] || 0;
function markClass(m) {
  const s = markScore(m);
  if (s) return `m${s}`;
  if (/^не\s?зачтено/i.test(m)) return 'fail';
  return /зачтено/i.test(m) ? 'pass' : '';
}

const kpi = (value, label, sub) => h('div', { class: 'card kpi' }, h('b', {}, value), h('span', {}, label), sub ? h('small', {}, sub) : null);

const HOURS = [['lect', T('Лекции')], ['pract', T('Практика')], ['lab', T('Лабораторные')], ['self', T('СРС')]];
// Stacked bar of hour types; segment width = share of hours, native title = hover tooltip.
const hoursBar = (r) => h('div', { class: 'hbar' }, HOURS.filter(([k]) => r[k]).map(([k, l]) =>
  h('i', { class: k, style: `flex:${r[k]}`, title: T('{0}: {1} ч', l, r[k]) })));
const hoursLegend = (r) => h('div', { class: 'hours-text' }, HOURS.filter(([k]) => r[k]).map(([k, l]) =>
  h('span', {}, h('i', { class: 'sw ' + k }), `${l} ${r[k]}`)));

// Semester shown first: Sep–Jan is the odd (autumn) semester of the current year of study.
function planSem(sems) {
  if (ui.plan.sem != null && sems[ui.plan.sem]) return ui.plan.sem;
  const year = Number(profileData?.year) || 1;
  const month = new Date().getMonth();
  const num = year * 2 - (month >= 8 || month === 0 ? 1 : 0);
  const idx = String(Math.min(Math.max(num, 1), sems.length) - 1);
  if (profileData) ui.plan.sem = idx; // remember only a guess based on the real profile
  return idx;
}

function planRow(r) {
  const all = [...r.materials, ...r.files];
  return h('div', { class: 'card plan-row', 'data-name': r.name.toLowerCase(), hidden: !matches(r.name, ui.plan.q) },
    h('div', { class: 'plan-top' },
      h('span', { class: 'code' }, r.code),
      r.syllabus
        ? h('button', { class: 'plan-name link', title: T('Открыть рабочую программу'), onclick: () => portal.open(r.syllabus) }, r.name)
        : h('div', { class: 'plan-name' }, r.name),
      r.control.split(/\s(?=Экзамен|Зачет|Курсовая|Дифференцированный)/).map((c) => h('span', { class: 'pill' }, T(c))),
      h('span', { class: 'hours-total' }, T('{0} ч', r.total))),
    hoursBar(r),
    hoursLegend(r),
    all.length ? h('details', { class: 'mats' },
      h('summary', {}, T('Материалы ({0})', all.length)),
      h('ul', {}, all.map((m) => h('li', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); portal.open(m.url); } }, m.title))))) : null);
}

// ---- view switching ----

const cache = {};
let current = 'today';
const msg = (text, cls = '') => h('div', { class: 'msg ' + cls }, text);

// One place turns IPC errors into text people can read.
// Portal unreachable: no network, or the portal is under maintenance (both fall back to saved copies).
const isOffline = (e) => /OFFLINE|MAINTENANCE/.test(e?.message || String(e));
const isMaintenance = (e) => /MAINTENANCE/.test(e?.message || String(e));
function errText(e) {
  if (isMaintenance(e)) return T('Портал на техническом обслуживании');
  if (isOffline(e)) return T('Нет подключения к порталу');
  return String(e?.message || e).replace(/^Error invoking remote method '\w+': (Error: )?/, '') || T('Что-то пошло не так');
}

// Centered state for empty/offline/error screens: icon, title, hint, optional action.
function stateBox({ kind = 'error', title, text, action }) {
  return h('div', { class: `state ${kind}` },
    h('div', { class: 'state-icon' }, icon({ offline: 'wifi-off', empty: 'courses' }[kind] || 'alert')),
    h('h3', {}, title),
    text ? h('p', {}, text) : null,
    action ? h('button', { class: 'btn', onclick: action.run }, action.label) : null);
}

function errorBox(e, retry) {
  const action = retry && { label: T('Повторить'), run: retry };
  if (isMaintenance(e)) {
    return stateBox({ kind: 'offline', title: T('Портал на техническом обслуживании'), action,
      text: T('Этот раздел ещё не открывался, поэтому сохранённой копии нет. Попробуйте позже.') });
  }
  return isOffline(e)
    ? stateBox({ kind: 'offline', title: T('Нет подключения к порталу'), action,
      text: T('Этот раздел ещё не открывался, поэтому сохранённой копии нет. Он загрузится, когда связь вернётся.') })
    : stateBox({ title: T('Не удалось загрузить'), text: errText(e), action });
}

function tools(...els) {
  $('#tools').replaceChildren(...clean(els));
  requestAnimationFrame(() => $('#tools').querySelectorAll('.seg').forEach(slide));
}

function skeleton(kind) {
  return kind === 'rows'
    ? h('div', { class: 'list' }, Array.from({ length: 7 }, () => h('div', { class: 'sk row' })))
    : h('div', { class: 'days' }, Array.from({ length: 6 }, () => h('div', { class: 'sk', style: 'min-height:220px' })));
}

// Content swap with a short cross-fade (View Transitions API); entries then stagger in.
// quiet = filter/sort change inside the same view: no cross-fade, no stagger, only a soft fade
// (rapid toggling would otherwise flash the whole screen).
// quiet = 'silent': background refresh with changed data, swapped in with no animation at all.
function swap(nodes, quiet = false) {
  const run = () => {
    $('#content').classList.toggle('quiet', !!quiet);
    $('#content').classList.toggle('silent', quiet === 'silent');
    $('#content').replaceChildren(...clean([nodes]));
    if (!quiet) $('#content').scrollTop = 0;
  };
  if (!quiet && document.startViewTransition) document.startViewTransition(run);
  else run();
}

function paint(name, quiet = false) {
  const v = views[name];
  const typing = $('#tools').contains(document.activeElement) && document.activeElement.matches('input, textarea');
  if (!(quiet === 'silent' && typing)) tools(v.tools?.(cache[name])); // don't steal focus from the search box
  swap(v.render(cache[name]), quiet);
}

const loadedAt = {}; // view -> time its data was fetched (or saved to disk, for a cached copy)

// "Нет подключения · данные от …" bar; hidden again by the next successful load.
function offline(at, e) {
  const when = at ? new Date(at).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const what = isMaintenance(e) ? T('Портал на техническом обслуживании') : T('Нет подключения к порталу');
  banner(when ? T('{0} · данные от {1}', what, when) : what, T('Повторить'));
}

// One bar above the content for portal state: offline, maintenance, or session ended. Its button
// reloads the current section; when the session has ended that opens the portal's sign-in window.
function banner(text, button) {
  $('#net-text').textContent = text;
  $('#net-retry').textContent = button;
  $('#net-banner').hidden = false;
}

portal.onSession((state) => {
  if (state === 'expired') banner(T('Сессия на портале завершилась. Войдите снова, чтобы обновлять данные.'), T('Войти'));
  else if (state === 'maintenance') banner(T('Портал на техническом обслуживании. Показаны сохранённые данные.'), T('Повторить'));
  else $('#net-banner').hidden = true;
});

// Disk copy first (instant, also offline), then the network; the fresh result repaints quietly.
async function show(name, reload = false) {
  current = name;
  const tab = views[name].parent || name; // sub-screens (a course) keep their sidebar tab highlighted
  document.querySelectorAll('#nav [data-view], #tabbar [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === tab));
  document.body.classList.remove('sheet');
  slide($('#nav'));
  const { title } = views[name];
  $('#title').textContent = typeof title === 'function' ? title() : title;
  if (cache[name] && !reload) return paint(name);
  if (!cache[name]) {
    const disk = await fromDisk(views[name].load);
    if (current !== name) return;
    if (disk && !cache[name]) {
      cache[name] = disk.data;
      loadedAt[name] = disk.at;
      paint(name);
    } else if (!cache[name]) {
      tools();
      swap(skeleton(views[name].sk));
    }
  }
  const before = cache[name] && JSON.stringify(cache[name]);
  $('#refresh').classList.add('spin');
  staleAt = null;
  try {
    const fresh = await views[name].load();
    loadedAt[name] = staleAt || Date.now(); // staleAt: some reads came from disk (offline)
    if (!staleAt) $('#net-banner').hidden = true;
    if (before && JSON.stringify(fresh) === before) return; // unchanged: keep the screen as is, no repaint
    cache[name] = fresh;
    if (current === name) paint(name, before ? 'silent' : false);
  } catch (e) {
    if (current !== name) return;
    if (isOffline(e) && before) return offline(loadedAt[name], e); // keep showing what we have
    tools();
    swap(errorBox(e, () => show(name, true)));
  } finally {
    $('#refresh').classList.remove('spin');
  }
}

$('#net-retry').addEventListener('click', () => show(current, true));
// Back online: refresh what's on screen.
window.addEventListener('online', () => { if (!$('#net-banner').hidden) show(current, true); });

// ---- command palette (Ctrl+K) ----

const PAGES = [
  [T('Задолженности'), '/blocks/buttons/debts.php'],
  [T('Профиль'), '/user/profile.php'],
  [T('Личный кабинет (сайт)'), '/my/'],
];

let items = [];
let sel = 0;

const navIcon = (view) => document.querySelector(`#nav [data-view="${view}"] use`)?.getAttribute('href').replace('#i-', '') || view;

function paletteItems() {
  return [
    // icon = the one on the sidebar button (view key and icon name differ, e.g. messages → i-chat)
    ...Object.entries(views).filter(([, v]) => !v.hidden).map(([k, v]) => ({ label: v.title, icon: navIcon(k), kind: T('Раздел'), run: () => show(k) })),
    ...(cache.courses?.courses || []).map((c) => ({ label: c.fullname, icon: 'courses', kind: T('Курс'), run: () => openCourse(c) })),
    ...PAGES.map(([label, url]) => ({ label, icon: 'external', kind: T('Портал'), run: () => portal.open(BASE + url) })),
  ];
}

function renderPalette() {
  const words = $('#pq').value.toLowerCase().split(/\s+/).filter(Boolean);
  items = paletteItems().filter((it) => words.every((w) => it.label.toLowerCase().includes(w))).slice(0, 60);
  sel = Math.min(sel, Math.max(items.length - 1, 0));
  $('#pl').replaceChildren(...(items.length
    ? items.map((it, i) => h('li', { class: i === sel ? 'sel' : null, onclick: () => runItem(i), onmousemove: () => { if (sel !== i) { sel = i; mark(); } } },
      icon(it.icon), it.label, h('span', { class: 'kind' }, it.kind)))
    : [h('li', { class: 'empty' }, T('Ничего не найдено'))]));
}

function mark() {
  [...$('#pl').children].forEach((li, i) => li.classList.toggle('sel', i === sel));
  $('#pl').children[sel]?.scrollIntoView({ block: 'nearest' });
}

function openPalette() {
  $('#pq').value = '';
  sel = 0;
  renderPalette();
  $('#palette').showModal();
  if (!cache.courses) {
    views.courses.load().then((d) => { cache.courses = d; if ($('#palette').open) renderPalette(); }).catch(() => {});
  }
}

function runItem(i) {
  const it = items[i];
  if (!it) return;
  $('#palette').close();
  it.run();
}

$('#pq').addEventListener('input', () => { sel = 0; renderPalette(); });
$('#pq').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); mark(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); mark(); e.preventDefault(); }
  else if (e.key === 'Enter') runItem(sel);
});
$('#palette').addEventListener('click', (e) => { if (e.target === $('#palette')) $('#palette').close(); }); // backdrop click
$('#palette-btn').addEventListener('click', openPalette);

// ---- profile card (sidebar + popover), filled whenever /my/ is loaded ----

let profileData;
function renderProfile(p) {
  if (!p.name) return;
  profileData = p;
  const [last = '', first = ''] = p.name.split(/\s+/);
  const sub = [p.group, p.year && T('{0} курс', p.year)].filter(Boolean).join(' · ');
  for (const el of document.querySelectorAll('#me .avatar, #profile .avatar')) el.textContent = (first[0] || '') + (last[0] || '');
  $('#me-name').textContent = `${first} ${last}`;
  $('#me-sub').textContent = sub;
  $('#pp-name').textContent = p.name;
  $('#pp-sub').textContent = sub;
  $('#pp-fields').replaceChildren(...p.fields.flatMap(([k, v]) => [h('dt', {}, T(k)), h('dd', {}, T(v))]));
  $('#me').hidden = false;
}
$('#pp-open').addEventListener('click', () => { $('#profile').hidePopover(); portal.open(`${BASE}/user/profile.php`); });

// ---- settings: theme, accent, sidebar ----

// Static shell text in index.html is Russian; translate it once at startup ("Поиск (Ctrl+K)" keeps its suffix).
function translateStatic() {
  if (LANG === 'ru') return;
  const tr = (s) => { const m = s.trim().match(/^(.*?)(\s*\([^)]*\))?$/s); return T(m[1]) + (m[2] || ''); };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/[А-Яа-яЁё]/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), tr(n.nodeValue));
  }
  for (const el of document.querySelectorAll('[title], [placeholder]')) {
    for (const a of ['title', 'placeholder']) if (el.hasAttribute(a)) el.setAttribute(a, tr(el.getAttribute(a)));
  }
  document.title = T(document.title);
}

// Language change reloads the window: every T() runs again with the new language.
function setupLang() {
  document.querySelectorAll('#lang-seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === LANG);
    b.addEventListener('click', () => {
      if (b.dataset.lang === LANG) return;
      pref('lang', b.dataset.lang);
      keepPlace();
      portal.setLang(b.dataset.lang).then(() => location.reload());
    });
  });
  portal.setLang(LANG); // main process (tray, notifications, login window) follows the same language
}

function setTheme(mode) {
  pref('theme', mode);
  portal.theme(mode);
  document.querySelectorAll('#theme-seg button').forEach((b) => b.classList.toggle('active', b.dataset.theme === mode));
  slide($('#theme-seg'));
}

// A settings change that reloads the UI (language; theme on Android) comes back to the same tab with
// settings open. Timestamped, so a change that didn't reload (same theme after all) can't resurface later.
const keepPlace = () => pref('resume', `${views[current].parent || current} ${Date.now()}`);
function resumePlace() {
  const [view, at] = (pref('resume') || '').split(' ');
  if (!views[view] || Date.now() - at > 10000) return;
  pref('resume', '');
  current = view;
  requestAnimationFrame(() => $('#settings').showPopover());
}

function setAccent(color) {
  pref('accent', color);
  document.documentElement.style.setProperty('--accent-base', color);
  document.querySelectorAll('#accents button').forEach((b) => b.classList.toggle('active', b.dataset.c === color));
}

function toggleCollapse() {
  pref('collapsed', document.body.classList.toggle('collapsed') ? '1' : '');
}

$('#accents').append(...ACCENTS.map((c) => h('button', { 'data-c': c, style: `--c:${c}`, title: c, onclick: () => setAccent(c) })));
// Android recreates the app on a light/dark change, which reloads the page.
document.querySelectorAll('#theme-seg button').forEach((b) => b.addEventListener('click', () => {
  if (portal.platform === 'android') keepPlace();
  setTheme(b.dataset.theme);
}));
$('#settings').addEventListener('toggle', (e) => { if (e.newState === 'open') { slide($('#theme-seg')); slide($('#lang-seg')); } });
$('#collapse').addEventListener('click', toggleCollapse);
$('#logout').addEventListener('click', async () => {
  $('#settings').hidePopover();
  await portal.logout();
  for (const k in cache) delete cache[k];
  show(current, true);
});

// ---- shortcuts (by physical key, so they work in the Russian layout too); ⌘ on macOS, Ctrl elsewhere ----

const IS_MAC = portal.platform === 'darwin';
if (IS_MAC) document.body.classList.add('mac');

// Static labels say "Ctrl K" / "(Ctrl+1)"; on macOS show ⌘ instead.
function macLabels() {
  if (!IS_MAC) return;
  for (const el of document.querySelectorAll('kbd')) el.textContent = el.textContent.replace(/^Ctrl\s*/, '⌘');
  for (const el of document.querySelectorAll('[title]')) el.title = el.title.replace(/Ctrl\+/g, '⌘');
}

document.addEventListener('keydown', (e) => {
  if (!(IS_MAC ? e.metaKey : e.ctrlKey)) return;
  const tab = e.code.startsWith('Digit') && document.querySelectorAll('#nav [data-view]')[Number(e.code.slice(5)) - 1]?.dataset.view; // Ctrl+N = Nth sidebar tab
  const act = {
    KeyK: openPalette,
    KeyR: () => show(current, true),
    KeyB: toggleCollapse,
  }[e.code] || (tab && (() => show(tab)));
  if (act) { e.preventDefault(); act(); }
});

document.querySelectorAll('#nav [data-view], #tabbar [data-view]').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// Phones: Ещё opens the sidebar as a sheet; any button in it or a tap outside closes it.
$('#more').addEventListener('click', () => { document.body.classList.toggle('sheet'); slide($('#nav')); });
$('#side-backdrop').addEventListener('click', () => document.body.classList.remove('sheet'));
$('#side').addEventListener('click', (e) => { if (e.target.closest('button')) document.body.classList.remove('sheet'); });
// Phones show list or detail (app.css): tapping a notification/conversation switches to the detail.
$('#content').addEventListener('click', (e) => e.target.closest('.split .inbox-item')?.closest('.split').classList.add('detail'));

// Android back: close the top layer (dialog, popover, sheet), then go up a level, then leave the app.
portal.onBack?.(() => {
  const dlg = [...document.querySelectorAll('dialog[open]')].pop();
  if (dlg) return dlg.close();
  const pop = document.querySelector(':popover-open');
  if (pop) return pop.hidePopover();
  if (document.body.classList.contains('sheet')) return document.body.classList.remove('sheet');
  const detail = $('#content .split.detail');
  if (detail) return detail.classList.remove('detail');
  if (views[current].parent) return show(views[current].parent);
  if (current !== 'today') return show('today');
  portal.minimize();
});
$('#refresh').addEventListener('click', () => show(current, true));

if (pref('collapsed')) document.body.classList.add('collapsed');
setAccent(ACCENTS.includes(pref('accent')) ? pref('accent') : ACCENTS[0]);
translateStatic();
macLabels();
setupLang();
setTheme(pref('theme') || 'system');
resumePlace();
show(current);
// Warm the portal's slow first calendar request (and the saved copy) in the background.
setTimeout(() => { if (!cache.calendar) loadMonth(new Date().getFullYear(), new Date().getMonth()).catch(() => {}); }, 15000);
firstRunNotice();
$('#about-btn').addEventListener('click', () => show('about'));

// Keep the Today "now / next pair" banner live without re-rendering the whole screen.
setInterval(() => {
  const old = $('#content .hero');
  if (current !== 'today' || !old || !cache.today || document.hidden) return;
  const fresh = hero(allPairs(cache.today.weeks));
  fresh.classList.add('tick');
  fresh.style.animation = 'none';
  old.replaceWith(fresh);
}, 30_000);
