const fs = require('node:fs');
const path = require('node:path');

function copyStudyVendor(destination = 'study-vendor') {
  const root = __dirname;
  const pdf = path.join(root, 'node_modules/pdfjs-dist');
  const zip = path.join(root, 'node_modules/@zip.js/zip.js');
  const target = path.resolve(root, destination);
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    fs.copyFileSync(path.join(pdf, 'legacy/build', name), path.join(target, name));
  }
  for (const name of ['cmaps', 'standard_fonts']) {
    fs.cpSync(path.join(pdf, name), path.join(target, name), { recursive: true });
  }
  fs.copyFileSync(path.join(pdf, 'LICENSE'), path.join(target, 'PDFJS-LICENSE'));
  fs.copyFileSync(path.join(zip, 'LICENSE'), path.join(target, 'ZIPJS-LICENSE'));
  fs.copyFileSync(path.join(zip, 'dist/zip-legacy.min.js'), path.join(target, 'zip.js'));
}

if (require.main === module) copyStudyVendor();
module.exports = copyStudyVendor;
