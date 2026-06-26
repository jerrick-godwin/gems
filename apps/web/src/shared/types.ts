export type View = "market" | "login" | "signup" | "forgot_password" | "post" | "profile" | "reports" | "my_listings" | "receipt" | "terms" | "privacy" | "refund" | "contact";
export type SortKey = "featured" | "newest" | "price-low" | "price-high";

export const protectedViews = new Set<View>(["post", "profile", "my_listings", "reports", "receipt"]);

export const viewPaths: Record<View, string> = {
  market: "/",
  login: "/login",
  signup: "/signup",
  forgot_password: "/forgot-password",
  post: "/post",
  profile: "/profile",
  reports: "/reports",
  my_listings: "/listings",
  receipt: "/receipt",
  terms: "/terms-and-conditions",
  privacy: "/privacy-policy",
  refund: "/refund-policy",
  contact: "/contact-us"
};

const pathViews = new Map<string, View>(
  Object.entries(viewPaths).map(([view, path]) => [path, view as View])
);

export function viewFromPathname(pathname: string): View {
  return pathViews.get(pathname.replace(/\/+$/, "") || "/") ?? "market";
}

export function pathForView(view: View) {
  return viewPaths[view];
}
