/**
 * Key2lix AI Service — تشات بوت، توليد نصوص، تحليل صور، توصيات ذكية
 * يتطلب OPENAI_API_KEY في .env
 */
const apiKey = process.env.OPENAI_API_KEY || '';
const model = process.env.AI_MODEL || 'gpt-4o-mini';

function isConfigured() {
  return !!apiKey && apiKey.length > 10;
}

async function chat(messages, context = {}) {
  if (!isConfigured()) return { ok: false, error: 'AI_NOT_CONFIGURED' };
  try {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });
    const systemContent = [
      'أنت مساعد Key2lix — منصة رقمية لشراء بطاقات الألعاب والبرامج في الجزائر.',
      'أجب بالعربية أو الإنجليزية حسب لغة المستخدم.',
      'ساعد في: اختيار المنتجات، الأسئلة عن الطلبات، الدفع، التوصيل، الدعم.',
      'لا تختلق معلومات. إذا لم تعرف، قل أن تتصل بالدعم.',
      context.productsSummary ? `قائمة مختصرة من المنتجات: ${context.productsSummary}` : ''
    ].filter(Boolean).join(' ');
    const msgs = [
      { role: 'system', content: systemContent },
      ...(Array.isArray(messages) ? messages : [])
    ];
    const resp = await client.chat.completions.create({
      model,
      messages: msgs,
      max_tokens: 500,
      temperature: 0.7
    });
    const text = resp.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message || 'AI_ERROR' };
  }
}

async function generateText(prompt, options = {}) {
  if (!isConfigured()) return { ok: false, error: 'AI_NOT_CONFIGURED' };
  try {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });
    const resp = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 800,
      temperature: options.temperature ?? 0.8
    });
    const text = resp.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message || 'AI_ERROR' };
  }
}

async function generateProductDescription(name, category, bulletPoints = []) {
  const pts = Array.isArray(bulletPoints) && bulletPoints.length
    ? bulletPoints.map(p => `- ${p}`).join('\n')
    : '';
  const prompt = `اكتب وصفاً تسويقياً مختصراً وجذاباً لمنتج إلكتروني بالعربية:
الاسم: ${name}
الفئة: ${category}
${pts ? `نقاط رئيسية:\n${pts}` : ''}
الوصف يجب أن يكون 2-4 جمل، واضح، يشجع على الشراء. لا تكتب عن سعر أو توفر.`;
  return generateText(prompt);
}

async function generatePromotionalText(type, context = {}) {
  const types = {
    banner: `اكتب نص بنر ترويجي قصير (سطر واحد أو سطرين) لموقع Key2lix. السياق: ${context.message || 'عرض خاص'}. اكتب بالعربية.`,
    email: `اكتب نص إيميل تسويقي قصير (3-5 جمل) للعميل. الموضوع: ${context.subject || 'عرض خاص'}. بالعربية.`,
    social: `اكتب منشور سوشيال ميديا قصير (2-3 جمل) لموقع Key2lix. الموضوع: ${context.topic || 'عرض'}. بالعربية.`
  };
  const prompt = types[type] || types.banner;
  return generateText(prompt);
}

async function analyzeImage(imageBase64OrUrl, options = {}) {
  if (!isConfigured()) return { ok: false, error: 'AI_NOT_CONFIGURED' };
  try {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });
    const imageContent = imageBase64OrUrl.startsWith('data:')
      ? { type: 'image_url', image_url: { url: imageBase64OrUrl } }
      : { type: 'image_url', image_url: { url: imageBase64OrUrl } };
    const prompt = options.prompt || `حلل هذه الصورة كصورة منتج إلكتروني. أعطِ:
1. وصف مختصر للمحتوى
2. هل الصورة مناسبة لمنتج (نعم/لا)
3. اقتراحات لتحسين الصورة إن وجدت
أجب بالعربية بجمل قصيرة.`;
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: [{ type: 'text', text: prompt }, imageContent] }
      ],
      max_tokens: 400
    });
    const text = resp.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message || 'AI_ERROR' };
  }
}

module.exports = {
  isConfigured,
  chat,
  generateText,
  generateProductDescription,
  generatePromotionalText,
  analyzeImage
};
