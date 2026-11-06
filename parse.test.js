// Runs parse.js on sample markup. DOMParser needs a browser, so: npx electron parse.test.js
const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ulportal-parse-')));

const GRADES = `<table class="generaltable user-grade"><tbody>
<tr><td class="column-leader"></td><th class="level1 column-itemname" colspan="7">Базы данных</th></tr>
<tr><th class="level2 item column-itemname"><a class="gradeitemheader"><img alt="Тест">1.1 Данные (тест)</a></th>
  <td class="column-weight">-</td><td class="column-grade">3,50</td><td class="column-range">0–4</td>
  <td class="column-percentage">87,50 %</td><td class="column-feedback">Хорошо</td><td class="column-contributiontocoursetotal">-</td></tr>
<tr><th class="level2 item column-itemname">Не сдано</th><td class="column-grade">-</td><td class="column-range">0–10</td><td class="column-feedback">&nbsp;</td></tr>
<tr><th class="level2 baggt column-itemname">Итог раздела</th><td class="column-grade">3,50</td></tr>
<tr><th class="level1 baggt b2b column-itemname">Итоговая оценка за курс</th><td class="column-grade">Ошибка</td><td class="column-range">0–14</td><td class="column-percentage">Ошибка</td></tr>
</tbody></table>`;

const EMPTY_NOW = '<div role="main"><div class="accordion">Текущая успеваемость не найдена!</div></div>';
const TABLE_NOW = `<div role="main"><div class="accordion"><div class="card"><div class="card-header">Семестр 1</div>
<table><thead><tr><th>Дисциплина</th><th>Балл</th></tr></thead><tbody><tr><td>Математика</td><td>70</td></tr><tr><td></td><td></td></tr></tbody></table></div></div></div>`;

// Shape from Moodle 3.7 mod_folder renderer (htmllize_tree); not yet seen on the real portal.
const FOLDER = `<div id="folder_tree0" class="filemanager"><ul>
<li><div class="fp-filename-icon"><span class="fp-icon"><img></span><span class="fp-filename">Лекции</span></div>
  <ul><li><span class="fp-filename-icon"><a href="https://portal.ulsu.ru/pluginfile.php/1/mod_folder/content/0/a.pdf?forcedownload=1"><span class="fp-filename">a.pdf</span></a></span></li></ul></li>
<li><span class="fp-filename-icon"><a href="/pluginfile.php/1/mod_folder/content/0/b.pptx"><span class="fp-filename">b.pptx</span></a></span></li>
</ul></div>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'parse.js'), 'utf8').replace('const Parse', 'var Parse'));
  const run = (fn, markup) => win.webContents.executeJavaScript(
    `Parse.${fn}(new DOMParser().parseFromString(${JSON.stringify(markup)}, 'text/html'))`);
  try {
    const g = await run('gradeDetail', GRADES);
    assert.deepStrictEqual(g.map((r) => r.kind), ['category', 'item', 'item', 'subtotal', 'total']);
    assert.strictEqual(g[1].name, '1.1 Данные (тест)');
    assert.strictEqual(g[1].grade, '3,50');
    assert.strictEqual(g[1].percent, '87,50 %');
    assert.strictEqual(g[1].feedback, 'Хорошо');
    assert.strictEqual(g[1].weight, ''); // "-" means no value
    assert.strictEqual(g[2].grade, '');
    assert.strictEqual(g[2].feedback, '');
    assert.strictEqual(g[4].grade, ''); // "Ошибка" is no grade
    assert.strictEqual(g[4].percent, '');
    assert.deepStrictEqual((await run('gradeDetail', '<p>no table</p>')), []);

    const empty = await run('currentProgress', EMPTY_NOW);
    assert.deepStrictEqual(empty, { tables: [], note: 'Текущая успеваемость не найдена!' });
    const filled = await run('currentProgress', TABLE_NOW);
    assert.strictEqual(filled.tables[0].title, 'Семестр 1');
    assert.deepStrictEqual(filled.tables[0].rows, [['Математика', '70']]);

    const f = await run('folder', FOLDER);
    assert.strictEqual(f[0].name, 'Лекции');
    assert.strictEqual(f[0].items[0].name, 'a.pdf');
    assert.strictEqual(f[1].url, 'https://portal.ulsu.ru/pluginfile.php/1/mod_folder/content/0/b.pptx');
    assert.deepStrictEqual(await run('folder', '<div></div>'), []);
    console.log('parse.test.js: ok');
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
