import "../env.js";
import { eq } from "drizzle-orm";
import type { ListingMedia } from "@gems/schemas";
import { databaseClient, db, requireDatabase } from "../db/index.js";
import { listings } from "../db/schema.js";
import { ensureListingCardThumbnail } from "../storage.js";

const CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.THUMBNAIL_BACKFILL_CONCURRENCY ?? 3)));

async function main() {
  requireDatabase();
  const rows = await db.select({ id: listings.id, media: listings.media }).from(listings);
  let cursor = 0;
  let updated = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      let changed = false;
      const media: ListingMedia[] = [];
      for (const item of row.media) {
        if (item.kind !== "photo" || item.thumbnailKey) {
          media.push(item);
          continue;
        }
        try {
          media.push({ ...item, ...await ensureListingCardThumbnail(item.id) });
          changed = true;
        } catch (error) {
          console.warn(`Skipping thumbnail for ${item.id}`, error);
          media.push(item);
        }
      }
      if (changed) {
        await db.update(listings).set({ media, updatedAt: new Date() }).where(eq(listings.id, row.id));
        updated += 1;
      }
    }
  }));
  await databaseClient.notify("marketplace_invalidation", "thumbnail-backfill");
  console.log(`Thumbnail backfill updated ${updated} listings.`);
  await databaseClient.end();
}

void main().catch(async (error) => {
  console.error(error);
  await databaseClient.end().catch(() => undefined);
  process.exitCode = 1;
});
