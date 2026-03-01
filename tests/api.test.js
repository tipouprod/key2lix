/**
 * A17: اختبارات آلية لـ API (Jest + supertest)
 */
const request = require('supertest');
const app = require('../server');

describe('Public API', () => {
  test('GET /api/config returns sentryDsn, env and social (P26)', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sentryDsn');
    expect(res.body).toHaveProperty('env');
    expect(res.body).toHaveProperty('social');
    expect(res.body.social).toHaveProperty('facebook');
  });

  test('GET /api/settings/commission returns threshold and rates', async () => {
    const res = await request(app).get('/api/settings/commission');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('threshold');
    expect(res.body).toHaveProperty('rate_below');
    expect(res.body).toHaveProperty('rate_above');
    expect(typeof res.body.threshold).toBe('number');
    expect(typeof res.body.rate_below).toBe('number');
    expect(typeof res.body.rate_above).toBe('number');
  });

  test('GET /data/products.json returns 200 and object', async () => {
    const res = await request(app).get('/data/products.json');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  test('GET /api/me without session returns 401', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  test('POST /api/order with invalid or empty body returns 4xx', async () => {
    const res = await request(app)
      .post('/api/order')
      .send({});
    expect([400, 401]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/contact with empty body returns 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({});
    expect(res.status).toBe(400);
  });

  test('GET /health returns status and db (P27 E2E-style)', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('db');
    if (res.status === 200) expect(res.body.status).toBe('ok');
  });

  test('GET /api/products/rating-stats returns object (P7)', async () => {
    const res = await request(app).get('/api/products/rating-stats');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  test('POST /api/newsletter with invalid email returns 400 (P25)', async () => {
    const res = await request(app).post('/api/newsletter').send({ email: 'invalid' });
    expect(res.status).toBe(400);
  });
});
