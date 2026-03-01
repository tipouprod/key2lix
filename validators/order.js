/**
 * تحقق مركزي لطلب الطلبات: اسم، هاتف، بريد، عنوان، منتج، كوبون، إلخ.
 */
const { body } = require('express-validator');

const orderValidators = [
  body('name').trim().notEmpty().withMessage('الاسم مطلوب').isLength({ max: 200 }).withMessage('الاسم طويل جداً'),
  body('phone').trim().notEmpty().withMessage('رقم الهاتف مطلوب').isLength({ max: 50 }).withMessage('رقم الهاتف طويل جداً'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('البريد غير صالح').normalizeEmail(),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('العنوان طويل جداً'),
  body('product').optional().trim(),
  body('value').optional().trim(),
  body('orderId').optional().trim(),
  body('product_key').optional().trim(),
  body('category').optional().trim(),
  body('subcat').optional().trim(),
  body('coupon_code').optional({ values: 'falsy' }).trim()
];

module.exports = { orderValidators };
