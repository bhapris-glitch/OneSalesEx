import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';

const required = ['MONGODB_URI', 'MONGODB_DB', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_STARTER_PRICE_ID', 'STRIPE_GROWTH_PRICE_ID', 'STRIPE_PREMIUM_PRICE_ID', 'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_REDIRECT_URI'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) console.warn(`Missing production environment variables: ${missing.join(', ')}`);

const app = express();
const port = Number(process.env.PORT || 8080);
const plans = {
  starter: { name: 'Starter', price: 25, chatLimit: 500, stripePriceId: process.env.STRIPE_STARTER_PRICE_ID, model: 'gpt-4o-mini' },
  growth: { name: 'Growth', price: 59, chatLimit: 1200, stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID, model: 'gpt-4o-mini' },
  premium: { name: 'Premium', price: 149, chatLimit: 2300, stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID, model: process.env.OPENAI_PREMIUM_MODEL || 'gpt-5' }
};
const isRealConfigValue = (value, prefix) => Boolean(value && value.startsWith(prefix) && !value.includes('replace_me'));
const stripe = isRealConfigValue(process.env.STRIPE_SECRET_KEY, 'sk_') ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const chatLimits = { starter: 500, growth: 1200, premium: 2300, enterprise: Number.MAX_SAFE_INTEGER };
const trialPlan = 'premium';
const defaultTrialSettings = { days: 5, chatLimit: 50 };
const shopifyApiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
const adminKey = String(process.env.ADMIN_API_KEY || '');
const getTrialSettings = async () => { if (!db) return defaultTrialSettings; const saved = await db.collection('platform_settings').findOne({ _id: 'trial' }); return { days: Number(saved?.days) || defaultTrialSettings.days, chatLimit: Number(saved?.chatLimit) || defaultTrialSettings.chatLimit }; };
const requireAdmin = (req, res, next) => {
  const supplied = String(req.headers['x-admin-key'] || '');
  if (!adminKey || !supplied || supplied !== adminKey) return json(res, 401, { error: 'Super Admin authentication is required.' });
  next();
};
const isTrialActive = (merchant) => merchant?.trialStatus === 'active' && merchant.trialEndsAt && new Date(merchant.trialEndsAt) > new Date();
const getMerchantChatLimit = (merchant) => Number.isInteger(merchant?.chatLimitOverride) ? merchant.chatLimitOverride : (isTrialActive(merchant) ? (Number(merchant.trialChatLimit) || defaultTrialSettings.chatLimit) : (chatLimits[merchant?.plan] || chatLimits.starter));
const isPaid = (merchant) => ['active', 'trialing'].includes(merchant?.subscriptionStatus) && merchant?.stripeSubscriptionId && (!merchant.currentPeriodEnd || new Date(merchant.currentPeriodEnd) > new Date());
const defaultSettings = { agentName: 'Emily', agentPic: '', storeName: 'zavoka', themeColor: '#FF4616', primaryColor: '#FF4616', chatBackground: '#0D1009', accentColor: '#39D353', behavior: 'Friendly, helpful, concise, and focused on improving sales.', welcomeMessage: 'Hi! I’m Emily. How can I help you shop today?' };
const mongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
let db;

const json = (res, status, data) => res.status(status).json(data);
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
const normalizeShop = (value) => {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    const hostname = url.hostname.replace(/\.$/, '');
    if (!hostname || hostname === 'localhost' || !hostname.includes('.') || hostname.length > 253) return null;
    if (hostname.split('.').some((part) => !part || part.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part))) return null;
    return hostname;
  } catch {
    return null;
  }
};
const requireDb = (req, res, next) => db ? next() : json(res, 503, { error: 'Database is not connected.' });
const requireMerchantSession = async (req, res, next) => {
  const merchantId = String(req.query.merchantId || req.body?.merchantId || '');
  const session = String(req.headers['x-merchant-session'] || req.query.session || '');
  if (!ObjectId.isValid(merchantId) || !session) return json(res, 401, { error: 'Please log in with your Shopify store URL and merchant email.' });
  const record = await db.collection('merchant_sessions').findOne({ session, merchantId: new ObjectId(merchantId), expiresAt: { $gt: new Date() } });
  if (!record) return json(res, 401, { error: 'Your merchant session has expired. Please log in again.' });
  req.merchantId = record.merchantId;
  next();
};

