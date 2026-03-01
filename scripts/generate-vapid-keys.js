#!/usr/bin/env node
/**
 * P3: توليد مفاتيح VAPID لـ Web Push
 * أضفها إلى .env:
 * VAPID_PUBLIC_KEY=...
 * VAPID_PRIVATE_KEY=...
 */
const webPush = require('web-push');
const keys = webPush.generateVAPIDKeys();
console.log('Add these to your .env file:\n');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
