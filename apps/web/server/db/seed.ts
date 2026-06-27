import "../env.js";
import { sql } from "drizzle-orm";
import { db, hasDatabase } from "./index.js";
import { worldwideGemTypes } from "./gem-catalog.js";
import { gemTypes, subscriptionPlans } from "./schema.js";

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

await db.insert(subscriptionPlans)
  .values([
    { id: "basic", name: "Basic", priceLkr: 500, includedPhotos: 3, extraPhotoPriceLkr: 250, validityMonths: 1, eyebrow: "Starter", summary: "Simple listing for a quick one-month post" },
    { id: "pro", name: "Pro", priceLkr: 1000, includedPhotos: 6, extraPhotoPriceLkr: 500, validityMonths: 2, eyebrow: "Recommended", summary: "Best value for richer gem presentation" },
    { id: "plus", name: "Plus", priceLkr: 20000, includedPhotos: 10, extraPhotoPriceLkr: 500, validityMonths: 3, eyebrow: "Premium", summary: "Longer visibility with the largest photo set" }
  ])
  .onConflictDoUpdate({
    target: subscriptionPlans.id,
    set: {
      name: sql`excluded.name`,
      priceLkr: sql`excluded.price_lkr`,
      includedPhotos: sql`excluded.included_photos`,
      extraPhotoPriceLkr: sql`excluded.extra_photo_price_lkr`,
      validityMonths: sql`excluded.validity_months`,
      eyebrow: sql`excluded.eyebrow`,
      summary: sql`excluded.summary`
    }
  });

console.log("Seeded subscription plans into PostgreSQL.");

process.exit(0);
