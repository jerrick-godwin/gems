import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Conversation, Listing, MarketplaceContent, PaginatedResponse, PromotionCampaign, PromotionType, Report, SavedSearch, SellerProfile } from "@gems/schemas";
import { eq, ne, and, or, ilike, desc, asc, sql, inArray } from "drizzle-orm";
import { db, hasDatabase } from "./db/index.js";
import {
  cartItems as cartItemTable,
  conversations as conversationTable,
  gemTypes as gemTypeTable,
  listingContacts as listingContactTable,
  listingMedia as listingMediaTable,
  listings as listingTable,
  locations as locationsTable,
  reports as reportTable,
  savedSearches as savedSearchTable,
  sellerProfiles as sellerProfileTable
} from "./db/schema.js";
import { createSignedReadUrl } from "./storage.js";

export interface ListingContact {
  phone: string;
  remainingReveals: number;
}


export interface MarketplaceDatabase {
  locations: string[];
  listings: Listing[];
  sellers: SellerProfile[];
  conversations: Conversation[];
  reports: Report[];
  savedSearches: SavedSearch[];
  listingContacts: Record<string, ListingContact>;
  content: MarketplaceContent;
}

let cachedDatabase: MarketplaceDatabase | undefined;

export async function getMutableMarketplaceDatabase() {
  if (cachedDatabase) return cachedDatabase;
  const databaseUrl = new URL("./db/database.json", import.meta.url);
  cachedDatabase = JSON.parse(await readFile(fileURLToPath(databaseUrl), "utf8")) as MarketplaceDatabase;
  return cachedDatabase;
}

export async function getMarketplaceSnapshot() {
  if (hasDatabase) {
    const [gemTypeRows, listingRows, sellerRows, conversationRows, savedSearchRows, locationRows] = await Promise.all([
      db.select().from(gemTypeTable).orderBy(asc(gemTypeTable.name)),
      db.select().from(listingTable).where(and(eq(listingTable.moderationStatus, "approved"), sql`(${listingTable.expiresAt} is null or ${listingTable.expiresAt} > now())`)),
      db.select().from(sellerProfileTable),
      db.select().from(conversationTable),
      db.select().from(savedSearchTable),
      db.select().from(locationsTable)
    ]);
    return {
      gemTypes: gemTypeRows,
      locations: locationRows.map((row) => row.name),
      listings: listingRows.map(toListing),
      sellers: sellerRows.map(toSellerProfile),
      conversations: conversationRows.map(toConversation),
      savedSearches: savedSearchRows.map(toSavedSearch),
      content: emptyMarketplaceContent()
    };
  }

  throw new Error("DATABASE_URL is required to load marketplace gem types.");
}

export async function getGemTypes() {
  if (!hasDatabase) throw new Error("DATABASE_URL is required to load gem types.");
  return db.select().from(gemTypeTable).orderBy(asc(gemTypeTable.name));
}

export async function getLocations() {
  if (hasDatabase) {
    const rows = await db.select().from(locationsTable);
    return rows.map((row) => row.name);
  }
  const database = await getMutableMarketplaceDatabase();
  return database.locations;
}

export async function getListings(filters: { gemType?: string; location?: string } = {}) {
  if (hasDatabase) {
    const rows = await db.select().from(listingTable).where(and(eq(listingTable.moderationStatus, "approved"), sql`(${listingTable.expiresAt} is null or ${listingTable.expiresAt} > now())`));
    return rows
      .filter((listing) => (!filters.gemType || listing.gemTypeId === filters.gemType) && (!filters.location || listing.location === filters.location))
      .map(toListing);
  }

  const listings = (await getMutableMarketplaceDatabase()).listings.filter(isPublicListing);
  return listings.filter((listing) => {
    return (!filters.gemType || listing.gemTypeId === filters.gemType) && (!filters.location || listing.location === filters.location);
  });
}