// Automatic email notifications use Resend and are sent from notification@zavoka.com.
const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.RESEND_API_KEY || !validEmail(to)) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FROM_EMAIL || 'zavoka AI <notification@zavoka.com>', to: [to], subject, html })
    });
    if (!response.ok) console.error('Email notification failed:', response.status, await response.text());
    return response.ok;
  } catch (error) { console.error('Email notification failed:', error.message); return false; }
};
const formatDate = value => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone: process.env.NOTIFICATION_TIME_ZONE || 'UTC' }).format(new Date(value)) : 'Not available';
const emailLayout = (title, content) => `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#20251c"><h2 style="color:#ff4616">${title}</h2>${content}<hr><p style="color:#697064;font-size:13px">zavoka AI · Shopify AI Sales Executive<br>Need help? Reply to this email or contact support.</p></div>`;
const notifyMerchant = (merchant, subject, html) => merchant?.email ? sendEmail({ to: merchant.email, subject, html: emailLayout(subject, html) }) : Promise.resolve(false);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const shopifyHmacValid = (body, supplied) => {
  if (!process.env.SHOPIFY_API_SECRET || !supplied) return false;
  const digest = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(body).digest('base64');
  return digest.length === String(supplied).length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(supplied)));
};
const syncShopProducts = async (merchant) => {
  if (!merchant?.shopifyAccessToken || !merchant.shop) return 0;
  const response = await fetch(`https://${merchant.shop}/admin/api/${shopifyApiVersion}/products.json?limit=250&status=active`, { headers: { 'X-Shopify-Access-Token': merchant.shopifyAccessToken } });
  if (!response.ok) throw new Error(`Shopify product sync failed (${response.status}).`);
  const data = await response.json();
  const products = Array.isArray(data.products) ? data.products : [];
  await db.collection('shop_products').updateMany({ shop: merchant.shop }, { $set: { status: 'archived' } });
  for (const product of products) {
    await db.collection('shop_products').updateOne({ shop: merchant.shop, productId: String(product.id) }, { $set: { shop: merchant.shop, productId: String(product.id), title: product.title, handle: product.handle, status: product.status, productUrl: `https://${merchant.shop}/products/${product.handle}`, image: product.image?.src || '', variants: (product.variants || []).map((variant) => ({ id: String(variant.id), title: variant.title, price: String(variant.price), available: variant.available !== false && (!variant.inventory_management || Number(variant.inventory_quantity) > 0 || variant.inventory_policy === 'continue') })).filter((variant) => variant.available), syncedAt: new Date() } }, { upsert: true });
  }
  return products.length;
};
const processAbandonedCartJobs = async () => {
  if (!db) return;
  const staleBefore = new Date(Date.now() - 15 * 60000);
  await db.collection('abandoned_carts').updateMany({ status: 'processing', processingAt: { $lt: staleBefore } }, { $set: { status: 'pending', dueAt: new Date() }, $unset: { processingAt: '' } });
  const due = await db.collection('abandoned_carts').find({ status: 'pending', emailConsented: true, dueAt: { $lte: new Date() } }).limit(50).toArray();
  for (const cart of due) {
    const claimed = await db.collection('abandoned_carts').updateOne({ _id: cart._id, status: 'pending', dueAt: { $lte: new Date() } }, { $set: { status: 'processing', processingAt: new Date() } });
    if (!claimed.modifiedCount) continue;
    const merchant = await db.collection('merchants').findOne({ _id: cart.merchantId });
    if (!merchant?.shopifyConnected || merchant.automation?.abandonedCartEnabled !== true || cart.emailConsented !== true) {
      await db.collection('abandoned_carts').updateOne({ _id: cart._id, status: 'processing' }, { $set: { status: 'not_eligible', updatedAt: new Date() }, $unset: { processingAt: '' } });
      continue;
    }
    const emailHash = crypto.createHash('sha256').update(cart.email).digest('hex');
    const suppressed = await db.collection('email_suppressions').findOne({ merchantId: cart.merchantId, emailHash });
    if (suppressed) {
      await db.collection('abandoned_carts').updateOne({ _id: cart._id }, { $set: { status: 'not_eligible', emailOptOut: true }, $unset: { processingAt: '' } });
      continue;
    }
    const items = (cart.items || []).map((item) => `<li>${escapeHtml(item.title || item.name || 'Shopify item')} × ${Number(item.quantity) || 1}</li>`).join('');
    const recoveryUrl = cart.recoveryUrl || `https://${cart.shop}/cart`;
    const unsubscribeUrl = `${String(process.env.FRONTEND_URL || 'https://zavoka.com').replace(/\/$/, '')}/api/storefront/email/unsubscribe?token=${encodeURIComponent(cart.unsubscribeToken || '')}`;
    const sent = await sendEmail({ to: cart.email, subject: 'Your cart is ready when you are', html: emailLayout('Still thinking it over?', `<p>Your Shopify cart is still available. Continue securely through the store checkout whenever you are ready.</p><ul>${items}</ul><p><a href="${escapeHtml(recoveryUrl)}" style="display:inline-block;padding:12px 18px;background:#a9ee47;color:#111;text-decoration:none;border-radius:8px;font-weight:bold">Return to your cart</a></p><p style="font-size:12px;color:#697064">You are receiving this because you opted in to marketing emails from this store.</p><p style="font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from future cart emails</a></p>`) });
    if (sent) await db.collection('abandoned_carts').updateOne({ _id: cart._id }, { $set: { status: 'sent', sentAt: new Date() }, $unset: { processingAt: '' } });
    else {
      const attempts = (cart.attempts || 0) + 1;
      await db.collection('abandoned_carts').updateOne({ _id: cart._id }, { $set: { status: attempts >= 5 ? 'failed' : 'pending', attempts, dueAt: new Date(Date.now() + 60 * 60000), lastErrorAt: new Date() }, $unset: { processingAt: '' } });
    }
  }
};
const trialEmail = (merchant, title, message) => {
  const end = merchant.trialEndsAt ? formatDate(merchant.trialEndsAt) : 'Calculated after Shopify approval';
  return notifyMerchant(merchant, `zavoka AI — ${title}`, `<p>${message}</p><table cellpadding="8"><tr><td><b>Store URL</b></td><td>${merchant.shop}</td></tr><tr><td><b>Plan</b></td><td>Free Premium trial</td></tr><tr><td><b>Start date/time</b></td><td>${formatDate(merchant.trialStartedAt)}</td></tr><tr><td><b>End date/time</b></td><td>${end}</td></tr><tr><td><b>Trial allowance</b></td><td>${merchant.trialChatLimit || defaultTrialSettings.chatLimit} AI chats</td></tr></table>`);
};
const processTrialNotifications = async () => {
  if (!db) return;
  const now = new Date();
  const trials = await db.collection('merchants').find({ trialStatus: 'active', trialEndsAt: { $exists: true } }).toArray();
  for (const merchant of trials) {
    const remaining = new Date(merchant.trialEndsAt).getTime() - now.getTime();
    const hours = remaining / 3600000;
    let field = '', subject = '', message = '';
    if (remaining <= 0) {
      field = 'trialEndEmailSent'; subject = 'Your Premium trial has ended'; message = 'Your 5-day Premium trial has ended and your chatbot is locked. Choose a paid plan to unlock it immediately. No trial charge was made.';
    } else if (hours <= 24) {
      field = 'trial24EmailSent'; subject = 'Your Premium trial ends in 24 hours'; message = 'Your 5-day Premium trial ends in 24 hours or less. You still have full Premium features until it ends, with no charge during the trial.';
    } else if (hours <= 48) {
      field = 'trial48EmailSent'; subject = 'Your Premium trial ends in 48 hours'; message = 'Your 5-day Premium trial ends in 48 hours or less. Choose a paid plan to keep your chatbot active after the trial.';
    }
    if (!field || merchant[field]) continue;
    const claimed = await db.collection('merchants').updateOne({ _id: merchant._id, [field]: { $ne: true } }, { $set: { [field]: true, updatedAt: now } });
    if (claimed.modifiedCount) {
      if (remaining <= 0) await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: { trialStatus: 'ended' } });
      await trialEmail(merchant, subject, message);
    }
  }
};

// Stripe needs the untouched request body for signature verification.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !db) return res.status(503).send('Stripe webhook is not configured or the database is unavailable.');
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Missing Stripe webhook signature.');
    const event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    const existing = await db.collection('stripe_events').findOne({ id: event.id });
    if (existing) return res.sendStatus(200);
    const object = event.data.object;
    if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const merchantId = object.metadata?.merchantId || object.client_reference_id || object.subscription_details?.metadata?.merchantId;
      if (merchantId && ObjectId.isValid(merchantId)) {
        const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(merchantId) });
        if (event.type === 'invoice.payment_failed') {
          await notifyMerchant(merchant, 'Payment failed', `<p>Your latest subscription payment could not be completed.</p><table cellpadding="8"><tr><td><b>Store URL</b></td><td>${merchant?.shop || 'Not available'}</td></tr><tr><td><b>Plan</b></td><td>${plans[merchant?.plan]?.name || 'Paid plan'}</td></tr><tr><td><b>Attempt time</b></td><td>${formatDate(new Date())}</td></tr></table><p>Please update your payment method in Stripe to keep your AI Sales Executive active.</p>`);
          await db.collection('merchants').updateOne({ _id: new ObjectId(merchantId) }, { $set: { lastPaymentStatus: 'failed', updatedAt: new Date() } });
        } else if (event.type === 'invoice.paid') {
          await notifyMerchant(merchant, 'Payment successful', `<p>Your zavoka AI subscription payment was completed successfully.</p><table cellpadding="8"><tr><td><b>Store URL</b></td><td>${merchant?.shop || 'Not available'}</td></tr><tr><td><b>Plan</b></td><td>${plans[merchant?.plan]?.name || 'Paid plan'}</td></tr><tr><td><b>Payment time</b></td><td>${formatDate(new Date())}</td></tr><tr><td><b>Amount</b></td><td>${object.amount_paid != null ? `$${(object.amount_paid / 100).toFixed(2)} ${String(object.currency || 'usd').toUpperCase()}` : 'See Stripe invoice'}</td></tr><tr><td><b>Invoice ID</b></td><td>${object.id || 'Not available'}</td></tr><tr><td><b>Next billing date</b></td><td>${formatDate(object.period_end ? new Date(object.period_end * 1000) : merchant?.currentPeriodEnd)}</td></tr></table>`);
          await db.collection('merchants').updateOne({ _id: new ObjectId(merchantId) }, { $set: { lastPaymentStatus: 'paid', updatedAt: new Date() } });
        } else {
          const update = {
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.subscription || object.id,
            subscriptionStatus: event.type === 'customer.subscription.deleted' ? 'canceled' : (event.type === 'checkout.session.completed' ? 'active' : (object.status || 'active')),
            autopay: object.cancel_at_period_end !== true,
            cancelAtPeriodEnd: object.cancel_at_period_end === true,
            ...(object.current_period_end ? { currentPeriodEnd: new Date(object.current_period_end * 1000) } : {}),
            ...(object.metadata?.plan ? { plan: object.metadata.plan } : {}),
            updatedAt: new Date()
          };
          if (event.type === 'checkout.session.completed') {
            update.paidAt = new Date();
            if (object.invoice) update.stripeInvoiceId = object.invoice;
          }
          await db.collection('merchants').updateOne({ _id: new ObjectId(merchantId) }, { $set: update });
          if (event.type === 'checkout.session.completed') await notifyMerchant({ ...merchant, ...update }, 'Subscription active', `Your ${plans[update.plan]?.name || 'zavoka AI'} subscription is active. Your chatbot is unlocked immediately.`);
          if (event.type === 'customer.subscription.deleted') await notifyMerchant(merchant, 'Subscription canceled', 'Your subscription was canceled and your chatbot may be locked. You can reactivate a paid plan at any time.');
        }
      }
    }
    await db.collection('stripe_events').insertOne({ id: event.id, type: event.type, createdAt: new Date() });
    res.sendStatus(200);
  } catch (error) { res.status(400).send(`Webhook Error: ${error.message}`); }
});

const handleShopifyCommerceWebhook = (topic) => async (req, res) => {
  if (!db) return res.sendStatus(503);
  if (!shopifyHmacValid(req.body, req.headers['x-shopify-hmac-sha256'])) return res.sendStatus(401);
  try {
    const shop = normalizeShop(req.headers['x-shopify-shop-domain']);
    if (!shop) return res.sendStatus(400);
    const deliveryId = String(req.headers['x-shopify-webhook-id'] || '');
    if (deliveryId && await db.collection('shopify_webhook_events').findOne({ deliveryId })) return res.sendStatus(200);
    const payload = JSON.parse(req.body.toString('utf8'));
    const merchant = await db.collection('merchants').findOne({ shop });
    if (!merchant) return res.sendStatus(200);
    const now = new Date();
    if (topic.startsWith('orders/')) {
      const orderId = String(payload.id || '');
      if (orderId) {
        const order = { shop, merchantId: merchant._id, orderId, orderNumber: String(payload.name || payload.order_number || orderId), financialStatus: payload.financial_status || 'unknown', fulfillmentStatus: payload.fulfillment_status || 'unfulfilled', total: Number(payload.total_price || 0), currency: payload.currency || 'USD', orderStatusUrl: payload.order_status_url || '', tracking: (payload.fulfillments || []).flatMap((fulfillment) => (fulfillment.tracking_numbers || []).map((number, index) => ({ number, url: fulfillment.tracking_urls?.[index] || fulfillment.tracking_url || '' }))), createdAt: payload.created_at ? new Date(payload.created_at) : now, updatedAt: now };
        await db.collection('shopify_orders').updateOne({ shop, orderId }, { $set: order, $setOnInsert: { firstSeenAt: now } }, { upsert: true });
        await db.collection('activity_events').insertOne({ merchantId: merchant._id, type: 'order', orderId, total: order.total, createdAt: now });
        const checkoutId = String(payload.checkout_id || '');
        if (checkoutId) await db.collection('abandoned_carts').updateMany({ shop, checkoutId, status: { $in: ['pending', 'processing', 'sent'] } }, { $set: { status: 'recovered', recoveredAt: now, orderId } });
      }
    } else if (topic.startsWith('fulfillments/')) {
      const orderId = String(payload.order_id || '');
      if (orderId) {
        const tracking = (payload.tracking_numbers || []).map((number, index) => ({ number, url: payload.tracking_urls?.[index] || payload.tracking_url || '' }));
        await db.collection('shopify_orders').updateOne({ shop, orderId }, { $set: { fulfillmentStatus: payload.status || 'fulfilled', ...(tracking.length ? { tracking } : {}), updatedAt: now } });
      }
    } else if (topic.startsWith('products/')) {
      await syncShopProducts(merchant);
    } else {
      const checkoutId = String(payload.id || '');
      const email = String(payload.email || payload.customer?.email || '').trim().toLowerCase();
      if (checkoutId) {
        await db.collection('shopify_checkouts').updateOne({ shop, checkoutId }, { $set: { shop, merchantId: merchant._id, checkoutId, total: Number(payload.total_price || 0), currency: payload.currency || 'USD', updatedAt: now }, $setOnInsert: { createdAt: payload.created_at ? new Date(payload.created_at) : now } }, { upsert: true });
        const previous = await db.collection('abandoned_carts').findOne({ shop, checkoutId });
        const consent = payload.email_marketing_consent?.state === 'subscribed' || payload.buyer_accepts_marketing === true;
        const emailHash = consent && validEmail(email) ? crypto.createHash('sha256').update(email).digest('hex') : '';
        const suppressed = emailHash ? await db.collection('email_suppressions').findOne({ merchantId: merchant._id, emailHash }) : null;
        const enabled = merchant.automation?.abandonedCartEnabled === true;
        const status = previous?.status === 'sent' || previous?.status === 'recovered' ? previous.status : (enabled && consent && validEmail(email) && !suppressed ? 'pending' : 'not_eligible');
        const delayMinutes = Math.min(1440, Math.max(15, Number(merchant.automation?.abandonedCartDelayMinutes) || 60));
        const checkoutItems = (payload.line_items || []).map((item) => ({ title: String(item.title || item.name || 'Shopify item').slice(0, 200), quantity: Number(item.quantity) || 1 }));
        await db.collection('abandoned_carts').updateOne({ shop, checkoutId }, { $set: { shop, merchantId: merchant._id, checkoutId, checkoutToken: String(payload.token || ''), email: consent && validEmail(email) ? email : '', emailHash, emailConsented: consent, emailOptOut: previous?.emailOptOut === true || Boolean(suppressed), unsubscribeToken: previous?.unsubscribeToken || crypto.randomBytes(24).toString('hex'), items: checkoutItems, total: Number(payload.total_price || 0), currency: payload.currency || 'USD', recoveryUrl: payload.abandoned_checkout_url || '', status, updatedAt: now, ...(previous?.dueAt ? {} : { dueAt: new Date(now.getTime() + delayMinutes * 60000) }) }, $setOnInsert: { createdAt: now, attempts: 0 } }, { upsert: true });
      }
    }
    if (deliveryId) await db.collection('shopify_webhook_events').insertOne({ deliveryId, shop, topic, receivedAt: now });
    res.sendStatus(200);
  } catch (error) { console.error(`Shopify ${topic} webhook failed:`, error.message); res.sendStatus(500); }
};
app.post('/api/shopify/webhooks/orders-create', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('orders/create'));
app.post('/api/shopify/webhooks/orders-update', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('orders/updated'));
app.post('/api/shopify/webhooks/checkouts-create', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('checkouts/create'));
app.post('/api/shopify/webhooks/checkouts-update', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('checkouts/update'));
app.post('/api/shopify/webhooks/products-create', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('products/create'));
app.post('/api/shopify/webhooks/products-update', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('products/update'));
app.post('/api/shopify/webhooks/products-delete', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('products/delete'));
app.post('/api/shopify/webhooks/fulfillments-create', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('fulfillments/create'));
app.post('/api/shopify/webhooks/fulfillments-update', express.raw({ type: 'application/json' }), handleShopifyCommerceWebhook('fulfillments/update'));

app.post('/api/shopify/webhooks/app-uninstalled', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!db || !process.env.SHOPIFY_API_SECRET) return res.sendStatus(503);
  const digest = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(req.body).digest('base64');
  const supplied = String(req.headers['x-shopify-hmac-sha256'] || '');
  if (!supplied || digest.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(supplied))) return res.sendStatus(401);
  const shop = normalizeShop(req.headers['x-shopify-shop-domain']);
  if (shop) {
    const now = new Date();
    await db.collection('merchants').updateOne({ shop }, { $set: { shopifyConnected: false, uninstalledAt: now, updatedAt: now, 'automation.abandonedCartEnabled': false }, $unset: { shopifyAccessToken: '', shopifyScopes: '' } });
  }
  res.sendStatus(200);
});

app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', req.path.startsWith('/api/storefront/') ? '*' : (process.env.FRONTEND_URL || '*')); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Merchant-Session, X-Admin-Key'); res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS'); req.method === 'OPTIONS' ? res.sendStatus(204) : next(); });

app.get('/api/health', (req, res) => json(res, 200, { ok: Boolean(db), service: 'zavoka-api' }));
app.get('/api/plans', (req, res) => json(res, 200, { plans }));
app.get('/api/storefront/email/unsubscribe', requireDb, async (req, res) => {
  const token = String(req.query.token || '');
  if (!/^[a-f0-9]{48}$/i.test(token)) return res.status(400).send('Invalid unsubscribe link.');
  const cart = await db.collection('abandoned_carts').findOne({ unsubscribeToken: token });
  if (!cart?.emailHash) return res.status(404).send('This unsubscribe link is no longer available.');
  await db.collection('email_suppressions').updateOne({ merchantId: cart.merchantId, emailHash: cart.emailHash }, { $set: { merchantId: cart.merchantId, emailHash: cart.emailHash, createdAt: new Date(), source: 'cart_email_unsubscribe' } }, { upsert: true });
  await db.collection('abandoned_carts').updateMany({ merchantId: cart.merchantId, emailHash: cart.emailHash, status: { $in: ['pending', 'processing'] } }, { $set: { status: 'not_eligible', emailOptOut: true, updatedAt: new Date() }, $unset: { processingAt: '' } });
  res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribed</title><body style="font-family:Arial,sans-serif;max-width:600px;margin:60px auto;padding:20px"><h1>You are unsubscribed</h1><p>You will not receive more zavoka cart recovery emails for this store.</p></body></html>');
});
app.post('/api/install', requireDb, async (req, res) => {
  const shop = normalizeShop(req.body.shop);
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!shop) return json(res, 400, { error: 'Enter a valid Shopify store domain, such as your-store.myshopify.com or yourstore.com.' });
  if (email && !validEmail(email)) return json(res, 400, { error: 'Enter a valid working email address.' });
  const now = new Date();
  const trial = await getTrialSettings();
  const merchantUpdate = { $set: { shop, updatedAt: now }, $setOnInsert: { createdAt: now, trialStatus: 'pending', trialPlan } };
  if (email) merchantUpdate.$set.email = email;
  const result = await db.collection('merchants').findOneAndUpdate({ shop }, merchantUpdate, { upsert: true, returnDocument: 'after' });
  const state = crypto.randomBytes(24).toString('hex'); await db.collection('oauth_states').insertOne({ state, shop, merchantId: result._id, createdAt: now, expiresAt: new Date(now.getTime() + 10 * 60000) });
  const session = crypto.randomBytes(32).toString('hex');
  await db.collection('merchant_sessions').insertOne({ session, merchantId: result._id, createdAt: now, expiresAt: new Date(now.getTime() + 7 * 86400000) });
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(process.env.SHOPIFY_API_KEY)}&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES || 'read_products,read_orders,read_checkouts,read_script_tags,write_script_tags')}&redirect_uri=${encodeURIComponent(process.env.SHOPIFY_REDIRECT_URI || 'https://zavoka.com/api/shopify/callback')}&state=${state}`;
  const merchant = result.value || result;
  json(res, 201, { success: true, merchantId: merchant._id.toString(), session, trialPlan, message: 'Your trial is reserved. It starts when Shopify approves the installation.', installUrl });
});

app.post('/api/merchant/login', requireDb, async (req, res) => {
  const shop = normalizeShop(req.body.shop);
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!shop || !validEmail(email)) return json(res, 400, { error: 'Enter the Shopify store URL and email used during installation.' });
  const merchant = await db.collection('merchants').findOne({ shop, email });
  if (!merchant) return json(res, 401, { error: 'That Shopify store URL and email do not match a merchant account.' });
  const session = crypto.randomBytes(32).toString('hex');
  await db.collection('merchant_sessions').insertOne({ session, merchantId: merchant._id, createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000) });
  json(res, 200, { success: true, merchantId: merchant._id.toString(), session });
});

app.post('/api/merchant/uninstall', requireDb, requireMerchantSession, async (req, res) => {
  const merchant = await db.collection('merchants').findOne({ _id: req.merchantId });
  if (!merchant) return json(res, 404, { error: 'Merchant account not found.' });
  const now = new Date();
  // Shopify does not allow an app to uninstall itself. This disconnects zavoka,
  // removes stored credentials, and records the request; the merchant can then
  // confirm removal from Shopify Admin > Settings > Apps and sales channels.
  await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: { shopifyConnected: false, uninstalledAt: now, uninstallRequestedAt: now, updatedAt: now, 'automation.abandonedCartEnabled': false }, $unset: { shopifyAccessToken: '', shopifyScopes: '' } });
  await db.collection('activity_events').insertOne({ merchantId: merchant._id, type: 'uninstall_requested', createdAt: now });
  if (merchant.stripeSubscriptionId && stripe) {
    try {
      await stripe.subscriptions.update(merchant.stripeSubscriptionId, { cancel_at_period_end: true });
      await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: { autopay: false, cancelAtPeriodEnd: true, uninstallSubscriptionCanceledAt: now, updatedAt: now } });
    } catch (error) { console.error('Unable to schedule subscription cancellation during uninstall:', error.message); }
  }
  json(res, 200, { success: true, shop: merchant.shop, message: 'zavoka has been disconnected. Confirm app removal in Shopify Admin > Settings > Apps and sales channels.' });
});

app.get('/api/merchant/settings', requireDb, requireMerchantSession, async (req, res) => {
  const id = String(req.query.merchantId || '');
  if (!ObjectId.isValid(id)) return json(res, 400, { error: 'A valid merchantId is required.' });
  const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(id) });
  if (!merchant) return json(res, 404, { error: 'Merchant not found.' });
  const trial = isTrialActive(merchant);
  const paid = isPaid(merchant);
  const effectivePlan = trial ? (merchant.trialPlan || trialPlan) : (merchant.plan || 'starter');
  json(res, 200, {
    settings: { ...defaultSettings, ...(merchant.settings || {}) },
    plan: effectivePlan,
    billingPlan: merchant.plan || 'starter',
    trialActive: trial,
    trialEndsAt: merchant.trialEndsAt || null,
    subscriptionStatus: merchant.subscriptionStatus || (trial ? 'trialing' : 'canceled'),
    paid: paid,
    paidAt: merchant.paidAt || null,
    stripeCustomerId: merchant.stripeCustomerId || null,
    shop: merchant.shop || null,
    shopifyConnected: merchant.shopifyConnected === true,
    uninstalledAt: merchant.uninstalledAt || null,
    usage: merchant.chatUsage || 0,
    limit: getMerchantChatLimit(merchant),
    model: trial || (paid && effectivePlan === 'premium') ? plans.premium.model : (plans[effectivePlan]?.model || 'gpt-4o-mini')
  });
});
app.put('/api/merchant/settings', requireDb, requireMerchantSession, async (req, res) => {
  const id = String(req.body.merchantId || '');
  if (!ObjectId.isValid(id)) return json(res, 400, { error: 'A valid merchantId is required.' });
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
  const settings = { ...defaultSettings, agentName: String(req.body.agentName || defaultSettings.agentName).slice(0, 80), agentPic: String(req.body.agentPic || '').slice(0, 500), storeName: String(req.body.storeName || defaultSettings.storeName).slice(0, 120), primaryColor: color(req.body.primaryColor, defaultSettings.primaryColor), chatBackground: color(req.body.chatBackground, defaultSettings.chatBackground), accentColor: color(req.body.accentColor, defaultSettings.accentColor), themeColor: color(req.body.primaryColor || req.body.themeColor, defaultSettings.themeColor), behavior: String(req.body.behavior || defaultSettings.behavior).slice(0, 1000), welcomeMessage: String(req.body.welcomeMessage || defaultSettings.welcomeMessage).slice(0, 500) };
  const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(id) });
  await db.collection('merchants').updateOne({ _id: new ObjectId(id) }, { $set: { settings, updatedAt: new Date() } });
  await notifyMerchant(merchant, 'Executive settings updated', 'Your zavoka AI Sales Executive settings were updated successfully.');
  json(res, 200, { success: true, settings });
});
app.get('/api/shopify/connect', requireDb, requireMerchantSession, async (req, res) => {
  const merchantId = String(req.query.merchantId || '');
  if (!ObjectId.isValid(merchantId)) return json(res, 400, { error: 'A valid merchantId is required.' });
  const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(merchantId) });
  if (!merchant?.shop) return json(res, 400, { error: 'Add your Shopify store URL before connecting.' });
  const now = new Date();
  const state = crypto.randomBytes(24).toString('hex');
  await db.collection('oauth_states').insertOne({ state, shop: merchant.shop, merchantId: merchant._id, createdAt: now, expiresAt: new Date(now.getTime() + 10 * 60000) });
  const installUrl = `https://${merchant.shop}/admin/oauth/authorize?client_id=${encodeURIComponent(process.env.SHOPIFY_API_KEY)}&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES || 'read_products,read_orders,read_checkouts,read_script_tags,write_script_tags')}&redirect_uri=${encodeURIComponent(process.env.SHOPIFY_REDIRECT_URI)}&state=${state}`;
  json(res, 200, { installUrl });
});
app.get('/api/shopify/callback', requireDb, async (req, res) => {
  const { shop, code, state, hmac } = req.query; const record = await db.collection('oauth_states').findOne({ state, shop, expiresAt: { $gt: new Date() } });
  if (!record || !code || !shop || !hmac) return res.status(400).send('Invalid or expired Shopify authorization.');
  const query = { ...req.query }; delete query.signature; delete query.hmac; const message = Object.keys(query).sort().map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`).join('&');
  const digest = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(message).digest('hex');
  if (digest.length !== String(hmac).length || !crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(hmac)))) return res.status(400).send('Invalid Shopify signature.');
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code }) });
  if (!tokenResponse.ok) return res.status(502).send('Shopify token exchange failed.');
  const token = await tokenResponse.json();
  const trial = await getTrialSettings();
  const merchant = await db.collection('merchants').findOne({ _id: record.merchantId });
  const trialFields = merchant?.trialStatus === 'pending' ? { trialStatus: 'active', trialPlan, trialChatLimit: trial.chatLimit, trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + trial.days * 86400000) } : {};
  await db.collection('merchants').updateOne({ _id: record.merchantId }, { $set: { shopifyAccessToken: token.access_token, shopifyScopes: token.scope, shopifyConnected: true, installedAt: new Date(), updatedAt: new Date(), ...trialFields }, $unset: { uninstalledAt: '', uninstallRequestedAt: '' } });
  if (trialFields.trialStatus === 'active') {
    await trialEmail({ ...merchant, ...trialFields }, 'Your Premium trial has started', 'Your free Premium trial is now active. No payment is required during the trial.');
    await db.collection('merchants').updateOne({ _id: record.merchantId }, { $set: { trialStartEmailSent: true } });
  }
  const connectedMerchant = { ...merchant, shop, shopifyAccessToken: token.access_token };
  try {
    const shopResponse = await fetch(`https://${shop}/admin/api/${shopifyApiVersion}/shop.json`, { headers: { 'X-Shopify-Access-Token': token.access_token } });
    if (shopResponse.ok) {
      const shopData = (await shopResponse.json()).shop || {};
      connectedMerchant.storefrontDomains = [...new Set([shop, shopData.myshopify_domain, shopData.primary_domain].map(normalizeShop).filter(Boolean))];
      connectedMerchant.shopCurrency = shopData.currency || 'USD';
      await db.collection('merchants').updateOne({ _id: record.merchantId }, { $set: { storefrontDomains: connectedMerchant.storefrontDomains, shopCurrency: connectedMerchant.shopCurrency } });
    }
  } catch (error) { console.error('Shopify storefront domain lookup failed:', error.message); }
  try { await syncShopProducts(connectedMerchant); } catch (error) { console.error('Initial Shopify product sync failed:', error.message); }
  const apiBase = String(process.env.SHOPIFY_REDIRECT_URI || '').replace(/\/api\/shopify\/callback$/, '');
  const webhookTopics = ['app/uninstalled', 'orders/create', 'orders/updated', 'checkouts/create', 'checkouts/update', 'products/create', 'products/update', 'products/delete', 'fulfillments/create', 'fulfillments/update'];
  for (const topic of webhookTopics) {
    const endpoint = topic === 'app/uninstalled' ? 'app-uninstalled' : topic.replace('/', '-').replace('updated', 'update');
    try {
      const response = await fetch(`https://${shop}/admin/api/${shopifyApiVersion}/webhooks.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token.access_token }, body: JSON.stringify({ webhook: { topic, address: `${apiBase}/api/shopify/webhooks/${endpoint}`, format: 'json' } }) });
      if (!response.ok) console.error(`Shopify ${topic} webhook registration failed:`, response.status, await response.text());
    } catch (error) { console.error(`Shopify ${topic} webhook registration failed:`, error.message); }
  }
  const storefrontScript = `${String(process.env.FRONTEND_URL || 'https://zavoka.com').replace(/\/$/, '')}/js/shopify-storefront.js`;
  try {
    const tagsResponse = await fetch(`https://${shop}/admin/api/${shopifyApiVersion}/script_tags.json?limit=250`, { headers: { 'X-Shopify-Access-Token': token.access_token } });
    const tags = tagsResponse.ok ? (await tagsResponse.json()).script_tags || [] : [];
    if (!tags.some((tag) => tag.src === storefrontScript)) {
      const response = await fetch(`https://${shop}/admin/api/${shopifyApiVersion}/script_tags.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token.access_token }, body: JSON.stringify({ script_tag: { event: 'onload', src: storefrontScript, display_scope: 'online_store' } }) });
      if (!response.ok) console.error('Shopify storefront widget installation failed:', response.status, await response.text());
    }
  } catch (error) { console.error('Shopify storefront widget installation failed:', error.message); }
  await db.collection('oauth_states').deleteOne({ _id: record._id });
  res.redirect(`${process.env.FRONTEND_URL || '/'}/dashboard.html?shopify=connected&merchantId=${record.merchantId}`);
});
app.get('/api/storefront/products', requireDb, async (req, res) => {
  const storefrontDomain = normalizeShop(req.query.shop);
  if (!storefrontDomain) return json(res, 400, { error: 'A valid Shopify store domain is required.' });
  const merchant = await db.collection('merchants').findOne({ $or: [{ shop: storefrontDomain }, { storefrontDomains: storefrontDomain }], shopifyConnected: true });
  if (!merchant) return json(res, 404, { error: 'This Shopify store is not connected.' });
  const products = await db.collection('shop_products').find({ shop: merchant.shop, status: 'active', 'variants.0': { $exists: true } }).sort({ syncedAt: -1 }).limit(100).toArray();
  await db.collection('activity_events').insertOne({ merchantId: merchant._id, type: 'recommendation', itemCount: products.length, createdAt: new Date() });
  json(res, 200, { storefrontDomain, currency: merchant.shopCurrency || 'USD', products: products.map(({ productId, title, productUrl, image, variants }) => ({ productId, title, productUrl, image, variants })) });
});
app.post('/api/storefront/checkout', requireDb, async (req, res) => {
  const storefrontDomain = normalizeShop(req.body.shop);
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 10) : [];
  if (!storefrontDomain || !items.length) return json(res, 400, { error: 'Choose at least one product for checkout.' });
  const merchant = await db.collection('merchants').findOne({ $or: [{ shop: storefrontDomain }, { storefrontDomains: storefrontDomain }], shopifyConnected: true });
  if (!merchant) return json(res, 404, { error: 'This Shopify store is not connected.' });
  const variantIds = items.map((item) => String(item.variantId || ''));
  if (variantIds.some((id) => !/^\d+$/.test(id))) return json(res, 400, { error: 'A valid Shopify product variant is required.' });
  const catalog = await db.collection('shop_products').find({ shop: merchant.shop, 'variants.id': { $in: variantIds }, status: 'active' }).toArray();
  const available = new Map(catalog.flatMap((product) => product.variants.filter((variant) => variantIds.includes(variant.id) && variant.available).map((variant) => [variant.id, variant])));
  const cartLines = [];
  for (const item of items) {
    const variantId = String(item.variantId);
    const variant = available.get(variantId);
    const quantity = Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1)));
    if (!variant) return json(res, 400, { error: 'One of the selected products is unavailable. Refresh the product catalog and try again.' });
    cartLines.push(`${encodeURIComponent(variantId)}:${quantity}`);
  }
  const checkoutUrl = `https://${storefrontDomain}/cart/${cartLines.join(',')}?checkout`;
  await db.collection('activity_events').insertOne({ merchantId: merchant._id, type: 'checkout_started', itemCount: cartLines.length, createdAt: new Date() });
  json(res, 200, { success: true, checkoutUrl });
});
app.post('/api/checkout', requireDb, async (req, res) => {
  const plan = plans[req.body.plan]; const shop = normalizeShop(req.body.shop); const email = String(req.body.email || '').trim().toLowerCase();
  if (!stripe) return json(res, 503, { error: 'Paid checkout is not configured yet. Please try the free trial or contact support.' });
  const merchantId = String(req.body.merchantId || '');
  if (!process.env.FRONTEND_URL) return json(res, 503, { error: 'FRONTEND_URL is not configured on the server.' });
  if (!plan) return json(res, 400, { error: 'Choose a valid subscription plan.' });
  if (!isRealConfigValue(plan.stripePriceId, 'price_')) return json(res, 503, { error: `${plan.name} checkout is not configured yet. Please try the free trial or contact support.` });
  if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid billing email.' });
  if (!shop) return json(res, 400, { error: 'Enter a valid Shopify store URL, such as your-store.myshopify.com.' });
  const filter = ObjectId.isValid(merchantId) ? { _id: new ObjectId(merchantId) } : { shop };
  const merchantUpdate = { $set: { updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } };
  merchantUpdate.$set.shop = shop;
  if (email) merchantUpdate.$set.email = email;
  const merchant = await db.collection('merchants').findOneAndUpdate(filter, merchantUpdate, { upsert: true, returnDocument: 'after' });
  try {
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: plan.stripePriceId, quantity: 1 }], ...(email ? { customer_email: email } : {}), client_reference_id: merchant._id.toString(), metadata: { merchantId: merchant._id.toString(), plan: req.body.plan }, subscription_data: { metadata: { merchantId: merchant._id.toString(), plan: req.body.plan } }, success_url: `${process.env.FRONTEND_URL}/dashboard.html?checkout=success&merchantId=${merchant._id}`, cancel_url: `${process.env.FRONTEND_URL}/pricing.html` });
    json(res, 201, { url: session.url, merchantId: merchant._id.toString() });
  } catch (error) {
    console.error('Stripe Checkout session failed:', error.message);
    json(res, 502, { error: 'Stripe could not start checkout. Confirm the Stripe secret key and the selected plan price ID are configured correctly.' });
  }
});

