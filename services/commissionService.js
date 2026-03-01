/**
 * منطق عمولة المنصة: عتبة، نسب، حساب العمولة والسعر النهائي.
 * القيم من جدول settings أو .env.
 */
const db = require('../database');

const COMMISSION_DEFAULTS = {
  threshold: parseInt(process.env.COMMISSION_THRESHOLD || '4000', 10) || 4000,
  rateBelow: parseFloat(process.env.COMMISSION_RATE_BELOW || '0.10') || 0.10,
  rateAbove: parseFloat(process.env.COMMISSION_RATE_ABOVE || '0.05') || 0.05
};

let config = { ...COMMISSION_DEFAULTS };

function refreshConfig() {
  try {
    const t = db.getSetting('COMMISSION_THRESHOLD');
    const b = db.getSetting('COMMISSION_RATE_BELOW');
    const a = db.getSetting('COMMISSION_RATE_ABOVE');
    config = {
      threshold: t != null && t !== '' ? (parseInt(t, 10) || COMMISSION_DEFAULTS.threshold) : COMMISSION_DEFAULTS.threshold,
      rateBelow: b != null && b !== '' ? (parseFloat(b) || COMMISSION_DEFAULTS.rateBelow) : COMMISSION_DEFAULTS.rateBelow,
      rateAbove: a != null && a !== '' ? (parseFloat(a) || COMMISSION_DEFAULTS.rateAbove) : COMMISSION_DEFAULTS.rateAbove
    };
  } catch (e) {
    config = { ...COMMISSION_DEFAULTS };
  }
}

function getConfig() {
  return { ...config };
}

function parsePriceFromValue(valueStr) {
  if (valueStr == null || valueStr === '') return NaN;
  const s = String(valueStr).trim().replace(/,/g, '.');
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  return typeof num === 'number' && !isNaN(num) ? num : NaN;
}

function computeCommission(priceDzd) {
  const p = Number(priceDzd);
  if (isNaN(p) || p < 0) return 0;
  const rate = p < config.threshold ? config.rateBelow : config.rateAbove;
  return Math.round(p * rate);
}

/** السعر النهائي المعروض للعميل = سعر المورد + عمولة المنصة */
function computeFinalPrice(basePriceDzd) {
  const base = Number(basePriceDzd);
  if (isNaN(base) || base < 0) return base;
  return base + computeCommission(base);
}

/** استنتاج العمولة من السعر النهائي (الذي يدفعه العميل) */
function computeCommissionFromFinal(finalPriceDzd) {
  const finalP = Number(finalPriceDzd);
  if (isNaN(finalP) || finalP <= 0) return 0;
  const baseIf10 = finalP / (1 + config.rateBelow);
  const baseIf05 = finalP / (1 + config.rateAbove);
  if (baseIf10 < config.threshold) return Math.round(finalP - baseIf10);
  return Math.round(finalP - baseIf05);
}

try { refreshConfig(); } catch (e) {}

module.exports = {
  refreshConfig,
  getConfig,
  parsePriceFromValue,
  computeCommission,
  computeFinalPrice,
  computeCommissionFromFinal
};
