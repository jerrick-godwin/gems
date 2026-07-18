# Gems Marketplace

Gems Marketplace is a full-stack marketplace for gem buyers and sellers. It combines a server-rendered public marketplace, authenticated seller tools, listing subscriptions, and a separate moderation console in one TypeScript npm workspace.

## Features

- Public gem discovery, search, filters, listing details, and seller contact flows
- Buyer and seller accounts with profiles, reports, listing management, and a 14-day trial
- Guided listing creation with image uploads and subscription checkout
- Stripe Billing subscriptions with hosted Checkout, webhook processing, and receipts
- Admin moderation for listings, sellers, reports, orders, payments, trials, and promotions
- Server-side rendering for public pages and marketplace SEO
- PostgreSQL persistence with Drizzle ORM and versioned migrations
- Local filesystem uploads for development and Azure Blob Storage in production

## Technology

- React 18 and Vite 6
- Node.js and TypeScript
- PostgreSQL and Drizzle ORM
- Firebase Authentication and Firebase Admin
- Stripe Billing
- Azure App Service, PostgreSQL, Blob Storage, Key Vault, and Application Insights

## Repository Layout

```text
apps/web/             React clients, SSR entry points, Node API, and database code
packages/api-client/  Shared API client helpers
packages/schemas/     Shared domain schemas and validation
packages/ui/          Shared React hooks and UI utilities
infra/                Azure Bicep infrastructure
scripts/              Provisioning and maintenance scripts
docs/                 Azure migration and live setup guides
```

## Prerequisites

- Node.js 24 or newer
- npm 10 or newer
- PostgreSQL

Firebase, Stripe, and Azure Storage are optional for basic local development, but are required to exercise their corresponding production flows.

## Getting Started

Install the workspace dependencies:

```bash
npm install
```

Create the browser configuration file:

```bash
cp apps/web/.env.example apps/web/.env
```

The placeholder Firebase values can remain in place for basic buyer/seller development. When public Firebase is not configured, development builds use browser-local accounts and development tokens. Password-reset emails and the admin console still require Firebase.

Create `.env.azure.local` in the repository root for backend configuration. At minimum, add a PostgreSQL connection string:

```dotenv
DATABASE_URL=postgresql://user:password@localhost:5432/gems_marketplace
PUBLIC_SITE_URL=http://127.0.0.1:4100
```

Apply the migrations and seed the reference data:

```bash
npm run db:migrate --workspace @gems/web
npm run db:seed --workspace @gems/web
```

Start the public app and API:

```bash
npm run dev
```

The development monolith is available at:

- Public app: `http://127.0.0.1:4100`
- Admin app: `http://127.0.0.1:4100/admin`
- API: `http://127.0.0.1:4100/api/v1`

For a standalone admin Vite server with faster frontend iteration, keep the backend running and start this in a second terminal:

```bash
npm run dev:admin
```

The standalone admin app runs at `http://127.0.0.1:4200` and calls the API on port `4100`.

## Environment Configuration

Browser variables belong in `apps/web/.env`. They are embedded into the Vite client bundles and must use the `VITE_` prefix.

| Variable group | Purpose |
| --- | --- |
| `VITE_FIREBASE_*` | Buyer and seller Firebase web app |
| `VITE_ADMIN_FIREBASE_*` | Admin Firebase web app |
| `VITE_API_BASE_URL` | API origin used by the standalone admin app |

