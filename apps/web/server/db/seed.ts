import "../env.js";
import { sql } from "drizzle-orm";
import { db, hasDatabase } from "./index.js";
import { worldwideGemTypes } from "./gem-catalog.js";
import { gemTypes } from "./schema.js";

if (!hasDatabase) {
  throw new Error("DATABASE_URL is required to seed PostgreSQL.");
}

await db.insert(gemTypes)
  .values(worldwideGemTypes)
  .onConflictDoUpdate({
    target: gemTypes.id,
    set: {
      name: sql`excluded.name`,
      slug: sql`excluded.slug`,
      colorHint: sql`excluded.color_hint`
    }
  });

console.log("Seeded gem types into PostgreSQL.");
process.exit(0);
