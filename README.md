# Gems Marketplace

Gems Marketplace is a Gem inquiry marketplace for Global buyers and sellers. The repo is a TypeScript npm workspace with a Node-hosted Vite/React app, shared schemas, API-client helpers, and Azure deployment infrastructure.

## What Is Included

- Buyer marketplace, account flows, cart, checkout reservation, and listing creation in `apps/web`
- Seller dashboard, post-gem flow, and monetization panels
- Separate admin moderation panel with its own Firebase/admin session flow
- Node API and production server bundle in `apps/web/server`
- Shared domain schemas in `packages/schemas`
- Shared React utilities in `packages/ui`
- API client helpers in `packages/api-client`
- Local JSON seed database fallback at `apps/web/server/db/database.json`
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

The app can run without `DATABASE_URL` for local development. In that mode, marketplace records fall back to `apps/web/server/db/database.json` and user records use an in-memory store.

## Run

Start the public app and API:

```bash
npm run dev
```

The monolith runs one Node process with Vite middleware in development. It serves the web app and `/api/v1` endpoints from the same origin.

Run the admin panel in a second terminal after the backend is running:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me ADMIN_SESSION_SECRET=local-secret npm run dev
npm run dev:admin
```

The public web app and API run on `http://127.0.0.1:4100`. The admin panel runs on `http://127.0.0.1:4200` and calls the protected admin API on `4100`.

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

Admin login is separate from buyer/seller access. Configure these environment variables on the backend process before using `/api/v1/admin/*`:

```bash
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=replace-with-a-long-random-secret
```

The admin panel stores the returned bearer token in local storage and sends it to protected admin endpoints. Public marketplace snapshots only include approved listings and do not include reports.

## Data

When `DATABASE_URL` is set, runtime marketplace and user records are read from PostgreSQL through Drizzle. Without `DATABASE_URL`, local development falls back to `apps/web/server/db/database.json` plus an in-memory user store.

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
