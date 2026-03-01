/**
 * خطوة بناء الواجهة: نسخ client إلى dist ثم تصغير JS و CSS.
 * الاستخدام: npm run build
 * للإنتاج: USE_BUILD=1 node server.js (يخدم من مجلد dist)
 */
const fs = require('fs');
const path = require('path');
const { minify: minifyJs } = require('terser');
const CleanCSS = require('clean-css');

const projectRoot = path.join(__dirname, '..');
const clientDir = path.join(projectRoot, 'client');
const distDir = path.join(projectRoot, 'dist');

function copyRecursive(src, dest, rootSrc) {
  rootSrc = rootSrc || src;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const rel = path.relative(rootSrc, src);
    if (rel === 'data' || rel === 'client\\data' || rel === 'client/data') return; // لا ننسخ البيانات إلى dist
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name), rootSrc);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

async function run() {
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  console.log('Copying client → dist...');
  copyRecursive(clientDir, distDir, clientDir);

  const jsDir = path.join(distDir, 'assets', 'js');
  const cssDir = path.join(distDir, 'assets', 'css');
  const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
  const cssFiles = fs.existsSync(cssDir)
    ? fs.readdirSync(cssDir).filter((f) => f.endsWith('.css'))
    : [];

  console.log('Minifying JS...');
  for (const file of jsFiles) {
    const fp = path.join(jsDir, file);
    const code = fs.readFileSync(fp, 'utf8');
    const result = await minifyJs(code, { format: { comments: false } });
    if (result.code) fs.writeFileSync(fp, result.code);
  }

  console.log('Minifying CSS...');
  const cleanCss = new CleanCSS({ level: 1 });
  for (const file of cssFiles) {
    const fp = path.join(cssDir, file);
    const css = fs.readFileSync(fp, 'utf8');
    const out = cleanCss.minify(css);
    if (!out.errors.length) fs.writeFileSync(fp, out.styles);
  }

  console.log('Build done: dist/');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