export async function searchListings(params: {
  query?: string;
  gemType?: string;
  location?: string;
  treatment?: string;
  certificate?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Listing>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, params.limit || 20);
  const offset = (page - 1) * limit;

  if (hasDatabase) {
    const conditions = [eq(listingTable.moderationStatus, "approved"), sql`(${listingTable.expiresAt} is null or ${listingTable.expiresAt} > now())`];

    if (params.query) {
      const q = `%${params.query}%`;
      conditions.push(
        or(
          ilike(listingTable.title, q),
          ilike(listingTable.location, q),
          sql`attributes->>'origin' ILIKE ${q}`,
          sql`${listingTable.gemTypeId} in (
            select ${gemTypeTable.id}
            from ${gemTypeTable}
            where ${gemTypeTable.name} ilike ${q}
              or ${gemTypeTable.slug} ilike ${q}
          )`
        )!
      );
    }
    if (params.gemType && params.gemType !== "all") {
      conditions.push(eq(listingTable.gemTypeId, params.gemType));
    }
    if (params.location) {
      const locationList = params.location.split(',');
      if (locationList.length === 1) {
        conditions.push(eq(listingTable.location, locationList[0]));
      } else {
        conditions.push(inArray(listingTable.location, locationList));
      }
    }
    if (params.treatment && params.treatment !== "all") {
      conditions.push(sql`attributes->>'treatment' = ${params.treatment}`);
    }
    if (params.certificate && params.certificate !== "all") {
      conditions.push(sql`attributes->>'certificateStatus' = ${params.certificate}`);
    }

    const whereClause = and(...conditions);

    let orderByClause: any = asc(listingTable.createdAt);
    if (params.sort === "price-low") orderByClause = asc(listingTable.priceLkr);
    if (params.sort === "price-high") orderByClause = desc(listingTable.priceLkr);
    if (params.sort === "newest") orderByClause = desc(listingTable.publishedAt);
    if (params.sort === "featured" || !params.sort) {
      orderByClause = sql`jsonb_array_length(promoted) DESC, (stats->>'views')::int DESC`;
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(listingTable)
      .where(whereClause);
      
    const total = Number(totalResult?.count || 0);

    const rows = await db
      .select()
      .from(listingTable)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(toListing),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Fallback for local JSON database
  const dbData = await getMutableMarketplaceDatabase();
  let matches = dbData.listings.filter((listing) => {
    if (!isPublicListing(listing)) return false;
    
    if (params.query) {
      const q = params.query.toLowerCase();
      const matchesSearch =
        listing.title.toLowerCase().includes(q) ||
        listing.location.toLowerCase().includes(q) ||
        (listing.attributes.origin && listing.attributes.origin.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    if (params.gemType && params.gemType !== "all" && listing.gemTypeId !== params.gemType) return false;
    if (params.location && !params.location.split(',').includes(listing.location)) return false;
    if (params.treatment && params.treatment !== "all" && listing.attributes.treatment !== params.treatment) return false;
    if (params.certificate && params.certificate !== "all" && listing.attributes.certificateStatus !== params.certificate) return false;
    
    return true;
  });

  matches.sort((a, b) => {
    if (params.sort === "price-low") return a.priceLkr - b.priceLkr;
    if (params.sort === "price-high") return b.priceLkr - a.priceLkr;
    if (params.sort === "newest") return String(b.publishedAt).localeCompare(String(a.publishedAt));
    // Default / featured
    return (b.promoted?.length || 0) - (a.promoted?.length || 0) || (b.stats?.views || 0) - (a.stats?.views || 0);
  });

  const total = matches.length;
  const items = matches.slice(offset, offset + limit);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

export async function getListing(listingId: string) {
  if (hasDatabase) {
    const rows = await db.select().from(listingTable).where(eq(listingTable.id, listingId)).limit(1);
    return rows[0] ? toListing(rows[0]) : undefined;
  }
  return (await getMutableMarketplaceDatabase()).listings.find((listing) => listing.id === listingId);
}

export async function revealListingPhone(listingId: string, options: { full?: boolean } = {}) {
  if (hasDatabase) {
    const rows = await db.select().from(listingContactTable).where(eq(listingContactTable.listingId, listingId)).limit(1);
    return rows[0] ? { phone: options.full ? rows[0].phone : maskPhoneNumber(rows[0].phone), remainingReveals: rows[0].remainingReveals } : { phone: "", remainingReveals: 0 };
  }
  const database = await getMutableMarketplaceDatabase();
  const contact = database.listingContacts[listingId];
  return contact ? { ...contact, phone: options.full ? contact.phone : maskPhoneNumber(contact.phone) } : { phone: "", remainingReveals: 0 };
}

function maskPhoneNumber(phone: string) {
  let visibleDigits = 0;
  return phone.replace(/\d/g, (digit) => {
    visibleDigits += 1;
    return visibleDigits <= 3 ? digit : "•";
  });
}

export async function getConversations() {
  if (hasDatabase) return (await db.select().from(conversationTable)).map(toConversation);
  return (await getMutableMarketplaceDatabase()).conversations;
}

export async function getModerationListings() {
  if (hasDatabase) return (await db.select().from(listingTable).where(ne(listingTable.moderationStatus, "approved"))).map(toListing);
  return (await getMutableMarketplaceDatabase()).listings.filter((listing) => listing.moderationStatus !== "approved");
}

export async function getReports() {
  if (hasDatabase) return (await db.select().from(reportTable)).map(toReport);
  return (await getMutableMarketplaceDatabase()).reports;
}

export async function getReportedListings() {
  if (hasDatabase) {
    const reportRows = await db.select({ listingId: reportTable.listingId }).from(reportTable).where(ne(reportTable.status, "resolved"));
    const listingIds = [...new Set(reportRows.map((report) => report.listingId).filter((id): id is string => Boolean(id)))];
    if (listingIds.length === 0) return [];
    return (await db.select().from(listingTable).where(inArray(listingTable.id, listingIds))).map(toListing);
  }

  const database = await getMutableMarketplaceDatabase();
  const listingIds = new Set(database.reports.filter((report) => report.status !== "resolved").map((report) => report.listingId));
  return database.listings.filter((listing) => listingIds.has(listing.id));
}

export async function getUserReports(userId: string) {
  if (hasDatabase) {
    const reportRows = await db.select().from(reportTable).where(eq(reportTable.reporterId, userId));
    const listingIds = [...new Set(reportRows.map((report) => report.listingId).filter((id): id is string => Boolean(id)))];
    const listingRows = listingIds.length > 0 ? await db.select().from(listingTable).where(inArray(listingTable.id, listingIds)) : [];
    const listingsById = new Map(listingRows.map((listing) => [listing.id, toListing(listing)]));
    return reportRows.map((report) => ({ ...toReport(report), listing: report.listingId ? listingsById.get(report.listingId) : undefined }));
  }
  const database = await getMutableMarketplaceDatabase();
  return database.reports
    .filter((r: any) => r.reporterId === userId)
    .map((report) => ({ ...report, listing: database.listings.find((listing) => listing.id === report.listingId) }));
}

export async function createReport(reporterId: string, listingId: string, reason: string, notes: string = "") {
  if (hasDatabase) {
    const existing = await db
      .select()
      .from(reportTable)
      .where(and(eq(reportTable.reporterId, reporterId), eq(reportTable.listingId, listingId)))
      .limit(1);
    if (existing[0]) return toReport(existing[0]);
  } else {
    const database = await getMutableMarketplaceDatabase();
    const existing = database.reports.find((report) => report.reporterId === reporterId && report.listingId === listingId);
    if (existing) return existing;
  }

  const newReport: Report = {
    id: crypto.randomUUID(),
    listingId,
    reporterId,
    reason: reason as Report["reason"],
    status: "open",
    notes
  };

  if (hasDatabase) {
    const [inserted] = await db.insert(reportTable).values({
      id: newReport.id,
      listingId: newReport.listingId,
      reporterId: newReport.reporterId,
      reason: newReport.reason,
      status: newReport.status,
      notes: newReport.notes
    }).returning();
    return inserted ? toReport(inserted) : newReport;
  }

  const database = await getMutableMarketplaceDatabase();
  database.reports.push(newReport);
  return newReport;
}

export async function getAllSellers() {
  if (hasDatabase) return (await db.select().from(sellerProfileTable)).map(toSellerProfile);
  return (await getMutableMarketplaceDatabase()).sellers;
}

export async function updateListingModeration(listingId: string, decision: "approve" | "reject", reason?: string) {
  const now = new Date();
  const nextValues = decision === "approve"
    ? {
        status: "live" as const,
        moderationStatus: "approved" as const,
        publishedAt: now,
        updatedAt: now
      }
    : {
        status: "rejected" as const,
        moderationStatus: "rejected" as const,
        rejectionReason: reason,
        publishedAt: null,
        expiresAt: null,
        updatedAt: now
      };

  if (hasDatabase) {
    const [updated] = await db.update(listingTable).set(nextValues).where(eq(listingTable.id, listingId)).returning();
    return updated ? toListing(updated) : undefined;
  }

  const database = await getMutableMarketplaceDatabase();
  const listing = database.listings.find((item) => item.id === listingId);
  if (!listing) return undefined;
  if (decision === "approve") {
    listing.status = "live";
    listing.moderationStatus = "approved";
    listing.publishedAt = now.toISOString();
  } else {
    listing.status = "rejected";
    listing.moderationStatus = "rejected";
    listing.rejectionReason = reason;
    listing.publishedAt = undefined;
    listing.expiresAt = undefined;
  }
  return listing;
}

function isPublicListing(listing: Listing) {
  return listing.moderationStatus === "approved" && (!listing.expiresAt || listing.expiresAt > new Date().toISOString());
}

export async function getLiveListings() {
  if (hasDatabase) return (await db.select().from(listingTable).where(eq(listingTable.status, "live"))).map(toListing);
  return (await getMutableMarketplaceDatabase()).listings.filter((listing) => listing.status === "live");
}

export async function removeListing(listingId: string) {
  if (hasDatabase) {
    const rows = await db.select().from(listingTable).where(eq(listingTable.id, listingId)).limit(1);
    const listing = rows[0];
    if (!listing) return undefined;

    await db.delete(cartItemTable).where(eq(cartItemTable.listingId, listingId));
    await db.delete(conversationTable).where(eq(conversationTable.listingId, listingId));
    await db.delete(listingContactTable).where(eq(listingContactTable.listingId, listingId));
    await db.delete(listingMediaTable).where(eq(listingMediaTable.listingId, listingId));
    await db.update(reportTable).set({ status: "resolved", listingId: null }).where(eq(reportTable.listingId, listingId));
    await db.delete(listingTable).where(eq(listingTable.id, listingId));
    return toListing(listing);
  }

  const database = await getMutableMarketplaceDatabase();
  const listing = database.listings.find((item) => item.id === listingId);
  if (!listing) return undefined;
  database.listings = database.listings.filter((item) => item.id !== listingId);
  database.reports = database.reports.map((report) => report.listingId === listingId ? { ...report, status: "resolved", listingId: "" } : report);
  database.conversations = database.conversations.filter((conversation) => conversation.listingId !== listingId);
  delete database.listingContacts[listingId];
  return listing;
}

export async function resolveReport(reportId: string) {
  if (hasDatabase) {
    const [updated] = await db.update(reportTable).set({ status: "resolved" }).where(eq(reportTable.id, reportId)).returning();
    return updated ? toReport(updated) : undefined;
  }

  const database = await getMutableMarketplaceDatabase();
  const report = database.reports.find((item) => item.id === reportId);
  if (!report) return undefined;
  report.status = "resolved";
  return report;
}

export async function createPromotionCampaign(listingId: string, campaign: PromotionCampaign) {
  if (hasDatabase) {
    const rows = await db.select({ campaigns: listingTable.campaigns }).from(listingTable).where(eq(listingTable.id, listingId)).limit(1);
    if (!rows[0]) return undefined;
    const campaigns = rows[0].campaigns ?? [];
    campaigns.push(campaign);
    const [updated] = await db.update(listingTable).set({ campaigns, updatedAt: new Date() }).where(eq(listingTable.id, listingId)).returning();
    return updated ? toListing(updated) : undefined;
  }
  const database = await getMutableMarketplaceDatabase();
  const listing = database.listings.find((item) => item.id === listingId);
  if (!listing) return undefined;
  listing.campaigns = listing.campaigns ?? [];
  listing.campaigns.push(campaign);
  return listing;
}

export async function updatePromotionCampaign(listingId: string, campaignId: string, updates: Partial<PromotionCampaign>) {
  if (hasDatabase) {
    const rows = await db.select({ campaigns: listingTable.campaigns }).from(listingTable).where(eq(listingTable.id, listingId)).limit(1);
    if (!rows[0]) return undefined;
    const campaigns = rows[0].campaigns ?? [];
    const index = campaigns.findIndex((c) => c.id === campaignId);
    if (index !== -1) {
      campaigns[index] = { ...campaigns[index], ...updates };
      const [updated] = await db.update(listingTable).set({ campaigns, updatedAt: new Date() }).where(eq(listingTable.id, listingId)).returning();
      return updated ? toListing(updated) : undefined;
    }
    return undefined;
  }
  const database = await getMutableMarketplaceDatabase();
  const listing = database.listings.find((item) => item.id === listingId);
  if (!listing) return undefined;
  listing.campaigns = listing.campaigns ?? [];
  const index = listing.campaigns.findIndex((c) => c.id === campaignId);
  if (index !== -1) {
    listing.campaigns[index] = { ...listing.campaigns[index], ...updates };
  }
  return listing;
}


function toListing(row: typeof listingTable.$inferSelect | Listing): Listing {
  const campaigns = (row as any).campaigns ?? [];
  const now = new Date().toISOString();
  const activePromotions = new Set<PromotionType>((row as any).promoted ?? []);
  
  for (const campaign of campaigns) {
    if (campaign.status === "active" && campaign.startsAt <= now && campaign.endsAt >= now) {
      activePromotions.add(campaign.type);
    }
  }

  const media = Array.isArray(row.media) ? row.media.map((m: any) => {
    if (m.id && m.id.startsWith("users/")) {
      return { ...m, url: createSignedReadUrl(m.id) };
    }
    return m;
  }) : [];

  return {
    id: row.id,
    sellerId: row.sellerId,
    gemTypeId: row.gemTypeId,
    title: row.title,
    description: row.description,
    priceLkr: row.priceLkr,
    negotiable: row.negotiable,
    location: row.location,
    status: row.status as any,
    moderationStatus: row.moderationStatus as any,
    rejectionReason: (row as any).rejectionReason ?? undefined,
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : (row.publishedAt as string | undefined),
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : (row.expiresAt as string | undefined),
    attributes: row.attributes as any,
    media: media as any,
    promoted: Array.from(activePromotions),
    campaigns,
    stats: row.stats as any
  };
}

function toSellerProfile(row: typeof sellerProfileTable.$inferSelect): SellerProfile {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    businessName: row.businessName ?? undefined,
    verificationStatus: row.verificationStatus as SellerProfile["verificationStatus"],
    shopSlug: row.shopSlug,
    memberSince: row.memberSince,
    location: row.location,
    rating: row.rating
  };
}

function toConversation(row: typeof conversationTable.$inferSelect): Conversation {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerName: row.buyerName,
    sellerId: row.sellerId,
    status: row.status as Conversation["status"],
    lastMessage: row.lastMessage,
    updatedAt: row.updatedAt.toISOString()
  };
}

function toReport(row: typeof reportTable.$inferSelect): Report {
  return {
    id: row.id,
    listingId: row.listingId ?? "",
    reporterId: row.reporterId ?? undefined,
    reason: row.reason as Report["reason"],
    status: row.status as Report["status"],
    notes: row.notes
  };
}

function toSavedSearch(row: typeof savedSearchTable.$inferSelect): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    filters: row.filters as SavedSearch["filters"]
  };
}

function emptyMarketplaceContent(): MarketplaceContent {
  return {
    safetyTips: [],
    promotions: [],
    sellerMetrics: []
  };
}
