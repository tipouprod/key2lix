/**
 * S18: Brotli when client sends Accept-Encoding: br. Use before compression();
 * compression() filter skips when res.useBrotli so only one encoding is applied.
 */
const zlib = require('zlib');

const COMPRESSIBLE_TYPES = /text\/|application\/json|application\/javascript|image\/svg\+xml/;

function shouldCompress(res) {
  const type = res.getHeader('Content-Type') || '';
  return COMPRESSIBLE_TYPES.test(type);
}

function brotliMiddleware(req, res, next) {
  const enc = (req.headers['accept-encoding'] || '').toLowerCase();
  if (enc.includes('br')) res.useBrotli = true;
  next();
}

function brotliCompressMiddleware(req, res, next) {
  if (!res.useBrotli) return next();

  const _write = res.write;
  const _end = res.end;
  const chunks = [];

  res.write = function (chunk, encoding, cb) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
    if (typeof encoding === 'function') cb = encoding;
    if (cb) cb();
    return true;
  };
  res.end = function (chunk, encoding, cb) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
    if (typeof encoding === 'function') cb = encoding;
    const body = Buffer.concat(chunks);
    const MAX_BROTLI_BODY = 1.5 * 1024 * 1024; // 1.5 MB — تجنب ذاكرة كبيرة مع الاستجابات الكبيرة
    if (!shouldCompress(res) || body.length === 0 || body.length > MAX_BROTLI_BODY) {
      res.write = _write;
      res.end = _end;
      return res.end(chunk, encoding, cb);
    }
    zlib.brotliCompress(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }, (err, compressed) => {
      if (err) {
        res.write = _write;
        res.end = _end;
        return res.end(chunk, encoding, cb);
      }
      res.removeHeader('Content-Length');
      res.setHeader('Content-Encoding', 'br');
      res.setHeader('Content-Length', String(compressed.length));
      res.end(compressed, cb);
    });
  };
  next();
}

module.exports = { brotliMiddleware, brotliCompressMiddleware };
