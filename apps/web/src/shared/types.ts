export type View = "market" | "login" | "signup" | "post" | "dashboard" | "wishlist" | "cart" | "checkout" | "profile" | "reports" | "my_listings";
export type SortKey = "featured" | "newest" | "price-low" | "price-high";

export const protectedViews = new Set<View>(["post", "dashboard", "wishlist", "cart", "checkout", "profile", "my_listings", "reports"]);