app.get('/api/merchant/automation', requireDb, requireMerchantSession, async (req, res) => {
  const merchant = await db.collection('merchants').findOne({ _id: req.merchantId });
  if (!merchant) return json(res, 404, { error: 'Merchant not found.' });
  json(res, 200, { automation: { abandonedCartEnabled: merchant.automation?.abandonedCartEnabled === true, abandonedCartDelayMinutes: Number(merchant.automation?.abandonedCartDelayMinutes) || 60 }, emailConfigured: Boolean(process.env.RESEND_API_KEY), shopifyConnected: merchant.shopifyConnected === true });
});
app.put('/api/merchant/automation', requireDb, requireMerchantSession, async (req, res) => {
  const enabled = req.body.abandonedCartEnabled === true;
  const delay = Math.min(1440, Math.max(15, Math.floor(Number(req.body.abandonedCartDelayMinutes) || 60)));
  const merchant = await db.collection('merchants').findOne({ _id: req.merchantId });
  if (!merchant) return json(res, 404, { error: 'Merchant not found.' });
  if (enabled && !merchant.shopifyConnected) return json(res, 400, { error: 'Connect Shopify before enabling cart recovery.' });
  if (enabled && !process.env.RESEND_API_KEY) return json(res, 400, { error: 'Email delivery is not configured on the server yet.' });
  await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: { automation: { abandonedCartEnabled: enabled, abandonedCartDelayMinutes: delay }, updatedAt: new Date() } });
  if (enabled) {
    const dueAt = new Date(Date.now() + delay * 60000);
    await db.collection('abandoned_carts').updateMany({ merchantId: merchant._id, status: 'pending' }, { $set: { dueAt, updatedAt: new Date() } });
    await db.collection('abandoned_carts').updateMany({ merchantId: merchant._id, status: 'not_eligible', emailConsented: true, emailOptOut: { $ne: true }, email: { $ne: '' } }, { $set: { status: 'pending', dueAt, updatedAt: new Date() } });
  }
  json(res, 200, { success: true, automation: { abandonedCartEnabled: enabled, abandonedCartDelayMinutes: delay } });
});
app.put('/api/merchant/autopay', requireDb, requireMerchantSession, async (req, res) => {
  const id = String(req.body.merchantId || '');
  const enabled = req.body.enabled === true;
  if (!ObjectId.isValid(id)) return json(res, 400, { error: 'A valid merchantId is required.' });
  const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(id) });
  if (!merchant?.stripeSubscriptionId || !isPaid(merchant) || !stripe) return json(res, 400, { error: 'An active paid subscription is required to change autopay.' });
  try {
    const subscription = await stripe.subscriptions.update(merchant.stripeSubscriptionId, { cancel_at_period_end: !enabled });
    const update = { autopay: enabled, cancelAtPeriodEnd: !enabled, updatedAt: new Date() };
    if (subscription.current_period_end) update.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: update });
    json(res, 200, { success: true, autopay: enabled, cancelAtPeriodEnd: !enabled, currentPeriodEnd: update.currentPeriodEnd || merchant.currentPeriodEnd || null });
  } catch (error) { json(res, 502, { error: 'Unable to update autopay. Please try again.' }); }
});
app.get('/api/merchant/billing', requireDb, requireMerchantSession, async (req, res) => {
  const id = String(req.query.merchantId || '');
  if (!ObjectId.isValid(id)) return json(res, 400, { error: 'A valid merchantId is required.' });
  const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(id) });
  if (!merchant) return json(res, 404, { error: 'Merchant not found.' });
  const trial = isTrialActive(merchant);
  const plan = trial ? 'premium' : (merchant.plan || 'starter');
  const paid = isPaid(merchant);
  const limit = getMerchantChatLimit(merchant);
  const usage = merchant.chatUsageMonth === new Date().toISOString().slice(0, 7) ? (merchant.chatUsage || 0) : 0;
  json(res, 200, { plan, planName: plans[plan]?.name || plan, trialActive: trial, trialEndsAt: merchant.trialEndsAt || null, subscriptionStatus: merchant.subscriptionStatus || null, paidAt: merchant.paidAt || null, currentPeriodEnd: merchant.currentPeriodEnd || null, autopay: merchant.autopay !== false, cancelAtPeriodEnd: merchant.cancelAtPeriodEnd === true, email: merchant.email || null, amount: plans[plan]?.price || null, currency: 'USD', stripeCustomerId: merchant.stripeCustomerId || null, stripeSubscriptionId: merchant.stripeSubscriptionId || null, stripeInvoiceId: merchant.stripeInvoiceId || null, model: trial || (paid && plan === 'premium') ? plans.premium.model : (plans[plan]?.model || 'gpt-4o-mini'), usage, limit, chatLocked: (!trial && !paid) || usage >= limit });
});
app.post('/api/chat/message', requireDb, requireMerchantSession, async (req, res) => {
  try {
    const merchant = await db.collection('merchants').findOne({ _id: req.merchantId });
    if (!merchant) return json(res, 404, { error: 'Merchant account not found.' });
    const trial = isTrialActive(merchant);
    const paid = isPaid(merchant);
    if (!trial && !paid) return json(res, 402, { locked: true, error: 'Your trial has ended. Upgrade to unlock your AI Sales Executive.' });
    const plan = trial ? (merchant?.trialPlan || trialPlan) : (merchant?.plan || 'starter');
    const limit = getMerchantChatLimit(merchant);
    const settings = { ...defaultSettings, ...(merchant?.settings || {}) };
    const month = new Date().toISOString().slice(0, 7);
    if (merchant && merchant.chatUsageMonth !== month) await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: { chatUsage: 0, chatUsageMonth: month } });
    const currentUsage = merchant?.chatUsageMonth === month ? (merchant.chatUsage || 0) : 0;
    if (currentUsage >= limit) return json(res, 402, { locked: true, limitReached: true, error: trial ? 'Your trial usage limit has been reached. Upgrade to continue.' : `This plan has reached its ${limit.toLocaleString()} monthly AI conversation limit.` });
    let reply = 'I can help you discover products, compare options, understand pricing, start a 5-day trial, or learn how zavoka AI works. What would you like to know?';
    const websiteKnowledge = `zavoka AI is an always-on AI Sales Executive for Shopify merchants. It chats with shoppers, recommends products, supports upsells and cross-sells, recovers abandoned carts, matches the merchant’s brand voice, provides live sales insights, and is available around the clock. Merchants can start a Premium trial with full features; there is no charge during the trial and no credit card is required. Installation starts from the Install section: enter a Shopify store URL and working email, then approve Shopify installation. Public monthly plans are Starter at $25/month with 500 AI conversations, Growth at $59/month with 1,200 conversations, and Premium at $149/month with 2,300 conversations. Plans can be canceled anytime. The website has Features, Pricing, Enterprise, About Us, Contact Us, Terms, Privacy, Merchant Login, and Install pages. zavoka should never claim a specific product, inventory item, discount, shipping time, refund policy, or store policy unless that information has been supplied by the connected merchant. For account, billing, Shopify installation, or support questions, direct the visitor to the relevant website page or Contact Us.`;
    if (process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: trial || plan === 'premium' ? plans.premium.model : (plans[plan]?.model || 'gpt-4o-mini'), temperature: 0.25, max_tokens: 450, messages: [{ role: 'system', content: `You are ${settings.agentName}, the helpful zavoka AI website assistant for ${settings.storeName}. ${settings.behavior} Answer accurately using the following official website information:\n${websiteKnowledge}\nAnswer the visitor directly and concisely. If the question is about a merchant's actual products, explain that product catalog access must be connected and do not invent details.` }, { role: 'user', content: String(req.body.message || '').slice(0, 2000) }] }) });
      if (response.ok) { const data = await response.json(); reply = data.choices?.[0]?.message?.content?.trim() || reply; }
    }
    if (merchant) {
      await db.collection('merchants').updateOne({ _id: merchant._id }, { $inc: { chatUsage: 1 }, $set: { chatUsageMonth: month, updatedAt: new Date() } });
      await db.collection('activity_events').insertOne({ merchantId: merchant._id, type: 'chat', createdAt: new Date() });
    }
    json(res, 200, { success: true, reply, settings, products: [], coupon: null, upsell: null });
  } catch (error) { json(res, 500, { error: 'The AI assistant is temporarily unavailable.' }); }
});
app.post('/api/enterprise', requireDb, async (req, res) => {
  const requiredFields = ['name', 'company', 'email', 'shop', 'needs'];
  if (requiredFields.some((field) => !String(req.body[field] || '').trim()) || !validEmail(req.body.email)) return json(res, 400, { error: 'Please complete all required fields with a valid email.' });
  const lead = { ...req.body, email: String(req.body.email).trim().toLowerCase(), createdAt: new Date(), status: 'new' };
  await db.collection('enterprise_leads').insertOne(lead);
  if (validEmail(process.env.NOTIFICATION_EMAIL || '')) {
    await sendEmail({ to: process.env.NOTIFICATION_EMAIL, subject: `New Enterprise lead — ${lead.company}`, html: emailLayout('New Enterprise lead', `<p>A new Enterprise inquiry was submitted.</p><table cellpadding="8"><tr><td><b>Name</b></td><td>${lead.name}</td></tr><tr><td><b>Company</b></td><td>${lead.company}</td></tr><tr><td><b>Email</b></td><td>${lead.email}</td></tr><tr><td><b>Store</b></td><td>${lead.shop}</td></tr><tr><td><b>Needs</b></td><td>${lead.needs}</td></tr></table>`) });
  }
  json(res, 201, { success: true, message: 'Thanks — our enterprise team will contact you within 24 hours.' });
});
app.post('/api/contact', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 120);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
  const subject = String(req.body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
  const message = String(req.body.message || '').trim().slice(0, 5000);
  if (!name || !validEmail(email) || !subject || !message) return json(res, 400, { error: 'Please complete every field with a valid email address.' });
  const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const content = `<p><b>From:</b> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><b>Subject:</b> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
  const sent = await sendEmail({ to: 'contact@zavoka.com', subject: `Website contact — ${subject}`, html: emailLayout('New website contact message', content) });
  if (!sent) return json(res, 503, { error: 'Email delivery is temporarily unavailable. Please try again later.' });
  json(res, 200, { success: true, message: 'Thanks — your message has been sent to our team.' });
});
app.get('/api/admin/trial-settings', requireDb, requireAdmin, async (req, res) => {
  const settings = await getTrialSettings();
  json(res, 200, { days: settings.days, chatLimit: settings.chatLimit });
});
app.put('/api/admin/trial-settings', requireDb, requireAdmin, async (req, res) => {
  const days = Math.min(30, Math.max(1, Number(req.body.days) || defaultTrialSettings.days));
  const chatLimit = Math.min(100000, Math.max(1, Number(req.body.chatLimit) || defaultTrialSettings.chatLimit));
  await db.collection('platform_settings').updateOne({ _id: 'trial' }, { $set: { _id: 'trial', days, chatLimit, updatedAt: new Date() } }, { upsert: true });
  json(res, 200, { success: true, days, chatLimit });
});
app.get('/api/admin/metrics', requireDb, requireAdmin, async (req, res) => {
  const [merchants, activeTrials, conversations, paidMerchants, uninstalledMerchants, recentActivity] = await Promise.all([
    db.collection('merchants').countDocuments(),
    db.collection('merchants').countDocuments({ trialStatus: 'active', trialEndsAt: { $gt: new Date() } }),
    db.collection('conversations').countDocuments(),
    db.collection('merchants').countDocuments({ subscriptionStatus: { $in: ['active', 'trialing'] } }),
    db.collection('merchants').countDocuments({ shopifyConnected: false, uninstalledAt: { $exists: true } }),
    db.collection('merchants').find({}, { projection: { shop: 1, email: 1, plan: 1, trialStatus: 1, trialStartedAt: 1, trialEndsAt: 1, trialChatLimit: 1, chatUsage: 1, subscriptionStatus: 1, paidAt: 1, currentPeriodEnd: 1, shopifyConnected: 1, uninstalledAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(50).toArray()
  ]);
  const revenue = await db.collection('merchants').aggregate([{ $match: { subscriptionStatus: { $in: ['active', 'trialing'] } } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$monthlyRevenue', 0] } } } }]).toArray();
  json(res, 200, { metrics: { merchants, activeTrials, conversations, paidMerchants, uninstalledMerchants, monthlyRevenue: revenue[0]?.total || 0 }, charts: { conversations: [], conversions: [], subscriptions: [] }, recentActivity });
});
app.get('/api/admin/merchants', requireDb, requireAdmin, async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 120);
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = search ? { $or: [{ shop: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }] } : {};
  const merchants = await db.collection('merchants').find(filter, { projection: { shop: 1, email: 1, plan: 1, trialStatus: 1, trialStartedAt: 1, trialEndsAt: 1, trialChatLimit: 1, chatLimitOverride: 1, chatUsage: 1, subscriptionStatus: 1, paidAt: 1, currentPeriodEnd: 1, shopifyConnected: 1, uninstalledAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(100).toArray();
  json(res, 200, { merchants: merchants.map((merchant) => ({ ...merchant, merchantId: merchant._id.toString(), chatLimit: getMerchantChatLimit(merchant) })) });
});
app.put('/api/admin/merchants/:merchantId/chat-limit', requireDb, requireAdmin, async (req, res) => {
  const { merchantId } = req.params;
  const chatLimit = Number(req.body.chatLimit);
  if (!ObjectId.isValid(merchantId)) return json(res, 400, { error: 'A valid merchantId is required.' });
  if (!Number.isInteger(chatLimit) || chatLimit < 1 || chatLimit > 100000) return json(res, 400, { error: 'Conversation limit must be a whole number between 1 and 100,000.' });
  const result = await db.collection('merchants').updateOne({ _id: new ObjectId(merchantId) }, { $set: { chatLimitOverride: chatLimit, updatedAt: new Date() } });
  if (!result.matchedCount) return json(res, 404, { error: 'Merchant not found.' });
  json(res, 200, { success: true, chatLimit });
});
app.get('/api/dashboard', requireDb, requireMerchantSession, async (req, res) => {
  const merchantId = req.merchantId;
  const merchant = await db.collection('merchants').findOne({ _id: merchantId });
  const [conversations, recommendations, checkouts, ordersCount, recoveredCarts, pendingCarts, orderTotals, orders] = await Promise.all([
    db.collection('activity_events').countDocuments({ merchantId, type: 'chat' }),
    db.collection('activity_events').countDocuments({ merchantId, type: 'recommendation' }),
    db.collection('shopify_checkouts').countDocuments({ merchantId }),
    db.collection('shopify_orders').countDocuments({ merchantId }),
    db.collection('abandoned_carts').countDocuments({ merchantId, status: 'recovered' }),
    db.collection('abandoned_carts').countDocuments({ merchantId, status: { $in: ['pending', 'processing', 'sent'] } }),
    db.collection('shopify_orders').aggregate([{ $match: { merchantId } }, { $group: { _id: null, revenue: { $sum: '$total' } } }]).toArray(),
    db.collection('shopify_orders').find({ merchantId }, { projection: { orderNumber: 1, financialStatus: 1, fulfillmentStatus: 1, total: 1, currency: 1, orderStatusUrl: 1, tracking: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(20).toArray()
  ]);
  const conversionRate = checkouts ? `${((ordersCount / checkouts) * 100).toFixed(1)}%` : '0%';
  json(res, 200, { metrics: { conversations, recommendedProducts: recommendations, cartRecovery: recoveredCarts, conversionRate, orders: ordersCount, revenue: Number(orderTotals[0]?.revenue || 0), currency: merchant.shopCurrency || 'USD', pendingCarts }, orders, recentActivity: [] });
});
app.use((req, res) => json(res, 404, { error: 'Route not found' }));

async function start() {
  await mongo.connect();
  db = mongo.db(process.env.MONGODB_DB || 'zavoka');
  await Promise.all([
    db.collection('merchants').createIndex({ shop: 1 }, { unique: true, sparse: true }),
    db.collection('oauth_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('shopify_orders').createIndex({ shop: 1, orderId: 1 }, { unique: true }),
    db.collection('shopify_checkouts').createIndex({ shop: 1, checkoutId: 1 }, { unique: true }),
    db.collection('abandoned_carts').createIndex({ shop: 1, checkoutId: 1 }, { unique: true }),
    db.collection('abandoned_carts').createIndex({ status: 1, dueAt: 1 }),
    db.collection('shopify_webhook_events').createIndex({ deliveryId: 1 }, { unique: true, sparse: true }),
    db.collection('shop_products').createIndex({ shop: 1, productId: 1 }, { unique: true }),
    db.collection('email_suppressions').createIndex({ merchantId: 1, emailHash: 1 }, { unique: true })
  ]);
  await Promise.all([db.collection('platform_settings').updateOne({ _id: 'trial', chatLimit: 100 }, { $set: { chatLimit: 50, updatedAt: new Date() } }), db.collection('merchants').updateMany({ trialStatus: 'active', trialChatLimit: 100 }, { $set: { trialChatLimit: 50, updatedAt: new Date() } })]);
  setInterval(() => processTrialNotifications().catch((error) => console.error('Trial notification job failed:', error.message)), 15 * 60 * 1000);
  setInterval(() => processAbandonedCartJobs().catch((error) => console.error('Abandoned-cart job failed:', error.message)), 5 * 60 * 1000);
  setInterval(async () => {
    try {
      const merchants = await db.collection('merchants').find({ shopifyConnected: true, shopifyAccessToken: { $exists: true } }).toArray();
      for (const merchant of merchants) {
        try { await syncShopProducts(merchant); } catch (error) { console.error(`Product sync failed for ${merchant.shop}:`, error.message); }
      }
    } catch (error) { console.error('Shopify product sync job failed:', error.message); }
  }, 6 * 60 * 60 * 1000);
  await Promise.all([processTrialNotifications(), processAbandonedCartJobs()]);
  app.listen(port, () => console.log(`zavoka API listening on ${port}`));
}
start().catch((error) => { console.error('Startup failed:', error); process.exit(1); });
