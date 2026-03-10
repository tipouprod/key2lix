/**
 * ضغط صور المجلد client/assets/img (واختيارياً dist): تصغير أبعاد وجودة، وإنشاء نسخ WebP.
 * الاستخدام: node scripts/optimize-images.js [--webp] [--dist]
 *   --webp  أيضاً إنشاء نسخ .webp بجانب كل صورة
 *   --dist  معالجة dist/assets/img إن وُجد (بعد npm run build)
 * راجع docs/PERFORMANCE-PLAN.md.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const MAX_WIDTH = parseInt(process.env.IMAGE_MAX_WIDTH || process.env.OPTIMIZE_IMAGE_MAX_WIDTH || '1200', 10) || 1200;
const QUALITY = 85;
const WEBP_QUALITY = parseInt(process.env.IMAGE_WEBP_QUALITY || '82', 10) || 82;
const MIN_SIZE_TO_PROCESS = 50 * 1024; // 50 KB — تجاهل الملفات الصغيرة جداً

let sharp;
try {
  sharp = require('sharp');
} catch (_) {
  console.error('Sharp is required. Run: npm install sharp');
  process.exit(1);
}

const args = process.argv.slice(2);
const withWebP = args.includes('--webp');
const withDist = args.includes('--dist');

const dirs = [path.join(projectRoot, 'client', 'assets', 'img')];
if (withDist) dirs.push(path.join(projectRoot, 'dist', 'assets', 'img'));

const exts = ['.jpg', '.jpeg', '.png'];

async function optimizeFile(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size < MIN_SIZE_TO_PROCESS) return { skipped: true, reason: 'small' };
  const ext = path.extname(filePath).toLowerCase();
  if (!exts.includes(ext)) return { skipped: true, reason: 'ext' };
  const base = path.basename(filePath);
  if (base.startsWith('.') || base === 'default.png') return { skipped: true, reason: 'reserved' };
  const dir = path.dirname(filePath);
  if (path.basename(dir) === '.webp-cache') return { skipped: true, reason: 'cache' };

  try {
    const pipeline = sharp(filePath)
      .resize(MAX_WIDTH, MAX_WIDTH, { fit: 'inside', withoutEnlargement: true });

    if (ext === '.png') {
      await pipeline.png({ compressionLevel: 6 }).toFile(filePath + '.opt');
    } else {
      await pipeline.jpeg({ quality: QUALITY }).toFile(filePath + '.opt');
    }
    fs.renameSync(filePath + '.opt', filePath);
    const newStat = fs.statSync(filePath);
    let webpPath = null;
    if (withWebP) {
      const webpOut = filePath.replace(/\.[a-z]+$/i, '.webp');
      if (webpOut !== filePath) {
        await sharp(filePath).webp({ quality: WEBP_QUALITY }).toFile(webpOut);
        webpPath = webpOut;
      }
    }
    return { ok: true, before: stat.size, after: newStat.size, webp: webpPath };
  } catch (err) {
    return { error: err.message };
  }
}

async function run() {
  let total = 0;
  let processed = 0;
  let errors = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log('Skip (not found):', dir);
      continue;
    }
    console.log('Scanning:', dir);
    const files = fs.readdirSync(dir)
      .filter((n) => exts.some((e) => n.toLowerCase().endsWith(e)))
      .map((n) => path.join(dir, n));
    for (const fp of files) {
      total++;
      const r = await optimizeFile(fp);
      if (r.skipped) continue;
      if (r.error) {
        console.warn('Error', fp, r.error);
        errors++;
        continue;
      }
      processed++;
      const saved = r.before - r.after;
      const pct = r.before ? Math.round((saved / r.before) * 100) : 0;
      console.log('  ', path.basename(fp), `${(r.before / 1024).toFixed(1)}KB → ${(r.after / 1024).toFixed(1)}KB (-${pct}%)`, r.webp ? '+ WebP' : '');
    }
  }
  console.log('Done. Total:', total, 'Processed:', processed, 'Errors:', errors);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
