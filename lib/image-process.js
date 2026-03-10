/**
 * معالجة الصور: ضغط، تحويل WebP، وتوليد WebP عند الطلب.
 * يُستخدم عند رفع الصور (منتجات، شعار، بانر، إعدادات) وعند تقديم /assets/img/:name.webp.
 * راجع docs/PERFORMANCE-PLAN.md.
 */
const path = require('path');
const fs = require('fs');

const DEFAULT_MAX_WIDTH = parseInt(process.env.IMAGE_MAX_WIDTH || '1920', 10) || 1920;
const DEFAULT_MAX_HEIGHT = parseInt(process.env.IMAGE_MAX_HEIGHT || '1920', 10) || 1920;
const WEBP_QUALITY = parseInt(process.env.IMAGE_WEBP_QUALITY || '82', 10) || 82;
const FALLBACK_MAX = parseInt(process.env.IMAGE_FALLBACK_MAX || '1200', 10) || 1200;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function getSharp() {
  try {
    return require('sharp');
  } catch (_) {
    return null;
  }
}

/**
 * معالجة صورة مرفوعة: تصغير أبعاد، تحويل إلى WebP، حذف الأصل.
 * عند فشل WebP: تصغير الأصل فقط (حد 1200px) وجودة 85% للحفاظ على حجم معقول.
 * @param {string} filePath - المسار المطلق للملف المرفوع
 * @param {object} options - { maxWidth, maxHeight, webpQuality, fallbackMax }
 * @param {function} toRelative - (absolutePath) => path relative to client root (e.g. assets/img/foo.webp)
 * @returns {{ main: string } | string | null} object مع main للمسار النسبي، أو سلسلة مسار، أو null
 */
async function processUploadedImage(filePath, options, toRelative) {
  const sharp = getSharp();
  if (!sharp || !filePath || !fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return null;

  const maxW = (options && options.maxWidth) || DEFAULT_MAX_WIDTH;
  const maxH = (options && options.maxHeight) || DEFAULT_MAX_HEIGHT;
  const quality = (options && options.webpQuality) != null ? options.webpQuality : WEBP_QUALITY;
  const fallbackMax = (options && options.fallbackMax) != null ? options.fallbackMax : FALLBACK_MAX;

  const outPath = filePath.replace(/\.[a-z]+$/i, '.webp');
  if (outPath === filePath) return null;

  try {
    await sharp(filePath)
      .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toFile(outPath);
    try { fs.unlinkSync(filePath); } catch (_) {}
    const rel = toRelative ? toRelative(outPath) : path.basename(outPath);
    return { main: rel };
  } catch (err) {
    try {
      await resizeAndOverwrite(filePath, fallbackMax, sharp);
      const rel = toRelative ? toRelative(filePath) : path.basename(filePath);
      return rel;
    } catch (e2) {
      const rel = toRelative ? toRelative(filePath) : path.basename(filePath);
      return rel;
    }
  }
}

/**
 * تصغير صورة والكتابة فوق الملف الأصلي (JPEG/PNG جودة 85).
 */
async function resizeAndOverwrite(filePath, maxDim, sharpLib) {
  const ext = path.extname(filePath).toLowerCase();
  const pipeline = sharpLib(filePath).resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });
  if (ext === '.png') {
    await pipeline.png({ compressionLevel: 6 }).toFile(filePath + '.tmp');
  } else {
    await pipeline.jpeg({ quality: 85 }).toFile(filePath + '.tmp');
  }
  fs.renameSync(filePath + '.tmp', filePath);
}

/**
 * إنشاء نسخة WebP من صورة ثابتة (للمسار GET /assets/img/:name.webp).
 * الملف الناتج يُحفظ في مجلد الكاش لتفادي إعادة التوليد.
 * @param {string} originalAbsolutePath - المسار المطلق للملف الأصلي (jpg/png/gif)
 * @param {string} cacheDirAbsolute - المسار المطلق لمجلد كاش WebP (مثلاً client/assets/img/.webp-cache)
 * @returns {string | null} المسار المطلق لملف WebP المُنشأ أو null
 */
async function getOrCreateWebP(originalAbsolutePath, cacheDirAbsolute) {
  const sharp = getSharp();
  if (!sharp || !originalAbsolutePath || !fs.existsSync(originalAbsolutePath)) return null;
  const ext = path.extname(originalAbsolutePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return null;

  const base = path.basename(originalAbsolutePath, ext);
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const webpFileName = safeBase + '.webp';
  if (!fs.existsSync(cacheDirAbsolute)) fs.mkdirSync(cacheDirAbsolute, { recursive: true });
  const webpPath = path.join(cacheDirAbsolute, webpFileName);

  if (fs.existsSync(webpPath)) return webpPath;

  try {
    await sharp(originalAbsolutePath)
      .resize(DEFAULT_MAX_WIDTH, DEFAULT_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(webpPath);
    return webpPath;
  } catch (_) {
    return null;
  }
}

/**
 * البحث عن الملف الأصلي لصورة (بدون امتداد أو باسم مع امتداد) في مجلد معيّن.
 * @param {string} imgDir - المسار المطلق لمجلد الصور
 * @param {string} baseName - اسم الملف بدون .webp (مثلاً "Promo Banner" من "Promo Banner.webp")
 * @returns {string | null} المسار المطلق لأول ملف موجود من [baseName.jpg, ...]
 */
function findOriginalImage(imgDir, baseName) {
  const raw = (baseName || '').replace(/\.\./g, '').replace(/[/\\]/g, '');
  const candidates = [raw];
  const safeBase = path.basename(raw).replace(/[^a-zA-Z0-9._\u0600-\u06FF\s-]/g, '_').trim();
  if (safeBase && safeBase !== raw) candidates.push(safeBase);
  const exts = ['.jpg', '.jpeg', '.png', '.gif'];
  for (const base of candidates) {
    if (!base) continue;
    for (const e of exts) {
      const p = path.join(imgDir, base + e);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

module.exports = {
  processUploadedImage,
  getOrCreateWebP,
  findOriginalImage,
  DEFAULT_MAX_WIDTH,
  DEFAULT_MAX_HEIGHT,
  WEBP_QUALITY,
  FALLBACK_MAX
};