Backend variables belong in the root `.env.azure.local` for local development or in the deployment environment in production.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; required |
| `FIREBASE_SERVICE_ACCOUNT` | Buyer/seller Firebase service-account JSON |
| `ADMIN_FIREBASE_SERVICE_ACCOUNT` | Admin Firebase service-account JSON |
| `ADMIN_ALLOWED_EMAILS` | Comma-separated admin allowlist; tokens must also carry `admin: true` |
| `PUBLIC_SITE_URL` | Canonical public origin and Stripe return URL base |
| `GOOGLE_SITE_VERIFICATION` | Optional Google Search Console URL-prefix verification token |
| `BING_SITE_VERIFICATION` | Optional Bing Webmaster Tools verification token |
| `INDEXNOW_KEY` | Optional 8–128 character IndexNow key used for listing-change notifications |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key returned to the browser |
| `STRIPE_SECRET_KEY` | Stripe server API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_CURRENCY` | Charge currency; defaults to `LKR` |
| `STRIPE_LKR_PER_UNIT` | LKR conversion rate when charging in another currency |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Optional Stripe Customer Portal configuration |
| `PAYMENT_RETURN_SECRET` | HMAC secret for expiring Checkout cancel callbacks |
| `STORAGE_CAPABILITY_SECRET` | HMAC secret for local upload capabilities |
| `AZURE_STORAGE_CONNECTION_STRING` | Enables Azure Blob Storage uploads |
| `AZURE_STORAGE_CONTAINER_NAME` | Blob container; defaults to `user-uploads` |
| `LOCAL_UPLOADS_DIR` | Optional local upload directory override |
| `PORT` / `HOST` | Server bind settings; defaults to `4100` / `0.0.0.0` |

## Search Engine Setup

The public server renders crawlable marketplace, landing, gemstone category, and listing pages. It also generates the live sitemap at `/sitemap.xml`. After deployment:

1. Verify `gemslanka.lk` in Google Search Console (DNS domain verification is preferred) and submit `https://gemslanka.lk/sitemap.xml`.
2. Verify or import the property in Bing Webmaster Tools and submit the same sitemap.
3. Set `INDEXNOW_KEY` to enable automatic IndexNow notifications when public listing state changes. The server exposes the required key file at `/<key>.txt`.
4. Inspect the homepage, one `/gemstones/:slug` category, and one `/listings/:id` URL in both webmaster tools. Validate listing schema with Google's Rich Results Test and the Schema.org validator.

Search engines choose titles, site names, rich results, and sitelinks algorithmically. The application provides the technical signals and internal structure, but cannot guarantee a particular search-result layout.

Never commit either local environment file or Firebase service-account JSON.

## Authentication

Buyer and seller authentication uses the public Firebase project. Configure its `VITE_FIREBASE_*` browser values and provide `FIREBASE_SERVICE_ACCOUNT` to the backend for real token verification.

Admin authentication uses a separate Firebase project. Configure `VITE_ADMIN_FIREBASE_*` and `ADMIN_FIREBASE_SERVICE_ACCOUNT`. Email/Password sign-in must be enabled in Firebase, and each local or deployed hostname must be listed as an authorized domain.

Service-account variables contain the complete JSON document, not the public Firebase web configuration.

## Stripe Setup

Listing plans use recurring Stripe Checkout subscriptions: Basic renews monthly, Pro every two months, and Plus every three months.

Create a webhook endpoint at:

```text
https://your-domain.example/api/v1/payments/stripe/webhook
```

Subscribe it to these events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
invoice.payment_action_required
invoice.finalization_failed
invoice.created
invoice.finalized
invoice.updated
invoice.voided
invoice.marked_uncollectible
customer.subscription.updated
customer.subscription.deleted
customer.subscription.created
```

If `STRIPE_CURRENCY` is not `LKR`, set `STRIPE_LKR_PER_UNIT` so LKR listing prices can be converted to the Stripe charge currency.

## Common Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the Node API, SSR, and Vite middleware |
| `npm run dev:admin` | Run the standalone admin frontend on port `4200` |
| `npm run typecheck` | Type-check every workspace package |
| `npm test` | Run schema, server, SSR, and shared-type tests |
| `npm run build` | Build schemas, clients, SSR, and the production server |
| `npm start` | Start the built production server |
| `npm run db:migrate --workspace @gems/web` | Apply PostgreSQL migrations |
| `npm run db:seed --workspace @gems/web` | Seed gem types, plans, and merchant details |
| `npm run thumbnails:backfill --workspace @gems/web` | Backfill listing thumbnail metadata |

Run the full local verification suite with:

```bash
npm run typecheck
npm test
npm run build
```

## Production and Azure

Build and run the production monolith:

```bash
npm run build
npm start
```

The repository includes Bicep infrastructure and an Azure provisioning script. See:

- [Azure migration overview](docs/azure-migration.md)
- [Azure live setup guide](docs/azure-live-setup.md)

The root package is intentionally private because this repository is an application workspace, not an npm package intended for publication.
