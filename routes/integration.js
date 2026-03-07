/**
 * مسارات API التكامل (ERP / محاسبة) — مصادقة بجلسة أدمن أو مفتاح INTEGRATION_API_KEY.
 * راجع docs/API-INTEGRATION.md.
 */

/** استخراج المبلغ الرقمي من order.value (مثلاً "تسمية - 3000" أو "3000") */
function orderValueToAmount(val) {
  if (val == null || String(val).trim() === '') return 0;
  const s = String(val).trim();
  const sep = s.match(/\s*-\s*/);
  const numStr = sep ? s.substring(s.indexOf(sep[0]) + sep[0].length).trim() : s;
  const n = parseFloat(numStr.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function registerIntegration(app, opts) {
  const db = opts.db;
  const requireAdminOrIntegrationKey = opts.requireAdminOrIntegrationKey;
  if (!db || !requireAdminOrIntegrationKey) {
    throw new Error('routes/integration: db and requireAdminOrIntegrationKey are required');
  }

  app.get('/api/integration/orders-summary', requireAdminOrIntegrationKey, (req, res) => {
    try {
      const dateFrom = (req.query.date_from || '').trim() || null;
      const dateTo = (req.query.date_to || '').trim() || null;
      const orders = db.getOrdersFiltered ? db.getOrdersFiltered({ date_from: dateFrom, date_to: dateTo }) : (db.getOrders() || []).filter((o) => {
        if (dateFrom && (o.date || '').slice(0, 10) < dateFrom) return false;
        if (dateTo && (o.date || '').slice(0, 10) > dateTo) return false;
        return true;
      });
      const completed = orders.filter((o) => o.status === 'completed');
      const totalCommission = completed.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0);
      const totalSales = orders.reduce((s, o) => s + orderValueToAmount(o.value), 0);
      res.json({ totalOrders: orders.length, completedOrders: completed.length, totalSales, totalCommission, period: { from: dateFrom, to: dateTo } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/integration/commissions-summary', requireAdminOrIntegrationKey, (req, res) => {
    try {
      const dateFrom = (req.query.date_from || '').trim() || null;
      const dateTo = (req.query.date_to || '').trim() || null;
      const orders = db.getOrdersForReport(dateFrom, dateTo, null) || [];
      const completed = orders.filter((o) => o.status === 'completed');
      const byVendor = {};
      completed.forEach((o) => {
        const vid = o.vendor_id != null ? o.vendor_id : 0;
        const vname = o.vendor_name || (vid === 0 ? '—' : '#' + vid);
        if (!byVendor[vid]) byVendor[vid] = { vendor_id: vid, vendor_name: vname, totalCommission: 0, orderCount: 0 };
        byVendor[vid].totalCommission += Number(o.commission_amount) || 0;
        byVendor[vid].orderCount += 1;
      });
      const totalCommission = completed.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0);
      res.json({ totalCommission, byVendor: Object.values(byVendor).sort((a, b) => b.totalCommission - a.totalCommission), period: { from: dateFrom, to: dateTo } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/integration/orders', requireAdminOrIntegrationKey, (req, res) => {
    try {
      const dateFrom = (req.query.date_from || '').trim() || null;
      const dateTo = (req.query.date_to || '').trim() || null;
      const vendorId = req.query.vendor_id != null ? parseInt(req.query.vendor_id, 10) : null;
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const orders = db.getOrdersForReport(dateFrom, dateTo, isNaN(vendorId) ? null : vendorId) || [];
      const slice = orders.slice(offset, offset + limit);
      res.json({ orders: slice, total: orders.length, limit, offset });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerIntegration };
