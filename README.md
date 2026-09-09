# Layboka AI

Layboka AI is an always-on AI Sales Executive for Shopify merchants. The website helps merchants learn about the product, start a 5-day Premium trial, choose a subscription plan, and manage their AI assistant.

## Project structure

```text
layboka-ai/
├── index.html                  # Landing page, features, calculator, and trial installation form
├── pricing.html                # Monthly subscription plans and pricing FAQ
├── enterprise.html             # Enterprise consultation form
├── about.html                  # About page
├── contact.html                # Support contact page
├── terms.html                  # Terms and conditions
├── privacy.html                # Privacy policy
├── dashboard.html              # Merchant settings, usage, and billing
├── admin.html                  # Admin metrics overview
├── vercel.json                 # Frontend-to-API rewrite configuration
├── robots.txt                  # Crawler rules and sitemap reference
├── sitemap.xml                 # Public SEO URLs
├── css/style.css               # Shared theme and responsive layout
├── js/app.js                   # Navigation, calculator, trial, and checkout logic
├── js/chatbot.js               # Storefront AI chat widget
├── js/dashboard.js             # Merchant settings and billing logic
├── js/enterprise.js            # Enterprise consultation form logic
└── backend/
    ├── server.js               # Express API, Shopify OAuth, Stripe, and chat routes
    ├── package.json             # Backend dependencies
    └── .env.example             # Production environment variable template
```

## Production launch checklist

Before launch, verify all of the following in the deployed environment:

- The frontend is served over HTTPS at the production website URL.
- The backend is deployed and reachable over HTTPS.
- The API hostname in `vercel.json` points to the real deployed backend.
- The production MongoDB database is reachable by the backend.
- Stripe is using live-mode credentials and live recurring Prices.
- The Stripe webhook is delivering events successfully.
- Shopify OAuth credentials and the callback URL match the deployed domains.
- DNS, SSL certificates, CORS, and email sender configuration are active.
- A live-mode test subscription has been completed and verified through the webhook.
- The success redirect, dashboard billing details, and PDF download have been checked.

Workspace code cannot verify deployed DNS, environment values, external service connectivity, Stripe approval, or webhook delivery. Those items must be confirmed in the hosting, Stripe, Shopify, MongoDB, and email provider dashboards.

## Stripe integration

The backend supports real Stripe Checkout subscriptions and signed webhook processing.

### Required environment variables

Set these values in the backend production environment. Do not commit secrets or a real `.env` file.

```env
FRONTEND_URL=https://layboka.ai

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_GROWTH_PRICE_ID=price_...
STRIPE_PREMIUM_PRICE_ID=price_...
```

The three Price IDs must refer to recurring monthly USD Prices that match the public pricing page:

- Starter — $25/month
- Growth — $59/month
- Premium — $149/month

### Stripe webhook

Register this endpoint in Stripe:

```text
POST https://api.layboka.ai/api/stripe/webhook
```

Replace the hostname if the backend is deployed elsewhere. Configure these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The webhook:

- Verifies the raw Stripe request body and signature.
- Ignores duplicate event IDs.
- Stores the Stripe customer, subscription, invoice, plan, status, and payment date.
- Unlocks paid access only after verified Stripe state is stored.
- Handles paid, canceled, and failed-payment states.
- Sends optional merchant notifications when Resend is configured.

Use the webhook signing secret generated for the same Stripe mode as the secret key. A live secret must be used for live payments.

## Successful payment and billing flow

1. The customer selects Starter, Growth, or Premium.
2. The frontend sends the selected plan to `/api/checkout`.
3. The backend creates a Stripe subscription Checkout Session.
4. Stripe redirects the customer to:

   ```text
   /dashboard.html?checkout=success&merchantId=...
   ```

5. The dashboard waits for the verified webhook state.
6. After the subscription is confirmed, the dashboard shows:
   - `Recharge successfully completed`
   - Plan and subscription status
   - Billing email
   - Monthly amount and currency
   - Payment date
   - Stripe subscription ID
   - A browser-generated PDF billing-details download

If the customer returns before the webhook is processed, the dashboard displays a payment-pending message rather than falsely claiming that the subscription is active.

## Shopify installation

Required Shopify variables:

```env
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_SCOPES=read_products,write_script_tags
SHOPIFY_REDIRECT_URI=https://api.your-domain.com/api/shopify/callback
```

The installation form validates a store domain, creates a 5-day Premium trial with 100 AI chats, and redirects the merchant to Shopify OAuth. The callback validates the OAuth state and Shopify HMAC before storing the access token.

## Trial and access rules

- Trial length: 5 days.
- Trial plan: Premium features.
- Trial allowance: 100 AI chats.
- A trial ends when the time limit or chat limit is reached.
- Paid access requires an active or trialing subscription and a stored Stripe subscription ID.
- Trial and billing notifications are optional and require Resend configuration.

Optional email variables:

```env
RESEND_API_KEY=re_...
FROM_EMAIL=Layboka AI <notifications@layboka.ai>
```

## AI chat

The backend supports optional OpenAI integration. Without an OpenAI key, the API returns a safe fallback response.

```env
OPENAI_API_KEY=sk-proj_...
OPENAI_MODEL=gpt-4o-mini
OPENAI_PREMIUM_MODEL=gpt-5
```

The production backend should have an appropriate model configured and sufficient account access before enabling AI responses for customers.

## SEO readiness

Public SEO files and metadata are included:

- Canonical URLs on public pages.
- Meta descriptions.
- Open Graph metadata.
- Twitter summary metadata where configured.
- SoftwareApplication JSON-LD on the homepage.
- `robots.txt` with dashboard, admin, and backend exclusions.
- `sitemap.xml` containing public pages only.
- `noindex,nofollow` on merchant and admin dashboards.

After deployment, submit `https://layboka.ai/sitemap.xml` to the relevant search console and confirm that the canonical domain, HTTPS redirects, and robots rules resolve correctly.

## Link audit

The public navigation and footer link to workspace pages that exist:

- `index.html`
- `pricing.html`
- `enterprise.html`
- `about.html`
- `contact.html`
- `terms.html`
- `privacy.html`
- `dashboard.html`
- `admin.html`
- `index.html#install`
- `index.html#features`

The API rewrite is configured in `vercel.json`. Its backend hostname must remain synchronized with the deployed API domain. Email links and external Stripe, Shopify, Gmail, and API links require their corresponding production services to be configured.

## Backend API overview

The backend provides:

- `GET /api/health`
- `GET /api/plans`
- `POST /api/install`
- `GET /api/shopify/callback`
- `POST /api/checkout`
- `POST /api/stripe/webhook`
- `GET /api/merchant/settings`
- `PUT /api/merchant/settings`
- `GET /api/merchant/billing`
- `POST /api/chat/message`
- `POST /api/enterprise`
- `GET /api/admin/metrics`
- `GET /api/dashboard`

## Security notes

- Keep Stripe, MongoDB, Shopify, OpenAI, and email-provider secrets out of source control.
- Use HTTPS for the frontend, backend, Stripe webhook, and Shopify callback.
- Use the live Stripe webhook signing secret with live payments.
- Restrict admin metrics with authentication before exposing `admin.html` publicly.
- Review Shopify scopes and request only the permissions required by the application.
- Configure production CORS to the actual frontend origin instead of relying on a wildcard.
- Review privacy, terms, billing, cancellation, and data-retention language before public launch.
