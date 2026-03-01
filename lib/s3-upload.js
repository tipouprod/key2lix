/**
 * رفع ملفات (مثل صور المنتجات) إلى S3 أو Backblaze B2.
 * عند ضبط IMAGES_S3_BUCKET في .env يتم استدعاء uploadProductImages() بعد معالجة الصور.
 *
 * متغيرات البيئة:
 * - IMAGES_S3_BUCKET
 * - IMAGES_S3_REGION (افتراضي us-east-1)
 * - IMAGES_S3_ACCESS_KEY / AWS_ACCESS_KEY_ID
 * - IMAGES_S3_SECRET_KEY / AWS_SECRET_ACCESS_KEY
 * - IMAGES_S3_ENDPOINT (اختياري، للـ B2)
 * - IMAGES_S3_PUBLIC_URL_BASE (أساس رابط العرض، مثلاً https://cdn.key2lix.com أو https://bucket.s3.region.amazonaws.com)
 */

const path = require('path');
const fs = require('fs');

function getClient() {
  const bucket = process.env.IMAGES_S3_BUCKET;
  const region = process.env.IMAGES_S3_REGION || 'us-east-1';
  const accessKey = process.env.IMAGES_S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.IMAGES_S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.IMAGES_S3_ENDPOINT || null;
  if (!bucket || !accessKey || !secretKey) return null;
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    const clientConfig = {
      region: region.trim(),
      credentials: { accessKeyId: accessKey.trim(), secretAccessKey: secretKey.trim() }
    };
    if (endpoint) clientConfig.endpoint = endpoint.trim();
    return { client: new S3Client(clientConfig), bucket: bucket.trim() };
  } catch (e) {
    return null;
  }
}

function getPublicBase() {
  const base = process.env.IMAGES_S3_PUBLIC_URL_BASE || process.env.IMAGES_S3_CDN_URL || '';
  return base ? base.replace(/\/$/, '') : '';
}

/**
 * رفع ملف محلي إلى S3.
 * @param {string} localPath - المسار الكامل للملف
 * @param {string} s3Key - المفتاح في الـ bucket (مثل products/2025-02/xxx.webp)
 * @returns {Promise<string|null>} الرابط العام أو null عند الفشل
 */
async function uploadFile(localPath, s3Key) {
  const cfg = getClient();
  const base = getPublicBase();
  if (!cfg || !base || !fs.existsSync(localPath)) return null;
  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const body = fs.readFileSync(localPath);
    const ext = path.extname(s3Key).toLowerCase();
    const contentType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
    await cfg.client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: s3Key,
      Body: body,
      ContentType: contentType
    }));
    return base + '/' + s3Key;
  } catch (err) {
    return null;
  }
}

/**
 * رفع صورة منتج (main) من مسار محلي إلى S3 وإرجاع رابط عام.
 * @param {object} rel - { main } مسار نسبي للصورة
 * @param {string} clientRoot - مجلد الواجهة (client أو dist)
 * @param {string} serverDir - المسار الكامل لجذر المشروع (__dirname من server)
 * @returns {Promise<object|null>} نفس الشكل مع استبدال المسارات بروابط S3، أو null إذا لم يُفعّل S3 أو فشل الرفع
 */
async function uploadProductImagesToS3(rel, clientRoot, serverDir) {
  const cfg = getClient();
  const base = getPublicBase();
  if (!cfg || !base || !rel || typeof rel !== 'object') return null;
  const prefix = 'products/' + new Date().toISOString().slice(0, 7) + '/'; // YYYY-MM
  const toAbsolute = (p) => path.join(serverDir, clientRoot, p.replace(/^\//, '').replace(/\\/g, path.sep));
  const keys = [];
  if (rel.main) keys.push({ local: toAbsolute(rel.main), key: prefix + path.basename(rel.main), out: 'main' });
  if (rel.thumb) keys.push({ local: toAbsolute(rel.thumb), key: prefix + path.basename(rel.thumb), out: 'thumb' });
  if (rel.medium) keys.push({ local: toAbsolute(rel.medium), key: prefix + path.basename(rel.medium), out: 'medium' });
  const result = { main: rel.main, thumb: rel.thumb, medium: rel.medium };
  let anyUploaded = false;
  for (const { local, key, out } of keys) {
    const url = await uploadFile(local, key);
    if (url) {
      result[out] = url;
      anyUploaded = true;
    }
  }
  return anyUploaded ? result : null;
}

function isS3Enabled() {
  return !!(process.env.IMAGES_S3_BUCKET && getPublicBase());
}

module.exports = {
  getClient,
  getPublicBase,
  uploadFile,
  uploadProductImagesToS3,
  isS3Enabled
};
