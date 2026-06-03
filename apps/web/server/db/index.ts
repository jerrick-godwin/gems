import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
export const hasDatabase = Boolean(connectionString);

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Database operations will fail unless mocked.");
}

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString || "", { 
  prepare: false,
  onnotice: () => {} 
});
export const db = drizzle(client, { schema });
