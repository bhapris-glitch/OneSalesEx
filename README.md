# Layboka AI

Layboka AI is an always-on AI Sales Executive for Shopify merchants. The website helps merchants learn about the product, start a 5-day trial, choose a subscription plan, and manage their AI assistant.

## Project structure

```text
layboka-ai/
├── index.html                  # Landing page, features, calculator, and URL-only trial install form
├── pricing.html                # Monthly/yearly plans and pricing FAQ
├── enterprise.html             # Enterprise consultation form
├── about.html                  # About page
├── contact.html                # Contact page
├── terms.html                  # Terms and conditions
├── privacy.html                # Privacy policy
├── dashboard.html              # Merchant settings, usage, and billing
├── admin.html                  # Admin metrics overview
├── vercel.json                 # API rewrite configuration
├── script.js                   # Root-level script placeholder
├── README.md
│
├── css/
│   └── style.css               # Shared theme, layout, footer, chatbot, and responsive styles
│
├── js/
│   ├── app.js                  # Shared navigation, calculator, trial, and checkout logic
│   ├── chatbot.js              # Storefront AI chat widget
│   ├── dashboard.js            # Merchant settings and billing logic
│   └── enterprise.js           # Enterprise consultation form logic
│
└── backend/
    ├── server.js               # Express API, Shopify OAuth, Stripe, and chat routes
    ├── package.json             # Backend dependencies and scripts
    └── .env.example             # Required backend environment variables
```

## Frontend pages

- `index.html` — hero section, product features, revenue calculator, installation form, and chatbot
- `pricing.html` — subscription plans, monthly/yearly billing toggle, and pricing FAQ
- `enterprise.html` — enterprise features and consultation request form
- `about.html` — company overview
- `contact.html` — support contact information
- `terms.html` — terms and conditions
- `privacy.html` — privacy policy
- `dashboard.html` — merchant trial status, usage, billing, and executive customization
- `admin.html` — platform metrics and recent activity

## Shared website UI

All pages use `css/style.css` for the shared visual system, including:

- Dark green/black theme with orange accents
- Red Layboka AI logo styling
- Hero-style subtle gradient footer background
- Product, Company, and Legal footer navigation
- Responsive layouts for desktop and mobile
- Mobile navigation that changes from `☰` to a compact `❌` close button
- Consistent About Us and Contact Us links in the header navigation

The footer menu includes:

- **Product:** Features, Pricing, Enterprise, Install App
- **Company:** About Us, Contact, Login, Sign Up
- **Legal:** Terms & Conditions, Privacy Policy

## Backend API

The backend is contained in `backend/` and provides:

- Shopify installation and OAuth callback handling
- Merchant settings and storefront configuration
- Stripe subscription checkout and webhook processing
- 5-day full-Premium trial with a 100-chat limit, plus paid plan limits and billing information
- Automatic email notifications for trial start, 48-hour and 24-hour reminders, trial end, successful payments, failed invoices, cancellations, and account activity
- AI chat messages with optional OpenAI integration
- Enterprise lead collection
- Admin metrics and dashboard data

Set up environment variables using `backend/.env.example`. Keep secrets in a local `backend/.env` file and do not commit that file.

## Configuration notes

- Set `FRONTEND_URL` and `SHOPIFY_REDIRECT_URI` to the deployed website and API URLs.
- Configure MongoDB, Stripe price IDs, Shopify credentials, and optional OpenAI credentials before using production integrations.
- In Stripe, create three recurring USD Prices and set `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, and `STRIPE_PREMIUM_PRICE_ID` to those Price IDs.
- Register `POST https://<your-api-domain>/api/stripe/webhook` in Stripe Workbench and subscribe to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Copy the endpoint signing secret to `STRIPE_WEBHOOK_SECRET`.
- Keep Stripe webhook delivery pointed at the backend, not the static frontend. The endpoint verifies the raw Stripe payload signature and ignores duplicate event IDs.
- `vercel.json` must point `/api/*` to the actual deployed backend domain; replace the example API hostname if your deployment uses another domain.
- The frontend uses `window.LAYBOKA_API` when a separate API origin is required; otherwise it uses relative `/api` routes.

## Launch audit

- Public navigation targets existing pages: home, pricing, enterprise, about, contact, terms, privacy, and dashboard.
- Checkout creates a Stripe subscription Checkout Session and redirects to Stripe; access is unlocked by the verified webhook, not by the success URL alone.
- `robots.txt`, `sitemap.xml`, canonical URLs, Open Graph metadata, Twitter summary metadata, and SoftwareApplication structured data are included for the public site.
- Dashboard and admin pages are marked `noindex,nofollow`; they are not public SEO landing pages.

