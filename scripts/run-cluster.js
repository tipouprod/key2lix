/**
 * تشغيل Key2lix بعدة عقد (Node cluster)
 * الاستخدام: node scripts/run-cluster.js  أو  npm run start:cluster
 * ضع SESSION_STORE=db في .env حتى تعمل الجلسات عبر العقد.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cluster = require('cluster');
const os = require('os');

const numWorkers = parseInt(process.env.CLUSTER_WORKERS || '', 10) || os.cpus().length;
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

if (cluster.isPrimary) {
  console.log('Primary: starting', numWorkers, 'workers on port', PORT);
  for (let i = 0; i < numWorkers; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.warn('Worker', worker.process.pid, 'exited with code', code);
    cluster.fork();
  });
} else {
  const app = require('../server.js');
  const server = app.listen(PORT, HOST, () => {
    console.log('Worker', process.pid, 'listening on', HOST + ':' + PORT);
  });
  server.on('error', (err) => {
    console.error('Worker listen error:', err.message);
    process.exit(1);
  });
}
