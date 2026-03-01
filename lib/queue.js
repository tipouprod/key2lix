/**
 * Queue اختياري (Bull + Redis) للعمليات الثقيلة — البريد أولاً
 * التفعيل: REDIS_URL و QUEUE_ENABLED=1 في .env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const REDIS_URL = (process.env.REDIS_URL || '').trim();
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const QUEUE_ENABLED = process.env.QUEUE_ENABLED === '1' || process.env.QUEUE_ENABLED === 'true';

let emailQueue = null;
let workersStarted = false;

function isQueueEnabled() {
  return QUEUE_ENABLED && (REDIS_URL || (process.env.REDIS_HOST != null && process.env.REDIS_HOST !== ''));
}

function getRedisConfig() {
  if (REDIS_URL && (REDIS_URL.startsWith('redis://') || REDIS_URL.startsWith('rediss://')))
    return REDIS_URL;
  return { host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: null, lazyConnect: true };
}

function getEmailQueue() {
  if (!isQueueEnabled()) return null;
  if (emailQueue) return emailQueue;
  try {
    const Bull = require('bull');
    const redis = getRedisConfig();
    emailQueue = new Bull('key2lix-email', {
      redis: typeof redis === 'string' ? redis : redis,
      defaultJobOptions: { removeOnComplete: 50, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    });
    return emailQueue;
  } catch (e) {
    return null;
  }
}

/**
 * إضافة مهمة بريد إلى الطابور. البيانات: { type, ...payload }
 * type: notifyVendorNewOrder | notifyVendorProductApproved | notifyClientOrderStatusChanged | sendEmailVerification | sendPasswordResetEmail | notifyClientNewReply | sendMail
 */
function addEmailJob(data) {
  const q = getEmailQueue();
  if (!q) return Promise.resolve(null);
  return q.add(data, { removeOnComplete: 100 }).catch((err) => {
    console.warn('[queue] addEmailJob failed:', err && err.message);
    return null;
  });
}

function startWorkers() {
  if (!isQueueEnabled() || workersStarted) return;
  const q = getEmailQueue();
  if (!q) return;
  workersStarted = true;
  const emailService = require('./email');
  q.process((job) => {
    const { type, ...payload } = job.data;
    const p = type === 'sendMail' ? emailService.sendMail(payload.to, payload.subject, payload.text, payload.html)
      : type === 'notifyVendorNewOrder' ? emailService.notifyVendorNewOrder(payload.to, payload.order)
      : type === 'notifyVendorProductApproved' ? emailService.notifyVendorProductApproved(payload.to, payload.productName)
      : type === 'notifyClientOrderStatusChanged' ? emailService.notifyClientOrderStatusChanged(payload.to, payload.orderId, payload.status, payload.productName)
      : type === 'sendEmailVerification' ? emailService.sendEmailVerification(payload.to, payload.code)
      : type === 'sendPasswordResetEmail' ? emailService.sendPasswordResetEmail(payload.to, payload.resetLink)
      : type === 'notifyClientNewReply' ? emailService.notifyClientNewReply(payload.to, payload.orderId, payload.productName, payload.senderLabel)
      : Promise.resolve();
    return p;
  });
  q.on('failed', (job, err) => {
    console.warn('[queue] job failed:', job && job.id, err && err.message);
  });
  console.info('[queue] Key2lix email worker started (Bull)');
}

module.exports = { isQueueEnabled, addEmailJob, startWorkers, getEmailQueue };
