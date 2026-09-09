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
  starter: { name: 'Starter', price: 25, stripePriceId: process.env.STRIPE_STARTER_PRICE_ID, model: 'gpt-4o-mini' },
  growth: { name: 'Growth', price: 59, stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID, model: 'gpt-4o-mini' },
  premium: { name: 'Premium', price: 149, stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID, model: process.env.OPENAI_PREMIUM_MODEL || 'gpt-5' }
};
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const chatLimits = { starter: 600, growth: 1400, premium: 2300, enterprise: Number.MAX_SAFE_INTEGER };
const trialDays = 5;
const trialChatLimit = 100;
const trialPlan = 'premium';
const isTrialActive = (merchant) => merchant?.trialStatus === 'active' && merchant.trialEndsAt && new Date(merchant.trialEndsAt) > new Date();
const isPaid = (merchant) => ['active', 'trialing'].includes(merchant?.subscriptionStatus) && merchant?.stripeSubscriptionId;
const defaultSettings = { agentName: 'Emily', agentPic: '', storeName: 'Layboka AI', themeColor: '#FF4616', behavior: 'Friendly, helpful, concise, and focused on improving sales.', welcomeMessage: 'Hi! I’m Emily. How can I help you shop today?' };
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

// Email is optional: configure Resend in the environment for automatic notifications.
const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.RESEND_API_KEY || !validEmail(to)) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FROM_EMAIL || 'Layboka AI <notifications@layboka.ai>', to: [to], subject, html })
    });
    return response.ok;
  } catch (error) { console.error('Email notification failed:', error.message); return false; }
};
const notifyMerchant = (merchant, subject, html) => merchant?.email ? sendEmail({ to: merchant.email, subject, html }) : Promise.resolve(false);
const trialEmail = (merchant, title, message) => notifyMerchant(merchant, `Layboka AI — ${title}`, `<h2>${title}</h2><p>${message}</p><p>Store: ${merchant.shop}</p><p>Layboka AI Support</p>`);
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
          await notifyMerchant(merchant, 'Payment failed', 'Your latest subscription invoice could not be paid. Please update your payment method to keep your AI Sales Executive active.');
          await db.collection('merchants').updateOne({ _id: new ObjectId(merchantId) }, { $set: { lastPaymentStatus: 'failed', updatedAt: new Date() } });
        } else if (event.type === 'invoice.paid') {
          await notifyMerchant(merchant, 'Invoice paid', 'Your Layboka AI subscription invoice was paid successfully.');
          await db.collection('merchants').updateOne({ _id: new ObjectId(merchantId) }, { $set: { lastPaymentStatus: 'paid', updatedAt: new Date() } });
        } else {
          const update = {
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.subscription || object.id,
            subscriptionStatus: event.type === 'customer.subscription.deleted' ? 'canceled' : (event.type === 'checkout.session.completed' ? 'active' : (object.status || 'active')),
            ...(object.metadata?.plan ? { plan: object.metadata.plan } : {}),
            updatedAt: new Date()
          };
          if (event.type === 'checkout.session.completed') {
            update.paidAt = new Date();
            if (object.invoice) update.stripeInvoiceId = object.invoice;
          }
          await db.collection('merchants').updateOne({ _id: new ObjectId(merchantId) }, { $set: update });
          if (event.type === 'checkout.session.completed') await notifyMerchant({ ...merchant, ...update }, 'Subscription active', `Your ${plans[update.plan]?.name || 'Layboka AI'} subscription is active. Your chatbot is unlocked immediately.`);
          if (event.type === 'customer.subscription.deleted') await notifyMerchant(merchant, 'Subscription canceled', 'Your subscription was canceled and your chatbot may be locked. You can reactivate a paid plan at any time.');
        }
      }
    }
    await db.collection('stripe_events').insertOne({ id: event.id, type: event.type, createdAt: new Date() });
    res.sendStatus(200);
  } catch (error) { res.status(400).send(`Webhook Error: ${error.message}`); }
});

app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*'); res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); req.method === 'OPTIONS' ? res.sendStatus(204) : next(); });

