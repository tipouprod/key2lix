/**
 * تحقق مركزي لرسالة اتصل بنا: اسم، بريد، موضوع، رسالة.
 */
const { body } = require('express-validator');

const contactValidators = [
  body('name').trim().notEmpty().withMessage('الاسم مطلوب').isLength({ max: 200 }).withMessage('الاسم طويل جداً'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('البريد غير صالح').normalizeEmail(),
  body('subject').optional({ values: 'falsy' }).trim().isLength({ max: 200 }).withMessage('الموضوع طويل جداً'),
  body('message').trim().notEmpty().withMessage('الرسالة مطلوبة').isLength({ max: 5000 }).withMessage('الرسالة طويلة جداً')
];

module.exports = { contactValidators };
