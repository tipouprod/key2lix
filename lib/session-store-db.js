/**
 * تخزين الجلسات في قاعدة البيانات (SQLite أو PostgreSQL) بدل الذاكرة.
 * يُفعّل عند ضبط SESSION_STORE=db — مناسب لبيئة متعددة العقد أو إطالة عمر الجلسة.
 * يجب توريث Store من express-session للحصول على createSession و EventEmitter.
 */
const { Store } = require('express-session');
const db = require('../database');

class SessionStoreDb extends Store {
  constructor() {
    super();
  }
  get(sid, callback) {
    setImmediate(() => {
      try {
        const row = db.getSessionRow(sid);
        if (!row) return callback(null, null);
        callback(null, JSON.parse(row.session));
      } catch (e) {
        callback(e);
      }
    });
  }

  set(sid, session, callback) {
    setImmediate(() => {
      try {
        const maxAge = (session && session.cookie && session.cookie.maxAge) || 24 * 60 * 60 * 1000;
        db.setSessionRow(sid, JSON.stringify(session), maxAge);
        callback(null);
      } catch (e) {
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
