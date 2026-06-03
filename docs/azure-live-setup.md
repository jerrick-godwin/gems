# Azure Live Setup

Use this guide when provisioning a live Azure environment from a fresh checkout.

## Prerequisites

- Node.js 20
- npm
- Azure CLI signed in to the target tenant
- `jq`
- `zip`
- Firebase Admin service-account JSON for the buyer/seller Firebase project
- Firebase Admin service-account JSON for the admin Firebase project

## Configure Local Environment

Copy the Azure environment template:

```bash
cp .env.azure.example .env.azure.local
```

Edit `.env.azure.local` with real values for the Azure subscription, resource names, PostgreSQL admin account, and admin login.

Copy the Vite client environment template:

```bash
cp apps/web/.env.example apps/web/.env
```

Fill in both Firebase web app configs. These values are embedded into the built browser bundle by Vite.

## Provision and Deploy

Load the Azure environment variables, then run the provision script:

```bash
set -a
source .env.azure.local
set +a
./scripts/azure-provision.sh
```

The script creates the Azure resource group resources, builds the app, zips the deployable files, and deploys the web app.

## Initialize Database

After deployment, fetch the generated PostgreSQL connection string from Key Vault and run migrations:

```bash
export DATABASE_URL="$(az keyvault secret show --vault-name <key-vault-name> --name DATABASE-URL --query value -o tsv)"
npm run db:migrate --workspace @gems/web
npm run db:seed --workspace @gems/web
```

Replace `<key-vault-name>` with the Key Vault name printed by the provision script.

## Operational Notes

- App Service starts the production server with `node apps/web/server-dist/server.js`.
- The Bicep template stores sensitive runtime values in Key Vault and wires App Service settings to Key Vault references.
- Firebase Admin service-account JSON is read from App Service environment variables in production.
- Local credential files and `.env` files are intentionally ignored by Git.
