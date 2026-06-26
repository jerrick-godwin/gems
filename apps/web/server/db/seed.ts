import "../env.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { MarketplaceDatabase } from "../marketplace-repository.js";
import { db, hasDatabase } from "./index.js";
import { worldwideGemTypes } from "./gem-catalog.js";
import { conversations, gemTypes, listingContacts, listings, locations, reports, savedSearches, sellerProfiles, users } from "./schema.js";

if (!hasDatabase) {
  throw new Error("DATABASE_URL is required to seed PostgreSQL.");
}

const databaseUrl = new URL("./database.json", import.meta.url);
const database = JSON.parse(await readFile(fileURLToPath(databaseUrl), "utf8")) as MarketplaceDatabase;

const usersToSeed = seedUsers();
if (usersToSeed.length > 0) await db.insert(users).values(usersToSeed).onConflictDoNothing();
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
if (database.sellers.length > 0) await db.insert(sellerProfiles).values(database.sellers).onConflictDoNothing();

const locationsToSeed = database.locations.map(location => ({
  id: location.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  name: location
}));
if (locationsToSeed.length > 0) await db.insert(locations).values(locationsToSeed).onConflictDoNothing();

const listingsToSeed = database.listings.map((listing) => ({
  ...listing,
  publishedAt: listing.publishedAt ? new Date(listing.publishedAt) : null,
  expiresAt: listing.expiresAt ? new Date(listing.expiresAt) : null
}));
if (listingsToSeed.length > 0) await db.insert(listings).values(listingsToSeed).onConflictDoNothing();

const contactsToSeed = Object.entries(database.listingContacts).map(([listingId, contact]) => ({
  listingId,
  phone: contact.phone,
  remainingReveals: contact.remainingReveals
}));
if (contactsToSeed.length > 0) await db.insert(listingContacts).values(contactsToSeed).onConflictDoNothing();

const convsToSeed = database.conversations.map((conversation) => ({
  ...conversation,
  updatedAt: new Date(conversation.updatedAt)
}));
if (convsToSeed.length > 0) await db.insert(conversations).values(convsToSeed).onConflictDoNothing();

if (database.reports.length > 0) await db.insert(reports).values(database.reports).onConflictDoNothing();

const searchesToSeed = database.savedSearches.map((search) => ({ ...search, userId: null }));
if (searchesToSeed.length > 0) await db.insert(savedSearches).values(searchesToSeed).onConflictDoNothing();

console.log("Seeded marketplace data into PostgreSQL.");
process.exit(0);

function seedUsers() {
  const now = new Date();
  return database.sellers.map((seller, index) => ({
    id: seller.userId,
    name: seller.displayName,
    email: `seed-seller-${index + 1}@example.com`,
    phone: "",
    address: seller.location,
    role: "verified_seller" as const,
    locale: "en",
    status: "active",
    createdAt: now,
    updatedAt: now
  }));
}
