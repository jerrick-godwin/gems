# Azure Migration

This repository includes the infrastructure and runtime hooks needed to move the Gems Marketplace from local JSON-backed development to Azure-hosted storage and PostgreSQL.

## Architecture

- Azure App Service runs the Node/Vite monolith from `apps/web`.
- Azure Database for PostgreSQL stores marketplace, account, checkout, and moderation data through Drizzle migrations.
- Azure Blob Storage stores user-uploaded listing assets through server-issued upload URLs.
- Azure Key Vault stores generated connection strings, admin credentials, session secrets, and Firebase Admin service-account JSON.
- Application Insights and Log Analytics are provisioned for operational visibility.

## Runtime Data Path

The backend chooses persistence from environment variables:

- When `DATABASE_URL` is set, the marketplace and user repositories use PostgreSQL.
- `DATABASE_URL` is required; runtime marketplace and user data are fetched from PostgreSQL.
- When `AZURE_STORAGE_CONNECTION_STRING` is set, listing image upload URLs are backed by Azure Blob Storage.

## Migration Checklist

1. Create Firebase web apps for the buyer/seller app and admin app.
2. Place Firebase Admin service-account JSON files locally at:
   - `apps/web/server/firebase-service-account.json`
   - `apps/web/server/admin-firebase-service-account.json`
3. Copy `.env.azure.example` to `.env.azure.local` and fill in the deployment values.
4. Copy `apps/web/.env.example` to `apps/web/.env` and fill in the Vite Firebase client values used at build time.
5. Run `./scripts/azure-provision.sh`.
6. Run the Drizzle migrations and seed command against the live `DATABASE_URL` printed by the provision script.

Never commit local `.env` files, Azure deployment artifacts, or Firebase service-account JSON.
