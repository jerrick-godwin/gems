import { resolve } from "node:path";
try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env.azure.local"));
} catch {}