app.get('/api/health', (req, res) => json(res, 200, { ok: Boolean(db), service: 'layboka-api' }));
app.get('/api/plans', (req, res) => json(res, 200, { plans }));
app.post('/api/install', requireDb, async (req, res) => {
  const shop = normalizeShop(req.body.shop);
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!shop) return json(res, 400, { error: 'Enter a valid Shopify store domain, such as your-store.myshopify.com or yourstore.com.' });
  if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid working email address.' });
  const now = new Date();
  const result = await db.collection('merchants').findOneAndUpdate({ shop }, { $set: { shop, email, updatedAt: now }, $setOnInsert: { createdAt: now, trialStatus: 'active', trialPlan, trialChatLimit, trialEndsAt: new Date(now.getTime() + trialDays * 86400000) } }, { upsert: true, returnDocument: 'after' });
  const state = crypto.randomBytes(24).toString('hex'); await db.collection('oauth_states').insertOne({ state, shop, merchantId: result._id, createdAt: now, expiresAt: new Date(now.getTime() + 10 * 60000) });
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(process.env.SHOPIFY_API_KEY)}&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES || 'read_products,write_script_tags')}&redirect_uri=${encodeURIComponent(process.env.SHOPIFY_REDIRECT_URI)}&state=${state}`;
  const merchant = result.value || result;
  if (!merchant.trialStartEmailSent) {
    await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: { trialStartEmailSent: true } });
    await trialEmail(merchant, 'Your Premium trial has started', 'Your 5-day Premium trial is active with full Premium features and 100 AI chats. No charge will be made during the trial.');
  }
  json(res, 201, { success: true, merchantId: merchant._id.toString(), trialDays, trialPlan, trialChatLimit, message: 'Your 5-day Premium trial is ready with full features and 100 AI chats. Continue to Shopify to approve the app.', installUrl });
});

app.get('/api/merchant/settings', requireDb, async (req, res) => {
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
    usage: merchant.chatUsage || 0,
    limit: trial ? (merchant.trialChatLimit || trialChatLimit) : chatLimits[effectivePlan],
    model: trial || (paid && effectivePlan === 'premium') ? plans.premium.model : (plans[effectivePlan]?.model || 'gpt-4o-mini')
  });
});
app.put('/api/merchant/settings', requireDb, async (req, res) => {
  const id = String(req.body.merchantId || '');
  if (!ObjectId.isValid(id)) return json(res, 400, { error: 'A valid merchantId is required.' });
  const settings = { ...defaultSettings, agentName: String(req.body.agentName || defaultSettings.agentName).slice(0, 80), agentPic: String(req.body.agentPic || '').slice(0, 500), storeName: String(req.body.storeName || defaultSettings.storeName).slice(0, 120), themeColor: /^#[0-9a-f]{6}$/i.test(req.body.themeColor) ? req.body.themeColor : defaultSettings.themeColor, behavior: String(req.body.behavior || defaultSettings.behavior).slice(0, 1000), welcomeMessage: String(req.body.welcomeMessage || defaultSettings.welcomeMessage).slice(0, 500) };
  const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(id) });
  await db.collection('merchants').updateOne({ _id: new ObjectId(id) }, { $set: { settings, updatedAt: new Date() } });
  await notifyMerchant(merchant, 'Executive settings updated', 'Your Layboka AI Sales Executive settings were updated successfully.');
  json(res, 200, { success: true, settings });
});
app.get('/api/shopify/callback', requireDb, async (req, res) => {
  const { shop, code, state, hmac } = req.query; const record = await db.collection('oauth_states').findOne({ state, shop, expiresAt: { $gt: new Date() } });
  if (!record || !code || !shop || !hmac) return res.status(400).send('Invalid or expired Shopify authorization.');
  const query = { ...req.query }; delete query.signature; delete query.hmac; const message = Object.keys(query).sort().map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`).join('&');
  const digest = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(message).digest('hex');
  if (digest.length !== String(hmac).length || !crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(hmac)))) return res.status(400).send('Invalid Shopify signature.');
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code }) });
  if (!tokenResponse.ok) return res.status(502).send('Shopify token exchange failed.');
  const token = await tokenResponse.json(); await db.collection('merchants').updateOne({ _id: record.merchantId }, { $set: { shopifyAccessToken: token.access_token, shopifyScopes: token.scope, installedAt: new Date(), updatedAt: new Date() } }); await db.collection('oauth_states').deleteOne({ _id: record._id });
  res.redirect(`${process.env.FRONTEND_URL || '/'}?shopify=connected`);
});
app.post('/api/checkout', requireDb, async (req, res) => {
  if (!stripe) return json(res, 503, { error: 'Stripe is not configured on the server.' });
  const plan = plans[req.body.plan]; const email = String(req.body.email || '').trim().toLowerCase();
  const merchantId = String(req.body.merchantId || '');
  if (!process.env.FRONTEND_URL) return json(res, 503, { error: 'FRONTEND_URL is not configured on the server.' });
  if (!plan) return json(res, 400, { error: 'Choose a valid subscription plan.' });
  if (!plan.stripePriceId) return json(res, 503, { error: `Stripe price is not configured for the ${plan.name} plan.` });
  if (email && !validEmail(email)) return json(res, 400, { error: 'Enter a valid billing email.' });
  const filter = ObjectId.isValid(merchantId) ? { _id: new ObjectId(merchantId) } : (email ? { email } : { _id: new ObjectId() });
  const merchantUpdate = { $set: { updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } };
  if (email) merchantUpdate.$set.email = email;
  const merchant = await db.collection('merchants').findOneAndUpdate(filter, merchantUpdate, { upsert: true, returnDocument: 'after' });
  const session = await stripe.checkout.sessions.create({     mode: 'subscription', line_items: [{ price: plan.stripePriceId, quantity: 1 }], ...(email ? { customer_email: email } : {}), client_reference_id: merchant._id.toString(), metadata: { merchantId: merchant._id.toString(), plan: req.body.plan }, subscription_data: { metadata: { merchantId: merchant._id.toString(), plan: req.body.plan } }, success_url: `${process.env.FRONTEND_URL}/dashboard.html?checkout=success&merchantId=${merchant._id}`, cancel_url: `${process.env.FRONTEND_URL}/pricing.html` });
  json(res, 201, { url: session.url, merchantId: merchant._id.toString() });
});

