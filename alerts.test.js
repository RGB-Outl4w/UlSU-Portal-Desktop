const assert = require('node:assert/strict');
const { test } = require('node:test');
const { courseGrades, changedGrades, deadlineReminders, DAY } = require('./alerts');

const overview = (rows) => '<table id="overview-grade"><tbody>' + rows + '</tbody></table>';
const row = (id, grade) => '<tr><td><a href="https://portal.ulsu.ru/course/user.php?mode=grade&amp;id=' + id +
  '">Дисциплина</a></td><td><span>' + grade + '</span></td><td>—</td></tr>';

test('grade overview uses stable course IDs and preserves known ungraded courses', () => {
  assert.deepEqual(courseGrades(overview(row(19, '&nbsp;10,50&nbsp;') + row(7, '&mdash;') + row(36, 'Зачтено') +
    row(37, '10,50 (52,50 %)'))), { 19: '10.5', 7: '', 36: 'Зачтено', 37: '10.5 (52.5%)' });
  assert.deepEqual(courseGrades(overview('<tr class="emptyrow"><td>No grades</td></tr>')), {});
  assert.equal(courseGrades('<form id="login"></form>'), null);
  assert.equal(courseGrades(overview(row(19, '<svg onload="x()">not a grade</svg>'))), null);
});

test('first check and newly visible courses stay quiet, changes to known grades notify', () => {
  assert.deepEqual(changedGrades({}, { 19: '10.5' }), []);
  assert.deepEqual(changedGrades({ 19: '10.5', 7: '' }, { 19: '10.5', 7: '4', 21: '10' }), ['7']);
  assert.deepEqual(changedGrades({ 19: '10.5' }, { 19: '' }), ['19']);
  assert.deepEqual(changedGrades({ 19: '10.5' }, {}), []);
});

test('only upcoming actionable deadlines inside the window remind, once per due date', () => {
  const now = 10000000;
  const events = [
    { id: 7, timesort: now + 1 }, { id: '7', timesort: now + 1 },
    { id: 8, timesort: now }, { id: 9, timesort: now + DAY + 1 },
    { id: 10, timesort: now + DAY, action: { actionable: false } },
    { id: 11, timesort: now + DAY },
  ];
  const first = deadlineReminders(events, { '1:1': 1 }, now);
  assert.equal(first.count, 2);
  assert.deepEqual(first.sent, { ['7:' + (now + 1)]: now + 1, ['11:' + (now + DAY)]: now + DAY });
  assert.equal(deadlineReminders(events, first.sent, now).count, 0);
  assert.equal(deadlineReminders([{ id: 7, timesort: now + 2 }], first.sent, now).count, 1);
});
