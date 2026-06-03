import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env.azure.local"));
} catch {}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  }
});
