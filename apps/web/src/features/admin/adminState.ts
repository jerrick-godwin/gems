import type { AdminModerationSnapshot } from "@gems/api-client";
import type { Listing } from "@gems/schemas";

export type AdminView = "overview" | "moderation" | "listings" | "users" | "payments";
export type AdminListingBucket = "live" | "queued" | "unpaid" | "rejected" | "archived" | "other";

export type AdminDeepLink =
  | { kind: "report"; id: string }
  | { kind: "listing"; id: string }
  | { kind: "subscription"; id: string };

export function parseAdminLocation(pathname: string, search = ""): { view: AdminView; target?: AdminDeepLink } {
  const normalized = pathname.replace(/\/+$/, "") || "/admin";
  const match = normalized.match(/^\/admin\/(reports|listings|subscriptions)\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[2]);
    if (match[1] === "reports") return { view: "moderation", target: { kind: "report", id } };
    if (match[1] === "subscriptions") return { view: "payments", target: { kind: "subscription", id } };
    return { view: "listings", target: { kind: "listing", id } };
  }

  const requestedView = new URLSearchParams(search).get("view");
  if (requestedView === "moderation" || requestedView === "listings" || requestedView === "users" || requestedView === "payments") {
    return { view: requestedView };
  }
  return { view: "overview" };
}

export function classifyAdminListing(listing: Listing, now = new Date()): AdminListingBucket {
  const expired = listing.status === "expired"
    || Boolean(listing.expiresAt && new Date(listing.expiresAt) <= now)
    || listing.subscription?.status === "expired";
  if (listing.status === "rejected" || listing.moderationStatus === "rejected") return "rejected";
  if (expired || listing.status === "paused") return "archived";
  if (listing.status === "live" && listing.moderationStatus === "approved" && (!listing.subscription || listing.subscription.status === "active")) return "live";
  if (listing.moderationStatus === "queued" && listing.subscription?.status === "active") return "queued";
  if (
    listing.moderationStatus === "not_submitted"
    || !listing.subscription
    || listing.subscription.status === "pending_payment"
    || listing.subscription.status === "past_due"
    || listing.subscription.status === "cancelled"
  ) return "unpaid";
  return "other";
}

export function resolveAdminDeepLink(snapshot: AdminModerationSnapshot, target: AdminDeepLink): { view: AdminView; found: boolean } {
  if (target.kind === "report") {
    return { view: "moderation", found: snapshot.reports.some((report) => report.id === target.id) };
  }
  if (target.kind === "subscription") {
    return { view: "payments", found: snapshot.payments.some((payment) => payment.subscriptionId === target.id) };
  }
  const listing = [...snapshot.listings, ...snapshot.liveListings].find((item) => item.id === target.id);
  if (!listing) return { view: "listings", found: false };
  const bucket = classifyAdminListing(listing);
  return { view: bucket === "queued" || bucket === "unpaid" ? "moderation" : "listings", found: true };
}

export function adminViewUrl(view: AdminView) {
  return view === "overview" ? "/admin" : `/admin?view=${view}`;
}
