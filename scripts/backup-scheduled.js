/**
 * تشغيل النسخ الاحتياطي بشكل دوري (مثلاً كل 24 ساعة).
 * الاستخدام: node scripts/backup-scheduled.js   أو  npm run backup:schedule
 * الفاصل الافتراضي: 24 ساعة. يمكن تغييره عبر المتغير البيئي BACKUP_INTERVAL_MS (بالميلي ثانية).
 * للإيقاف: Ctrl+C.
 */
const path = require('path');
const { spawn } = require('child_process');
const projectRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });

const INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_MS || '', 10) || 24 * 60 * 60 * 1000; // 24h

function runBackup() {
  const child = spawn(process.execPath, [path.join(__dirname, 'backup.js')], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  child.on('close', (code) => {
    if (code !== 0) console.error('النسخ الاحتياطي انتهى برمز:', code);
  });
}

console.log('بدء النسخ الاحتياطي الدوري. الفاصل:', INTERVAL_MS / 1000 / 60, 'دقيقة. للإيقاف: Ctrl+C');
runBackup();
setInterval(runBackup, INTERVAL_MS);
