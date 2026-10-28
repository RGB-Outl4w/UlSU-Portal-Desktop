// Grid for the customizable Сегодня tab. Items are { id, x, y, w, h } in whole cells on a canvas of
// cols x rows. Every result stays inside the canvas, at least MIN_W x MIN_H, and never overlaps:
// whatever an item lands on is pushed down. Pure functions, so layout.test.js can check them in Node.
const Grid = (() => {
  const MIN_W = 1;
  const MIN_H = 2;
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // Minimum size, then inside the canvas.
  function fit(it, cols, rows) {
    const w = Math.min(Math.max(Math.round(it.w) || MIN_W, MIN_W), cols);
    const h = Math.min(Math.max(Math.round(it.h) || MIN_H, MIN_H), rows);
    return { ...it, w, h, x: Math.min(Math.max(Math.round(it.x) || 0, 0), cols - w), y: Math.min(Math.max(Math.round(it.y) || 0, 0), rows - h) };
  }

  // Adds `it` to the placed items `out`, pushed down below anything it overlaps; false past the bottom.
  function drop(out, it, rows) {
    for (let c = out.find((f) => hit(f, it)); c; c = out.find((f) => hit(f, it))) it.y = c.y + c.h;
    if (it.y + it.h > rows) return false;
    out.push(it);
    return true;
  }

  // `moved` goes exactly where asked (after fit); the others keep their places or get pushed down.
  // null when that would push something off the canvas: the caller keeps the previous layout.
  function place(layout, moved, cols, rows) {
    const m = fit(moved, cols, rows);
    const out = [m];
    const rest = layout.filter((it) => it.id !== m.id).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const it of rest) if (!drop(out, fit(it, cols, rows), rows)) return null;
    return layout.map((it) => out.find((o) => o.id === it.id));
  }

  // First free spot (top to bottom, left to right) for a new item of size w x h; null when full.
  function add(layout, id, w, h, cols, rows) {
    const it = fit({ id, x: 0, y: 0, w, h }, cols, rows);
    for (let y = 0; y + it.h <= rows; y++) {
      for (let x = 0; x + it.w <= cols; x++) {
        const at = { ...it, x, y };
        if (!layout.some((o) => hit(o, at))) return [...layout, at];
      }
    }
    return null;
  }

  // A saved layout made valid again: known ids once each, fitted, overlaps pushed apart. null if it can't be.
  function clean(saved, known, cols, rows) {
    if (!Array.isArray(saved)) return null;
    const out = [];
    for (const it of saved) {
      if (!it || !known.includes(it.id) || out.some((o) => o.id === it.id)) continue;
      if (!drop(out, fit(it, cols, rows), rows)) return null;
    }
    return out;
  }

  return { MIN_W, MIN_H, hit, fit, place, add, clean };
})();

if (typeof module === 'object') module.exports = Grid;
