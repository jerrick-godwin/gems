import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Listing, ListingSearchItem, MarketplaceFilters, MarketplacePageData, MarketplacePageSize, SellerProfile } from "@gems/schemas";
import { ContactUs, PrivacyPolicy, RefundPolicy, TermsAndConditions } from "../account/PolicyPages.js";
import { AppFrame } from "../shell/AppFrame.js";
import { StatusState } from "../../shared/StatusState.js";
import { pathForView, type View } from "../../shared/types.js";
import { Marketplace } from "./Marketplace.js";
import type { PublicRouteData } from "../../public/types.js";

export function MarketplaceRoute({ initialRoute, initialTheme }: { initialRoute: PublicRouteData; initialTheme: "light" | "dark" }) {
  const [theme, setThemeState] = useState<"system" | "light" | "dark">(initialTheme);
  const setTheme = (next: "system" | "light" | "dark") => {
    const resolved = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
    document.documentElement.dataset.theme = resolved;
    document.cookie = `theme=${resolved}; Path=/; Max-Age=31536000; SameSite=Lax`;
    localStorage.setItem("app-theme", next);
    setThemeState(next);
  };
  const navigateToView = (view: View) => {
    if (view === "post") {
      sessionStorage.setItem("marketplace-reference-data", JSON.stringify({ gemTypes: initialData.gemTypes, locations: initialData.locations }));
    }
    window.location.assign(pathForView(view));
  };
  const initialData = useMemo(() => routePageData(initialRoute), [initialRoute]);
  const frameProps = {
    view: initialRoute.kind === "content" ? initialRoute.page : "market" as View,
    setView: navigateToView,
    query: initialData.filters.q,
    setQuery: () => {},
    selectedLocations: initialData.filters.locations,
    setSelectedLocations: () => {},
    locations: initialData.locations,
    isSignedIn: false,
    authResolved: true,
    theme,
    setTheme
  };

  if (initialRoute.kind === "content") {
    const page = initialRoute.page === "terms" ? <TermsAndConditions />
      : initialRoute.page === "privacy" ? <PrivacyPolicy />
        : initialRoute.page === "refund" ? <RefundPolicy />
          : <ContactUs disclosure={{ merchantName: "KRISTIANA MAGRET GEM & JEWELLERY", email: "info@gemslanka.lk", licenceNumber: "20266DL39394" }} />;
    return <AppFrame {...frameProps}>{page}</AppFrame>;
  }
  if (initialRoute.kind === "error") {
    return <AppFrame {...frameProps}><StatusState title={initialRoute.status === 404 ? "Page not found" : "Marketplace unavailable"} message={initialRoute.message} /></AppFrame>;
  }
  return <AppFrame {...frameProps}><InteractiveMarketplace initialRoute={initialRoute} initialData={initialData} /></AppFrame>;
}

