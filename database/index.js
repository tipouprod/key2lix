/**
 * P17: تحميل قاعدة البيانات حسب DB_DRIVER
 * sqlite (افتراضي) أو postgres
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

if (driver === 'postgres') {
  module.exports = require('./db-pg');
} else {
  module.exports = require('./db');
}
