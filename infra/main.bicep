targetScope = 'resourceGroup'

@description('Short lowercase environment name, for example dev, staging, or prod.')
param environmentName string = 'dev'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Globally unique-ish application base name. Lowercase letters and numbers are safest.')
param appName string

@description('PostgreSQL administrator username.')
param postgresAdminLogin string

@secure()
@description('PostgreSQL administrator password.')
param postgresAdminPassword string

@description('Admin email for the existing separate admin login.')
param adminEmail string

@secure()
@description('Admin password for the existing separate admin login.')
param adminPassword string

@secure()
@description('Long random secret used to sign admin sessions.')
param adminSessionSecret string

@secure()
@description('Firebase Admin Service Account JSON string.')
param firebaseServiceAccount string

@secure()
@description('Admin Firebase Service Account JSON string.')
param adminFirebaseServiceAccount string

@description('Stripe publishable key. Leave blank to keep Stripe disabled.')
param stripePublishableKey string = ''

@secure()
@description('Stripe secret key. Leave blank to keep Stripe disabled.')
param stripeSecretKey string = ''

@description('Stripe charge currency. LKR keeps listing prices in native currency.')
param stripeCurrency string = 'LKR'

@description('Number of LKR represented by one Stripe charge-currency unit when STRIPE_CURRENCY is not LKR.')
param stripeLkrPerUnit string = ''

@secure()
@description('Stripe webhook signing secret for /api/v1/payments/stripe/webhook.')
param stripeWebhookSecret string = ''

@description('Public origin used for Stripe Checkout success and cancel URLs. Defaults to the Azure Web App URL.')
param publicSiteUrl string = ''

@description('PostgreSQL SKU. Standard_B1ms is low-cost for dev.')
param postgresSkuName string = 'Standard_B1ms'

@description('App Service SKU. B1 is a small production-capable starter.')
param appServiceSkuName string = 'B1'

var suffix = uniqueString(resourceGroup().id, appName, environmentName)
var normalizedApp = toLower('${appName}-${environmentName}')
var webAppName = take('${normalizedApp}-${suffix}', 60)
var appServicePlanName = '${normalizedApp}-plan'
var postgresServerName = take(replace('${normalizedApp}-pg-${suffix}', '-', ''), 63)
var postgresDatabaseName = 'gems'
var storageAccountName = take(replace('${normalizedApp}st${suffix}', '-', ''), 24)
var storageContainerName = 'user-uploads'
var keyVaultName = take('${normalizedApp}-kv-${suffix}', 24)
var workspaceName = '${normalizedApp}-logs'
var appInsightsName = '${normalizedApp}-appi'
var postgresHost = '${postgresServerName}.postgres.database.azure.com'
var databaseUrl = 'postgres://${postgresAdminLogin}:${postgresAdminPassword}@${postgresHost}:5432/${postgresDatabaseName}?sslmode=require'
var effectivePublicSiteUrl = empty(publicSiteUrl) ? 'https://${webAppName}.azurewebsites.net' : publicSiteUrl

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource uploadContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: storageContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: postgresSkuName
    tier: contains(postgresSkuName, '_B') ? 'Burstable' : 'GeneralPurpose'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: postgresDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServiceSkuName
  }
  properties: {
    reserved: true
  }
  kind: 'linux'
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: appServiceSkuName == 'F1' ? false : true
      appCommandLine: 'node apps/web/server-dist/server.js'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(SecretUri=${databaseUrlSecret.properties.secretUri})'
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${storageConnectionSecret.properties.secretUri})'
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_NAME'
          value: storageContainerName
        }
        {
          name: 'ADMIN_EMAIL'
          value: adminEmail
        }
        {
          name: 'ADMIN_PASSWORD'
          value: '@Microsoft.KeyVault(SecretUri=${adminPasswordSecret.properties.secretUri})'
        }
        {
          name: 'ADMIN_SESSION_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${adminSessionSecretSecret.properties.secretUri})'
        }
        {
          name: 'FIREBASE_SERVICE_ACCOUNT'
          value: '@Microsoft.KeyVault(SecretUri=${firebaseServiceAccountSecret.properties.secretUri})'
        }
        {
          name: 'ADMIN_FIREBASE_SERVICE_ACCOUNT'
          value: '@Microsoft.KeyVault(SecretUri=${adminFirebaseServiceAccountSecret.properties.secretUri})'
        }
        {
          name: 'STRIPE_PUBLISHABLE_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${stripePublishableKeySecret.properties.secretUri})'
        }
        {
          name: 'STRIPE_SECRET_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${stripeSecretKeySecret.properties.secretUri})'
        }
        {
          name: 'STRIPE_CURRENCY'
          value: stripeCurrency
        }
        {
          name: 'STRIPE_LKR_PER_UNIT'
          value: stripeLkrPerUnit
        }
        {
          name: 'STRIPE_WEBHOOK_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${stripeWebhookSecretSecret.properties.secretUri})'
        }
        {
          name: 'PUBLIC_SITE_URL'
          value: effectivePublicSiteUrl
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    accessPolicies: []
  }
}

resource keyVaultAccess 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: tenant().tenantId
        objectId: webApp.identity.principalId
        permissions: {
          secrets: [
            'get'
            'list'
          ]
        }
      }
    ]
  }
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'DATABASE-URL'
  properties: {
    value: databaseUrl
  }
}

resource storageConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-STORAGE-CONNECTION-STRING'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
  }
}

resource adminPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ADMIN-PASSWORD'
  properties: {
    value: adminPassword
  }
}

resource adminSessionSecretSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ADMIN-SESSION-SECRET'
  properties: {
    value: adminSessionSecret
  }
}

resource firebaseServiceAccountSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'FIREBASE-SERVICE-ACCOUNT'
  properties: {
    value: firebaseServiceAccount
  }
}

resource adminFirebaseServiceAccountSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ADMIN-FIREBASE-SERVICE-ACCOUNT'
  properties: {
    value: adminFirebaseServiceAccount
  }
}

resource stripePublishableKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'STRIPE-PUBLISHABLE-KEY'
  properties: {
    value: stripePublishableKey
  }
}

resource stripeSecretKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'STRIPE-SECRET-KEY'
  properties: {
    value: stripeSecretKey
  }
}

resource stripeWebhookSecretSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'STRIPE-WEBHOOK-SECRET'
  properties: {
    value: stripeWebhookSecret
  }
}

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output postgresServerName string = postgres.name
output postgresDatabaseName string = postgresDatabase.name
output storageAccountName string = storage.name
output storageContainerName string = uploadContainer.name
output keyVaultName string = keyVault.name
output appInsightsName string = appInsights.name
