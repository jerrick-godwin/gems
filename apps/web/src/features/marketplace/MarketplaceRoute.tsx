import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Listing, ListingSearchItem, MarketplaceFilters, MarketplacePageData, MarketplacePageSize, SellerProfile } from "@gems/schemas";
import { ContactUs, PrivacyPolicy, RefundPolicy, TermsAndConditions } from "../account/PolicyPages.js";
import { AppFrame } from "../shell/AppFrame.js";
import { StatusState } from "../../shared/StatusState.js";
import type { View } from "../../shared/types.js";
import { Marketplace } from "./Marketplace.js";
import type { PublicRouteData } from "../../public/types.js";
import type { CustomerAuthState } from "../../shared/customer.js";
import { gemstoneCategoryPath } from "../../shared/seo.js";
import { CategorySeoIntro, MarketplaceSeoIntro, SeoLandingPage } from "./SeoPages.js";

export function MarketplaceRoute({
  initialRoute,
  initialTheme,
  authState,
  pendingView,
  onNavigate,
  onNavigateIntent,
  onRouteStateChange,
  onPublicUrlChange
}: {
  initialRoute: PublicRouteData;
  initialTheme: "light" | "dark";
  authState: CustomerAuthState;
  pendingView?: View | null;
  onNavigate: (view: View) => void;
  onNavigateIntent?: (view: View) => void;
  onRouteStateChange?: (route: PublicRouteData) => void;
  onPublicUrlChange?: (href: string) => void;
}) {
  const [theme, setThemeState] = useState<"system" | "light" | "dark">(initialTheme);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const setTheme = (next: "system" | "light" | "dark") => {
    const resolved = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
    document.documentElement.dataset.theme = resolved;
    document.cookie = `theme=${resolved}; Path=/; Max-Age=31536000; SameSite=Lax`;
    localStorage.setItem("app-theme", next);
    setThemeState(next);
  };
  const initialData = useMemo(() => routePageData(initialRoute), [initialRoute]);
  const user = authState.status === "signed-in" ? authState.user : null;
  const frameProps = {
    view: initialRoute.kind === "content" ? initialRoute.page : "market" as View,
    setView: onNavigate,
    query: initialData.filters.q,
    setQuery: () => {},
    selectedLocations: initialData.filters.locations,
    setSelectedLocations: () => {},
    locations: initialData.locations,
    isSignedIn: Boolean(user),
    authResolved: authState.status !== "resolving",
    theme,
    setTheme,
    user,
    onViewIntent: onNavigateIntent,
    pendingView
  };

  useEffect(() => {
    onRouteStateChange?.(initialRoute);
  }, [initialRoute, onRouteStateChange]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const syncMobileViewport = () => setIsMobileViewport(mobileQuery.matches);
    syncMobileViewport();
    mobileQuery.addEventListener("change", syncMobileViewport);
    return () => mobileQuery.removeEventListener("change", syncMobileViewport);
  }, []);

  if (initialRoute.kind === "content") {
    const page = initialRoute.page === "terms" ? <TermsAndConditions />
      : initialRoute.page === "privacy" ? <PrivacyPolicy />
        : initialRoute.page === "refund" ? <RefundPolicy />
          : <ContactUs disclosure={{ merchantName: "KRISTIANA MAGRET GEM & JEWELLERY", email: "info@gemslanka.lk", licenceNumber: "20266DL39394" }} />;
    return <AppFrame {...frameProps}>{page}</AppFrame>;
  }
  if (initialRoute.kind === "landing") {
    return <AppFrame {...frameProps}><SeoLandingPage page={initialRoute.page} gemTypes={initialRoute.gemTypes} /></AppFrame>;
  }
  if (initialRoute.kind === "error") {
    return <AppFrame {...frameProps}><StatusState title={initialRoute.status === 404 ? "Page not found" : "Marketplace unavailable"} message={initialRoute.message} /></AppFrame>;
  }
  return (
    <AppFrame {...frameProps}>
      <InteractiveMarketplace
        initialRoute={initialRoute}
        initialData={initialData}
        isMobileViewport={isMobileViewport}
        onRouteStateChange={onRouteStateChange}
        onPublicUrlChange={onPublicUrlChange}
      />
    </AppFrame>
  );
}

