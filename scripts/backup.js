/**
 * نسخ احتياطي لملف قاعدة البيانات SQLite. (P29)
 * الاستخدام: node scripts/backup.js   أو  npm run backup
 * ينسخ client/data/key2lix.db إلى client/data/backup/key2lix-YYYY-MM-DD_HH-mm-ss.db
 * P29: رفع تلقائي إلى S3/B2 عند ضبط BACKUP_UPLOAD_ENABLED=1
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const projectRoot = path.join(__dirname, '..');
const dbFilename = (process.env.DB_FILENAME || 'key2lix.db').replace(/[<>:"/\\|?*]/g, '') || 'key2lix.db';
const dbPath = path.join(projectRoot, 'client', 'data', dbFilename);
const backupDir = path.join(projectRoot, 'client', 'data', 'backup');

function now() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
}

if (!fs.existsSync(dbPath)) {
  console.error('لم يتم العثور على الملف:', dbPath);
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const dest = path.join(backupDir, 'key2lix-' + now() + '.db');
fs.copyFileSync(dbPath, dest);
console.log('تم النسخ الاحتياطي:', dest);

// P29: رفع إلى S3 أو Backblaze B2
const uploadEnabled = process.env.BACKUP_UPLOAD_ENABLED === '1' || process.env.BACKUP_UPLOAD_ENABLED === 'true';
const bucket = process.env.BACKUP_S3_BUCKET;
const region = process.env.BACKUP_S3_REGION || 'us-east-1';
const accessKey = process.env.BACKUP_S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.BACKUP_S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const endpoint = process.env.BACKUP_S3_ENDPOINT || null; // B2: https://s3.us-west-002.backblazeb2.com

if (uploadEnabled && bucket && accessKey && secretKey) {
  (async function upload() {
    try {
      const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const clientConfig = {
        region: region,
        credentials: { accessKeyId: accessKey.trim(), secretAccessKey: secretKey.trim() }
      };
      if (endpoint) clientConfig.endpoint = endpoint;
      const client = new S3Client(clientConfig);
      const key = 'backups/' + path.basename(dest);
      const body = fs.createReadStream(dest);
      await client.send(new PutObjectCommand({
        Bucket: bucket.trim(),
        Key: key,
        Body: body
      }));
      console.log('تم الرفع إلى السحابة:', bucket + '/' + key);
      /* S4: الاحتفاظ بآخر N نسخ فقط في السحابة — حذف الأقدم */
      const keepCount = Math.max(1, parseInt(process.env.BACKUP_CLOUD_KEEP_COUNT || '4', 10) || 4);
      const list = await client.send(new ListObjectsV2Command({
        Bucket: bucket.trim(),
        Prefix: 'backups/'
      }));
      const objects = (list.Contents || []).filter((o) => o.Key && o.Key.startsWith('backups/') && o.Key.endsWith('.db'));
      if (objects.length > keepCount) {
        objects.sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0));
        const toDelete = objects.slice(keepCount);
        for (const obj of toDelete) {
          await client.send(new DeleteObjectCommand({ Bucket: bucket.trim(), Key: obj.Key }));
          console.log('حذف نسخة قديمة من السحابة:', obj.Key);
        }
      }
    } catch (err) {
      console.error('فشل الرفع:', err.message);
      process.exitCode = 1;
    }
  })();
}