function InteractiveMarketplace({ initialRoute, initialData }: { initialRoute: Extract<PublicRouteData, { kind: "marketplace" | "listing" }>; initialData: MarketplacePageData }) {
  const [data, setData] = useState(initialData);
  const [selectedListing, setSelectedListing] = useState<Listing | undefined>(initialRoute.kind === "listing" ? initialRoute.listing : undefined);
  const [previewPhones, setPreviewPhones] = useState<Record<string, string>>({});
  const [fullPhones, setFullPhones] = useState<Record<string, string>>({});
  const requestRef = useRef<AbortController>();
  const queryTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const listings = useMemo(() => initialRoute.kind === "listing" && data.page.items.length === 0 ? [initialRoute.listing] : data.page.items.map(searchItemToListing), [data.page.items, initialRoute]);
  const sellers = useMemo(() => initialRoute.kind === "listing" ? [initialRoute.seller] : data.page.items.map(searchItemToSeller), [data.page.items, initialRoute]);

  const load = useCallback(async (filters: MarketplaceFilters, push = true) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const href = marketplaceHref(filters);
    const response = await fetch(`/api/v1/marketplace${new URL(href, window.location.origin).search}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Unable to load listings");
    const page = await response.json() as MarketplacePageData["page"];
    setData((current) => ({ ...current, filters, page }));
    setSelectedListing(undefined);
    if (push) history.pushState({ marketplace: true }, "", href);
  }, []);

  useEffect(() => () => {
    requestRef.current?.abort();
    if (queryTimerRef.current) clearTimeout(queryTimerRef.current);
  }, []);

  const change = (patch: Partial<MarketplaceFilters>) => {
    const filters = { ...data.filters, ...patch, page: patch.page ?? 1 };
    void load(filters).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) window.location.assign(marketplaceHref(filters));
    });
  };
  const changeQuery = (q: string) => {
    setData((current) => ({ ...current, filters: { ...current.filters, q, page: 1 } }));
    if (queryTimerRef.current) clearTimeout(queryTimerRef.current);
    queryTimerRef.current = setTimeout(() => change({ q }), 250);
  };
  const selectListing = async (id: string) => {
    if (!id) {
      setSelectedListing(undefined);
      history.pushState({ marketplace: true }, "", marketplaceHref(data.filters));
      return;
    }
    const response = await fetch(`/api/v1/listings/${encodeURIComponent(id)}`);
    if (!response.ok) return window.location.assign(`/listings/${encodeURIComponent(id)}`);
    setSelectedListing(await response.json() as Listing);
    history.pushState({ listing: id }, "", `/listings/${encodeURIComponent(id)}`);
    void fetch(`/api/v1/listings/${encodeURIComponent(id)}/interactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "view" }) });
  };
  const revealPhone = async (id: string, full: boolean) => {
    const response = await fetch(`/api/v1/listings/${encodeURIComponent(id)}/reveal-phone${full ? "?full=1" : ""}`, { method: "POST" });
    if (!response.ok) throw new Error("Unable to reveal phone");
    const result = await response.json() as { phone: string };
    (full ? setFullPhones : setPreviewPhones)((current) => ({ ...current, [id]: result.phone }));
  };

  return <Marketplace
    gemTypes={data.gemTypes}
    sellers={sellers}
    locations={data.locations}
    selectedLocations={data.filters.locations}
    setSelectedLocations={(locations) => change({ locations })}
    sourceListingCount={data.page.total}
    filteredListings={listings}
    page={data.page.page}
    setPage={(page) => change({ page })}
    totalPages={data.page.totalPages}
    pageSize={data.filters.limit}
    setPageSize={(limit) => change({ limit, page: 1 })}
    pageHref={(page) => marketplaceHref({ ...data.filters, page })}
    selectedListing={selectedListing}
    query={data.filters.q}
    setQuery={changeQuery}
    gemType={data.filters.gemType || "all"}
    setGemType={(gemType) => change({ gemType: gemType === "all" ? "" : gemType })}
    treatment={(data.filters.treatment || "all") as MarketplacePropsTreatment}
    setTreatment={(treatment) => change({ treatment: treatment === "all" ? "" : treatment })}
    certificate={(data.filters.certificate || "all") as MarketplacePropsCertificate}
    setCertificate={(certificate) => change({ certificate: certificate === "all" ? "" : certificate })}
    sort={data.filters.sort}
    setSort={(sort) => change({ sort })}
    selectedId={selectedListing?.id ?? ""}
    setSelectedId={(id) => void selectListing(id)}
    previewPhone={selectedListing ? previewPhones[selectedListing.id] : undefined}
    revealedPhone={selectedListing ? fullPhones[selectedListing.id] : undefined}
    previewPhoneNumber={(id) => revealPhone(id, false)}
    revealPhone={(id) => revealPhone(id, true)}
    isSignedIn={false}
    reportedListingIds={[]}
    onRefresh={() => load(data.filters, false)}
    onReport={async () => { throw new Error("Sign in required"); }}
    onRecordInteraction={async () => {}}
  />;
}

type MarketplacePropsTreatment = "all" | "untreated" | "heated" | "diffused" | "filled";
type MarketplacePropsCertificate = "all" | "none" | "seller_provided" | "admin_verified";

function searchItemToListing(item: ListingSearchItem): Listing {
  return {
    id: item.id, sellerId: item.seller.id, gemTypeId: item.gemTypeId, title: item.title, description: "", priceLkr: item.priceLkr,
    negotiable: item.negotiable, location: item.location, status: "live", moderationStatus: "approved", publishedAt: item.publishedAt,
    attributes: { ...item.attributes, dimensions: "", cut: "", clarity: "", origin: item.location },
    media: item.image ? [{ id: `${item.id}-card`, listingId: item.id, kind: "photo", url: item.image.url, thumbnailUrl: item.image.thumbnailUrl, alt: item.image.alt, order: 0, moderationStatus: "approved", width: item.image.width, height: item.image.height }] : [],
    promoted: item.promoted, campaigns: [], stats: { views: 0, saves: 0, phoneReveals: 0, chats: 0, whatsappClicks: 0 }
  };
}

function searchItemToSeller(item: ListingSearchItem): SellerProfile {
  return { ...item.seller, userId: item.seller.id, shopSlug: item.seller.id, memberSince: "" };
}

function routePageData(route: PublicRouteData): MarketplacePageData {
  if (route.kind === "marketplace") return route.data;
  const filters: MarketplaceFilters = { q: "", gemType: "", locations: [], treatment: "", certificate: "", sort: "featured", page: 1, limit: 20 };
  if (route.kind === "listing") return {
    filters,
    gemTypes: [{ id: route.listing.gemTypeId, name: route.listing.gemTypeId, slug: route.listing.gemTypeId, colorHint: "" }],
    locations: [route.listing.location],
    page: { items: [], total: 1, page: 1, limit: 20, totalPages: 1 },
    generatedAt: route.listing.publishedAt ?? ""
  };
  return { filters, gemTypes: [], locations: [], page: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, generatedAt: "" };
}

function marketplaceHref(filters: MarketplaceFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.gemType) params.set("gemType", filters.gemType);
  for (const location of filters.locations) params.append("location", location);
  if (filters.treatment) params.set("treatment", filters.treatment);
  if (filters.certificate) params.set("certificate", filters.certificate);
  if (filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.limit !== 20) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