app.get('/api/merchant/billing', requireDb, async (req, res) => {
  const id = String(req.query.merchantId || '');
  if (!ObjectId.isValid(id)) return json(res, 400, { error: 'A valid merchantId is required.' });
  const merchant = await db.collection('merchants').findOne({ _id: new ObjectId(id) });
  if (!merchant) return json(res, 404, { error: 'Merchant not found.' });
  const trial = isTrialActive(merchant);
  const plan = trial ? 'premium' : (merchant.plan || 'starter');
  const paid = isPaid(merchant);
  const limit = trial ? (merchant.trialChatLimit || trialChatLimit) : (chatLimits[plan] || chatLimits.starter);
  const usage = merchant.chatUsageMonth === new Date().toISOString().slice(0, 7) ? (merchant.chatUsage || 0) : 0;
  json(res, 200, { plan, planName: plans[plan]?.name || plan, trialActive: trial, trialEndsAt: merchant.trialEndsAt || null, subscriptionStatus: merchant.subscriptionStatus || null, paidAt: merchant.paidAt || null, email: merchant.email || null, amount: plans[plan]?.price || null, currency: 'USD', stripeCustomerId: merchant.stripeCustomerId || null, stripeSubscriptionId: merchant.stripeSubscriptionId || null, stripeInvoiceId: merchant.stripeInvoiceId || null, model: trial || (paid && plan === 'premium') ? plans.premium.model : (plans[plan]?.model || 'gpt-4o-mini'), usage, limit, chatLocked: (!trial && !paid) || usage >= limit });
});
app.post('/api/chat/message', async (req, res) => {
  try {
    const merchantId = String(req.body.merchantId || '');
    const merchant = db && ObjectId.isValid(merchantId) ? await db.collection('merchants').findOne({ _id: new ObjectId(merchantId) }) : null;
    const trial = isTrialActive(merchant);
    const paid = isPaid(merchant);
    if (merchant && !trial && !paid) return json(res, 402, { locked: true, error: 'Your 5-day trial has ended. Recharge now to unlock your AI Sales Executive.' });
    const plan = trial ? (merchant?.trialPlan || trialPlan) : (merchant?.plan || 'starter');
    const limit = trial ? (merchant.trialChatLimit || trialChatLimit) : (chatLimits[plan] || chatLimits.starter);
    const settings = { ...defaultSettings, ...(merchant?.settings || {}) };
    const month = new Date().toISOString().slice(0, 7);
    if (merchant && merchant.chatUsageMonth !== month) await db.collection('merchants').updateOne({ _id: merchant._id }, { $set: { chatUsage: 0, chatUsageMonth: month } });
    const currentUsage = merchant?.chatUsageMonth === month ? (merchant.chatUsage || 0) : 0;
    if (merchant && currentUsage >= limit) return json(res, 402, { locked: true, limitReached: true, error: trial ? 'Your 5-day Premium trial includes 100 chats and has ended. Recharge Now to continue.' : `This plan has reached its ${limit.toLocaleString()} monthly AI conversation limit.` });
    let reply = 'I can help you discover products, compare options, understand pricing, start a 5-day trial, or learn how Layboka AI works. What would you like to know?';
    const websiteKnowledge = `Layboka AI is an always-on AI Sales Executive for Shopify merchants. It chats with shoppers, recommends products, supports upsells and cross-sells, recovers abandoned carts, matches the merchant’s brand voice, provides live sales insights, and is available around the clock. Merchants can start a 5-day Premium trial with full features and 100 AI chats; there is no charge during the trial and no credit card is required. Installation starts from the Install section: enter a Shopify store URL and working email, then approve Shopify installation. Public monthly plans are Starter at $25/month with 600 AI conversations, Growth at $59/month with 1,400 conversations, and Premium at $149/month with 2,300 conversations. Plans can be canceled anytime. The website has Features, Pricing, Enterprise, About Us, Contact Us, Terms, Privacy, Merchant Login, and Install pages. Layboka should never claim a specific product, inventory item, discount, shipping time, refund policy, or store policy unless that information has been supplied by the connected merchant. For account, billing, Shopify installation, or support questions, direct the visitor to the relevant website page or Contact Us.`;
    if (process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: trial || plan === 'premium' ? plans.premium.model : (plans[plan]?.model || 'gpt-4o-mini'), temperature: 0.25, max_tokens: 450, messages: [{ role: 'system', content: `You are ${settings.agentName}, the helpful Layboka AI website assistant for ${settings.storeName}. ${settings.behavior} Answer accurately using the following official website information:\n${websiteKnowledge}\nAnswer the visitor directly and concisely. If the question is about a merchant's actual products, explain that product catalog access must be connected and do not invent details.` }, { role: 'user', content: String(req.body.message || '').slice(0, 2000) }] }) });
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
  await db.collection('enterprise_leads').insertOne({ ...req.body, email: String(req.body.email).trim().toLowerCase(), createdAt: new Date(), status: 'new' });
  json(res, 201, { success: true, message: 'Thanks — our enterprise team will contact you within 24 hours.' });
});
app.get('/api/admin/metrics', requireDb, async (req, res) => {
  const [merchants, activeTrials, conversations, paidMerchants, recentActivity] = await Promise.all([
    db.collection('merchants').countDocuments(),
    db.collection('merchants').countDocuments({ trialStatus: 'active', trialEndsAt: { $gt: new Date() } }),
    db.collection('conversations').countDocuments(),
    db.collection('merchants').countDocuments({ subscriptionStatus: { $in: ['active', 'trialing'] } }),
    db.collection('merchants').find({}, { projection: { shop: 1, plan: 1, updatedAt: 1, subscriptionStatus: 1 } }).sort({ updatedAt: -1 }).limit(8).toArray()
  ]);
  const revenue = await db.collection('merchants').aggregate([{ $match: { subscriptionStatus: { $in: ['active', 'trialing'] } } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$monthlyRevenue', 0] } } } }]).toArray();
  json(res, 200, { metrics: { merchants, activeTrials, conversations, paidMerchants, monthlyRevenue: revenue[0]?.total || 0 }, charts: { conversations: [], conversions: [], subscriptions: [] }, recentActivity });
});
app.get('/api/dashboard', requireDb, async (req, res) => json(res, 200, { metrics: { conversations: await db.collection('conversations').countDocuments(), recommendedProducts: 0, cartRecovery: 0, conversionRate: '0%' }, recentActivity: [] }));
app.use((req, res) => json(res, 404, { error: 'Route not found' }));

async function start() { await mongo.connect(); db = mongo.db(process.env.MONGODB_DB || 'layboka'); await Promise.all([db.collection('merchants').createIndex({ shop: 1 }, { unique: true, sparse: true }), db.collection('oauth_states').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })]); setInterval(() => processTrialNotifications().catch((error) => console.error('Trial notification job failed:', error.message)), 15 * 60 * 1000); await processTrialNotifications(); app.listen(port, () => console.log(`Layboka API listening on ${port}`)); }
start().catch((error) => { console.error('Startup failed:', error); process.exit(1); });
