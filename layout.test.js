// node layout.test.js — random drags/resizes on the Сегодня grid never break its rules.
const assert = require('assert');
const Grid = require('./layout.js');

const COLS = 4;
const ROWS = 40;
const valid = (l) => {
  for (const a of l) {
    assert(a.w >= Grid.MIN_W && a.h >= Grid.MIN_H, `too small: ${JSON.stringify(a)}`);
    assert(a.x >= 0 && a.y >= 0 && a.x + a.w <= COLS && a.y + a.h <= ROWS, `outside: ${JSON.stringify(a)}`);
    for (const b of l) assert(a === b || !Grid.hit(a, b), `overlap: ${JSON.stringify([a, b])}`);
  }
};

let layout = [
  { id: 'a', x: 0, y: 0, w: 4, h: 4 }, { id: 'b', x: 0, y: 4, w: 2, h: 10 },
  { id: 'c', x: 2, y: 4, w: 2, h: 5 }, { id: 'd', x: 2, y: 9, w: 2, h: 6 },
];
valid(layout);
const r = (n) => Math.floor(Math.random() * n);
for (let i = 0; i < 5000; i++) {
  const it = layout[r(layout.length)];
  const moved = r(2) ? { ...it, x: it.x + r(9) - 4, y: it.y + r(21) - 10 } : { ...it, w: it.w + r(9) - 4, h: it.h + r(9) - 6 };
  const next = Grid.place(layout, moved, COLS, ROWS);
  if (next) { valid(next); layout = next; }
}

// a move that would push something off the canvas is refused
assert.strictEqual(Grid.place([{ id: 'a', x: 0, y: 0, w: 4, h: 30 }, { id: 'b', x: 0, y: 30, w: 4, h: 10 }], { id: 'a', x: 0, y: 1, w: 4, h: 30 }, COLS, ROWS), null);
// garbage from storage is cleaned or rejected
valid(Grid.clean([{ id: 'a', x: -5, y: 3, w: 0, h: 1 }, { id: 'a' }, { id: 'zz', x: 0, y: 0, w: 1, h: 2 }, { id: 'b', x: 9, y: 2, w: 9, h: 2 }], ['a', 'b'], COLS, ROWS));
assert.strictEqual(Grid.clean('nope', ['a'], COLS, ROWS), null);
// add finds a free spot, or says there is none
valid(Grid.add([{ id: 'a', x: 0, y: 0, w: 2, h: 2 }], 'b', 2, 2, COLS, ROWS));
assert.strictEqual(Grid.add([{ id: 'a', x: 0, y: 0, w: 4, h: 40 }], 'b', 1, 2, COLS, ROWS), null);
console.log('layout ok');
