#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

required AZURE_SUBSCRIPTION_ID
required AZURE_RESOURCE_GROUP
required AZURE_LOCATION
required AZURE_APP_NAME
required POSTGRES_ADMIN_LOGIN
required POSTGRES_ADMIN_PASSWORD
required ADMIN_EMAIL
required ADMIN_PASSWORD
required ADMIN_SESSION_SECRET

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is not installed. Install it first: https://learn.microsoft.com/cli/azure/install-azure-cli-macos" >&2
  exit 1
fi

az account show >/dev/null 2>&1 || az login
az account set --subscription "${AZURE_SUBSCRIPTION_ID}"

az group create \
  --name "${AZURE_RESOURCE_GROUP}" \
  --location "${AZURE_LOCATION}"

DEPLOYMENT_JSON="$(mktemp)"
FIREBASE_JSON_CONTENT=$(jq -c . "${ROOT_DIR}/apps/web/server/firebase-service-account.json" 2>/dev/null || echo "{}")
ADMIN_FIREBASE_JSON_CONTENT=$(jq -c . "${ROOT_DIR}/apps/web/server/admin-firebase-service-account.json" 2>/dev/null || echo "{}")

az deployment group create \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --template-file "${ROOT_DIR}/infra/main.bicep" \
  --parameters \
    environmentName="${AZURE_ENVIRONMENT_NAME:-dev}" \
    location="${AZURE_LOCATION}" \
    appName="${AZURE_APP_NAME}" \
    postgresAdminLogin="${POSTGRES_ADMIN_LOGIN}" \
    postgresAdminPassword="${POSTGRES_ADMIN_PASSWORD}" \
    adminEmail="${ADMIN_EMAIL}" \
    adminPassword="${ADMIN_PASSWORD}" \
    adminSessionSecret="${ADMIN_SESSION_SECRET}" \
    firebaseServiceAccount="${FIREBASE_JSON_CONTENT}" \
    adminFirebaseServiceAccount="${ADMIN_FIREBASE_JSON_CONTENT}" \
  --output json > "${DEPLOYMENT_JSON}"

WEB_APP_NAME="$(node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(d.properties.outputs.webAppName.value)" "${DEPLOYMENT_JSON}")"
WEB_APP_URL="$(node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(d.properties.outputs.webAppUrl.value)" "${DEPLOYMENT_JSON}")"
KEY_VAULT_NAME="$(node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(d.properties.outputs.keyVaultName.value)" "${DEPLOYMENT_JSON}")"

echo "Provisioned Azure resources."
echo "Web App: ${WEB_APP_NAME}"
echo "URL: ${WEB_APP_URL}"
echo "Key Vault: ${KEY_VAULT_NAME}"

cd "${ROOT_DIR}"
npm run build

ARTIFACT="${ROOT_DIR}/.azure-deploy.zip"
rm -f "${ARTIFACT}"
zip -qr "${ARTIFACT}" \
  package.json package-lock.json \
  apps packages \
  -x "apps/web/node_modules/*" "node_modules/*"

az webapp deploy \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${WEB_APP_NAME}" \
  --src-path "${ARTIFACT}" \
  --type zip

echo "Deployment complete."
echo "Open: ${WEB_APP_URL}"
echo "Run database migration against the live DATABASE_URL before first use:"
echo "  export DATABASE_URL=\"\$(az keyvault secret show --vault-name ${KEY_VAULT_NAME} --name DATABASE-URL --query value -o tsv)\""
echo "  npm run db:migrate --workspace @gems/web"
echo "  npm run db:seed --workspace @gems/web"
