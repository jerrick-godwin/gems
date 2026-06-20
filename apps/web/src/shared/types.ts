export type View = "market" | "login" | "signup" | "post" | "dashboard" | "profile" | "reports" | "my_listings" | "terms" | "privacy" | "refund" | "contact";
export type SortKey = "featured" | "newest" | "price-low" | "price-high";

export const protectedViews = new Set<View>(["post", "dashboard", "profile", "my_listings", "reports"]);
