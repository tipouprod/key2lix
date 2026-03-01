/**
 * Stripe payment gateway — Key2lix
 * Requires STRIPE_SECRET_KEY in .env. Disabled when not set.
 */
const Stripe = require('stripe');

let stripe = null;
let publishableKey = '';

function init() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const pub = process.env.STRIPE_PUBLISHABLE_KEY || '';
  if (!secret || !secret.startsWith('sk_')) return;
  stripe = new Stripe(secret);
  publishableKey = pub;
}

function isConfigured() {
  return !!stripe;
}

function getPublishableKey() {
  return publishableKey;
}

/**
 * Create Checkout Session for an order.
 * @param {object} opts - { orderId, amountDzd, productName, successUrl, cancelUrl }
 * @returns {Promise<{ url: string }>}
 */
async function createCheckoutSession(opts) {
  if (!stripe) throw new Error('Stripe is not configured');
  const { orderId, amountDzd, productName, successUrl, cancelUrl } = opts;
  const amount = Math.round(Number(amountDzd) || 0);
  if (amount < 100) throw new Error('Amount must be at least 100 DZD');
  // Stripe DZD: zero decimal, amount in main unit
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'dzd',
        product_data: { name: productName || `Order ${orderId}` },
        unit_amount: amount
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { orderId }
  });
  return { url: session.url, sessionId: session.id };
}

/**
 * Construct Stripe webhook event and verify signature.
 * @param {string} payload - Raw body
 * @param {string} sig - Stripe-Signature header
 * @returns {object} Event object
 */
function constructWebhookEvent(payload, sig) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is required for webhooks');
  return Stripe.webhooks.constructEvent(payload, sig, secret);
}

init();

module.exports = {
  isConfigured,
  getPublishableKey,
  createCheckoutSession,
  constructWebhookEvent
};
