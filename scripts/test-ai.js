require('dotenv').config();
const key = process.env.OPENAI_API_KEY;
console.log('OPENAI_API_KEY set:', !!key && key.length > 10 ? 'Yes' : 'No');

const ai = require('../lib/ai');
console.log('AI configured:', ai.isConfigured());

if (ai.isConfigured()) {
  ai.chat([{ role: 'user', content: 'Say hello in one word' }])
    .then((r) => {
      console.log('Chat test:', r.ok ? 'OK' : 'FAIL');
      if (r.ok) console.log('Response:', (r.text || '').slice(0, 100));
      else console.log('Error:', r.error);
    })
    .catch((e) => console.log('Chat error:', e.message));
} else {
  console.log('AI not configured - check OPENAI_API_KEY in .env');
}
