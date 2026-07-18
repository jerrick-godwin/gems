import type { GemType, Listing, MarketplacePageData, SellerProfile } from "@gems/schemas";
import type { SeoLandingPageId } from "../shared/seo.js";

export type PublicRouteData =
  | { kind: "marketplace"; data: MarketplacePageData }
  | { kind: "category"; gemType: GemType; data: MarketplacePageData; indexable: boolean }
  | { kind: "landing"; page: SeoLandingPageId; gemTypes: GemType[] }
  | { kind: "listing"; listing: Listing; seller: SellerProfile }
  | { kind: "content"; page: "contact" | "terms" | "privacy" | "refund" }
  | { kind: "error"; status: 404 | 500 | 503; message: string };

export interface PublicRenderPayload {
  url: string;
  origin: string;
  theme: "light" | "dark";
  year: number;
  route: PublicRouteData;
  verification?: { google?: string; bing?: string };
  assets: { clientEntry: string; stylesheets: string[]; modulePreloads: string[]; reactRefreshPreamble?: boolean };
}
