import type { Listing, MarketplacePageData, SellerProfile } from "@gems/schemas";

export type PublicRouteData =
  | { kind: "marketplace"; data: MarketplacePageData }
  | { kind: "listing"; listing: Listing; seller: SellerProfile }
  | { kind: "content"; page: "contact" | "terms" | "privacy" | "refund" }
  | { kind: "error"; status: 404 | 500 | 503; message: string };

export interface PublicRenderPayload {
  url: string;
  origin: string;
  theme: "light" | "dark";
  year: number;
  route: PublicRouteData;
  assets: { clientEntry: string; stylesheets: string[]; modulePreloads: string[]; reactRefreshPreamble?: boolean };
}
