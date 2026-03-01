/**
 * PM2 — تشغيل عقد متعددة من Key2lix
 * الاستخدام: pm2 start ecosystem.config.cjs
 * تأكد من SESSION_STORE=db في .env حتى تعمل الجلسات عبر العقد.
 */
module.exports = {
  apps: [
    {
      name: 'key2lix',
      script: 'server.js',
      instances: process.env.PM2_INSTANCES ? parseInt(process.env.PM2_INSTANCES, 10) : 1,
      exec_mode: 'cluster',
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
    },
  ],
};
