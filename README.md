# Gems Marketplace

Gems Marketplace is a Gem inquiry marketplace for Global buyers and sellers. The repo is a TypeScript npm workspace with a Node-hosted Vite/React app, shared schemas, API-client helpers, and Azure deployment infrastructure.

## What Is Included

- Buyer marketplace, account flows, cart, checkout reservation, and listing creation in `apps/web`
- Post-gem flow, seller listings, and monetization panels
- Separate admin moderation panel with its own Firebase/admin session flow
- Node API and production server bundle in `apps/web/server`
- Shared domain schemas in `packages/schemas`
- Shared React utilities in `packages/ui`
- API client helpers in `packages/api-client`
- Drizzle migrations for PostgreSQL
- Azure App Service, PostgreSQL, Blob Storage, Key Vault, and monitoring infrastructure in `infra`

## Requirements

- Node.js 20
- npm

## Local Setup

Install dependencies:

```bash
npm install
```

Copy and configure local browser environment variables:

```bash
cp apps/web/.env.example apps/web/.env
```

The app requires `DATABASE_URL` for local development and production. Runtime marketplace and user records are read from PostgreSQL through Drizzle.

Password reset emails and admin sign-in are sent through Firebase Authentication, so local reset links and admin login only work after the public buyer/seller and admin Firebase web config values are set in `apps/web/.env`:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ADMIN_FIREBASE_API_KEY=...
VITE_ADMIN_FIREBASE_AUTH_DOMAIN=...
VITE_ADMIN_FIREBASE_PROJECT_ID=...
VITE_ADMIN_FIREBASE_APP_ID=...
```

After changing these values, restart `npm run dev`. In the Firebase console, make sure Email/Password sign-in is enabled and your local or production domain is listed under Authentication authorized domains.

## Run

Start the public app and API:

```bash
npm run dev
```

The monolith runs one Node process with Vite middleware in development. It serves the web app and `/api/v1` endpoints from the same origin.

Run the admin panel in a second terminal after the backend is running if you want a standalone admin dev server:

```bash
npm run dev:admin
```

The public web app and API run on `http://127.0.0.1:4100`; the same server also serves `/admin`. The standalone admin panel runs on `http://127.0.0.1:4200` and calls the protected admin API on `4100`.

## Quality Checks

```bash
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same checks on pushes to `main` and pull requests.

## Production Build

Build and run the production monolith:

```bash
npm run build
npm start
```

## Admin auth

Admin login is separate from buyer/seller access and uses the admin Firebase project. Configure the admin Firebase web app values for the browser build:

```bash
VITE_ADMIN_FIREBASE_API_KEY=...
VITE_ADMIN_FIREBASE_AUTH_DOMAIN=...
VITE_ADMIN_FIREBASE_PROJECT_ID=...
VITE_ADMIN_FIREBASE_STORAGE_BUCKET=...
VITE_ADMIN_FIREBASE_MESSAGING_SENDER_ID=...
VITE_ADMIN_FIREBASE_APP_ID=...
VITE_ADMIN_FIREBASE_MEASUREMENT_ID=...
```

The admin panel stores the Firebase ID token in local storage and sends it to protected admin endpoints. Public marketplace snapshots only include approved listings and do not include reports.

## Listing Payments

The listing-subscription payment flow uses Stripe Billing through hosted Checkout. Basic renews monthly, Pro renews every 2 months, and Plus renews every 3 months.

Configure Stripe on the backend process:

```bash
STRIPE_PUBLISHABLE_KEY=replace-with-stripe-publishable-key
STRIPE_SECRET_KEY=replace-with-stripe-secret-key
STRIPE_WEBHOOK_SECRET=replace-with-stripe-webhook-signing-secret
STRIPE_CURRENCY=LKR
PUBLIC_SITE_URL=https://gemslanka.lk
```

To charge in a different Stripe currency while keeping listing prices in LKR internally, set `STRIPE_CURRENCY` and `STRIPE_LKR_PER_UNIT`.

Create a Stripe webhook endpoint at:

```text
https://your-domain.example/api/v1/payments/stripe/webhook
```

Subscribe it to:

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
customer.subscription.updated
customer.subscription.deleted
```

## Data

Runtime marketplace and user records are read from PostgreSQL through Drizzle. Set `DATABASE_URL` before starting the API.

Use these database commands from the repository root:

```bash
npm run db:migrate --workspace @gems/web
npm run db:seed --workspace @gems/web
```

## Customer Auth and Azure

The buyer/seller app uses Firebase Authentication. The web client initializes Firebase in `apps/web/src/firebase.ts`, and the backend verifies Firebase ID tokens with Firebase Admin in `apps/web/server/auth.ts`.

Configure the backend with:

```bash
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER_NAME=user-uploads
```

The Azure rollout plan is documented in `docs/azure-migration.md`.
The step-by-step live setup guide is documented in `docs/azure-live-setup.md`.

## Repository Hygiene

- Do not commit `.env` files, local Azure env files, deployment zip artifacts, or Firebase service-account JSON.
- Keep public browser Firebase config in `apps/web/.env`; keep Firebase Admin service-account JSON in environment variables or ignored local files.
- The root package is marked `private` because this is an application workspace, not a package intended for npm publication.
