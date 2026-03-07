const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'server.js');
let c = fs.readFileSync(file, 'utf8');

// Block 2: from app.get('/api/admin/settings/support') through app.post('/api/delete-product')
const mark1 = "app.get('/api/admin/settings/support', requireAdmin";
const mark2 = '/* ===== Vendor: Register ===== */';
const s = c.indexOf(mark1);
const e = c.indexOf(mark2);
if (s < 0 || e < 0) {
  console.error('Block2 not found: s=' + s + ' e=' + e);
  process.exit(1);
}
const lineStart = c.lastIndexOf('\n', s);
c = c.slice(0, lineStart).trimEnd() + '\n\n' + c.slice(e);
fs.writeFileSync(file, c);
console.log('Block 2 removed');
