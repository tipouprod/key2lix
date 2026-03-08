/**
 * تخزين الجلسات في قاعدة البيانات (SQLite أو PostgreSQL) بدل الذاكرة.
 * يُفعّل عند ضبط SESSION_STORE=db — مناسب لبيئة متعددة العقد أو إطالة عمر الجلسة.
 * يجب توريث Store من express-session للحصول على createSession و EventEmitter.
 */
const { Store } = require('express-session');
const db = require('../database');

const SESSION_DEBUG = process.env.SESSION_DEBUG === '1' || process.env.SESSION_DEBUG === 'true';

class SessionStoreDb extends Store {
  constructor() {
    super();
  }
  get(sid, callback) {
    setImmediate(() => {
      try {
        const row = db.getSessionRow(sid);
        if (!row) {
          if (SESSION_DEBUG && sid) console.error('[session] NOT FOUND sid=' + String(sid).slice(0, 20) + '...');
          return callback(null, null);
        }
        if (SESSION_DEBUG) console.log('[session] FOUND sid=' + String(sid).slice(0, 20) + '...');
        callback(null, JSON.parse(row.session));
      } catch (e) {
        if (SESSION_DEBUG) console.error('[session] get error:', e.message);
        callback(e);
      }
    });
  }

  set(sid, session, callback) {
    setImmediate(() => {
      try {
        const maxAge = (session && session.cookie && session.cookie.maxAge) || 24 * 60 * 60 * 1000;
        db.setSessionRow(sid, JSON.stringify(session), maxAge);
        if (SESSION_DEBUG && sid) console.log('[session] SAVED sid=' + String(sid).slice(0, 20) + '...');
        callback(null);
      } catch (e) {
        if (SESSION_DEBUG) console.error('[session] set error:', e.message);
        callback(e);
      }
    });
  }

  destroy(sid, callback) {
    setImmediate(() => {
      try {
        db.destroySessionRow(sid);
        callback(null);
      } catch (e) {
        callback(e);
      }
    });
  }
}

module.exports = SessionStoreDb;