function InteractiveMarketplace({
  initialRoute,
  initialData,
  isMobileViewport,
  onRouteStateChange,
  onPublicUrlChange
}: {
  initialRoute: Extract<PublicRouteData, { kind: "marketplace" | "category" | "listing" }>;
  initialData: MarketplacePageData;
  isMobileViewport: boolean;
  onRouteStateChange?: (route: PublicRouteData) => void;
  onPublicUrlChange?: (href: string) => void;
}) {
  const [data, setData] = useState(initialData);
  const [selectedListing, setSelectedListing] = useState<Listing | undefined>(initialRoute.kind === "listing" ? initialRoute.listing : undefined);
  const [previewPhones, setPreviewPhones] = useState<Record<string, string>>({});
  const [fullPhones, setFullPhones] = useState<Record<string, string>>({});
  const requestRef = useRef<AbortController>();
  const queryTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const listings = useMemo(() => initialRoute.kind === "listing" && data.page.items.length === 0 ? [initialRoute.listing] : data.page.items.map(searchItemToListing), [data.page.items, initialRoute]);
  const sellers = useMemo(() => initialRoute.kind === "listing" ? [initialRoute.seller] : data.page.items.map(searchItemToSeller), [data.page.items, initialRoute]);
  const category = initialRoute.kind === "category" ? initialRoute.gemType : undefined;
  const browserHref = useCallback((filters: MarketplaceFilters) => marketplaceHref(
    filters,
    category ? gemstoneCategoryPath(category.slug) : "/",
    category?.id
  ), [category]);

  const load = useCallback(async (filters: MarketplaceFilters, push = true) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const apiHref = marketplaceHref(filters);
    const href = browserHref(filters);
    const response = await fetch(`/api/v1/marketplace${new URL(apiHref, window.location.origin).search}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Unable to load listings");
    const page = await response.json() as MarketplacePageData["page"];
    setData((current) => ({ ...current, filters, page }));
    setSelectedListing(undefined);
    if (push) onPublicUrlChange?.(href);
  }, [browserHref, onPublicUrlChange]);

  useEffect(() => () => {
    requestRef.current?.abort();
    if (queryTimerRef.current) clearTimeout(queryTimerRef.current);
  }, []);

  useEffect(() => {
    if (!onRouteStateChange) return;
    if (selectedListing) {
      const seller = sellers.find((item) => item.id === selectedListing.sellerId);
      if (seller) {
        onRouteStateChange({ kind: "listing", listing: selectedListing, seller });
        return;
      }
    }
    if (initialRoute.kind === "category") {
      onRouteStateChange({ ...initialRoute, data });
      return;
    }
    if (initialRoute.kind === "listing") {
      onRouteStateChange(initialRoute);
      return;
    }
    onRouteStateChange({ kind: "marketplace", data });
  }, [data, initialRoute, onRouteStateChange, selectedListing, sellers]);

  const change = (patch: Partial<MarketplaceFilters>) => {
    const filters = { ...data.filters, ...patch, page: patch.page ?? 1 };
    void load(filters).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) window.location.assign(browserHref(filters));
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
      onPublicUrlChange?.(browserHref(data.filters));
      return;
    }
    const response = await fetch(`/api/v1/listings/${encodeURIComponent(id)}`);
    if (!response.ok) return window.location.assign(`/listings/${encodeURIComponent(id)}`);
    setSelectedListing(await response.json() as Listing);
    onPublicUrlChange?.(`/listings/${encodeURIComponent(id)}`);
    void fetch(`/api/v1/listings/${encodeURIComponent(id)}/interactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "view" }) });
  };
  const revealPhone = async (id: string, full: boolean) => {
    const response = await fetch(`/api/v1/listings/${encodeURIComponent(id)}/reveal-phone${full ? "?full=1" : ""}`, { method: "POST" });
    if (!response.ok) throw new Error("Unable to reveal phone");
    const result = await response.json() as { phone: string };
    (full ? setFullPhones : setPreviewPhones)((current) => ({ ...current, [id]: result.phone }));
    return result.phone;
  };

  return <>
    {initialRoute.kind === "marketplace" && !isMobileViewport && (
      <div className="marketplace-seo-placement marketplace-seo-placement-top">
        <MarketplaceSeoIntro />
      </div>
    )}
    {initialRoute.kind === "category" && <CategorySeoIntro gemType={initialRoute.gemType} />}
    <Marketplace
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
      pageHref={(page) => browserHref({ ...data.filters, page })}
      selectedListing={selectedListing}
      query={data.filters.q}
      setQuery={changeQuery}
      gemType={data.filters.gemType || "all"}
      setGemType={(gemType) => {
        if (!category) return change({ gemType: gemType === "all" ? "" : gemType });
        if (gemType === "all") return window.location.assign("/");
        const nextGemType = data.gemTypes.find((item) => item.id === gemType);
        window.location.assign(nextGemType ? gemstoneCategoryPath(nextGemType.slug) : "/");
      }}
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
      detailHeadingLevel={initialRoute.kind === "listing" ? 1 : 2}
    />
    {initialRoute.kind === "marketplace" && isMobileViewport && (
      <div className="marketplace-seo-placement marketplace-seo-placement-bottom">
        <MarketplaceSeoIntro />
      </div>
    )}
  </>;
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
  if (route.kind === "marketplace" || route.kind === "category") return route.data;
  const filters: MarketplaceFilters = { q: "", gemType: "", locations: [], treatment: "", certificate: "", sort: "featured", page: 1, limit: 20 };
  if (route.kind === "listing") return {
    filters,
    gemTypes: [{ id: route.listing.gemTypeId, name: route.listing.gemTypeId, slug: route.listing.gemTypeId, colorHint: "" }],
    locations: [route.listing.location],
    page: { items: [], total: 1, page: 1, limit: 20, totalPages: 1 },
    generatedAt: route.listing.publishedAt ?? ""
  };
  return { filters, gemTypes: route.kind === "landing" ? route.gemTypes : [], locations: [], page: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, generatedAt: "" };
}

function marketplaceHref(filters: MarketplaceFilters, basePath = "/", lockedGemType?: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.gemType && filters.gemType !== lockedGemType) params.set("gemType", filters.gemType);
  for (const location of filters.locations) params.append("location", location);
  if (filters.treatment) params.set("treatment", filters.treatment);
  if (filters.certificate) params.set("certificate", filters.certificate);
  if (filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.limit !== 20) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
