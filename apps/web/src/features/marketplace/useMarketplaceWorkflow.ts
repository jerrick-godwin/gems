import { useCallback, useEffect, useMemo, useState } from "react";
import type { GemsApiClient, MarketplaceSnapshot } from "@gems/api-client";
import type { CertificateStatus, Listing, Report, Treatment } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import type { SortKey, View } from "../../shared/types";

export function useMarketplaceWorkflow({
  api,
  isSignedIn,
  setView,
  myReports,
  setMyReports
}: {
  api: GemsApiClient;
  isSignedIn: boolean;
  setView: (view: View) => void;
  myReports: Report[];
  setMyReports: (reports: Report[]) => void;
}) {
  const [snapshot, setSnapshot] = useState<MarketplaceSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [gemType, setGemType] = useState("all");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [treatment, setTreatment] = useState<Treatment | "all">("all");
  const [certificate, setCertificate] = useState<CertificateStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("featured");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewPhones, setPreviewPhones] = useState<Record<string, string>>({});
  const [fullPhones, setFullPhones] = useState<Record<string, string>>({});
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);

  const reportedListingIds = useMemo(() => myReports.map((report) => report.listingId), [myReports]);

  useEffect(() => {
    if (!isSignedIn) setFullPhones({});
  }, [isSignedIn]);

  const refreshSnapshot = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextSnapshot, searchResult] = await Promise.all([
        api.snapshot(),
        api.searchListings({
          ...(query ? { query } : {}),
          ...(gemType !== "all" ? { gemType } : {}),
          ...(selectedLocations.length > 0 ? { location: selectedLocations.join(",") } : {}),
          ...(treatment !== "all" ? { treatment } : {}),
          ...(certificate !== "all" ? { certificate } : {}),
          ...(sort ? { sort } : {}),
          page: page.toString(),
          limit: "20"
        })
      ]);
      setSnapshot(nextSnapshot);
      setFilteredListings(searchResult.items);
      setTotalPages(searchResult.totalPages);
      setPreviewPhones({});
      setFullPhones({});
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(publicErrorMessage(error, "Unable to load marketplace snapshot"));
    }
  }, [api, certificate, gemType, page, query, selectedLocations, sort, treatment]);

  useEffect(() => {
    let active = true;
    api
      .snapshot()
      .then((nextSnapshot) => {
        if (!active) return;
        setSnapshot(nextSnapshot);
        const publicListings = nextSnapshot.listings.filter((listing) => listing.moderationStatus === "approved");
        setFilteredListings(publicListings.slice(0, 20));
        setTotalPages(Math.max(1, Math.ceil(publicListings.length / 20)));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(publicErrorMessage(error, "Unable to load marketplace snapshot"));
      });

    return () => {
      active = false;
    };
  }, [api]);

  const listings = snapshot?.listings ?? [];
  const approvedListings = useMemo(() => listings.filter((listing) => listing.moderationStatus === "approved"), [listings]);

  useEffect(() => {
    setPage(1);
  }, [query, gemType, selectedLocations, treatment, certificate, sort]);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      api
        .searchListings({
          ...(query ? { query } : {}),
          ...(gemType !== "all" ? { gemType } : {}),
          ...(selectedLocations.length > 0 ? { location: selectedLocations.join(",") } : {}),
          ...(treatment !== "all" ? { treatment } : {}),
          ...(certificate !== "all" ? { certificate } : {}),
          ...(sort ? { sort } : {}),
          page: page.toString(),
          limit: "20"
        })
        .then((res) => {
          if (!active) return;
          setFilteredListings(res.items);
          setTotalPages(res.totalPages);
        })
        .catch(console.error);
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [api, query, gemType, selectedLocations, treatment, certificate, sort, page]);

  const selectedListing = filteredListings.find((listing) => listing.id === selectedId);

  const handlePreviewPhone = async (listingId: string) => {
    const result = await api.previewPhone(listingId);
    setPreviewPhones((current) => ({ ...current, [listingId]: result.phone }));
  };

  const handleRevealPhone = async (listingId: string) => {
    if (!isSignedIn) {
      setView("login");
      return;
    }
    const result = await api.revealPhone(listingId);
    setFullPhones((current) => ({ ...current, [listingId]: result.phone }));
  };

  const handleReportListing = async (listingId: string, reason: string, notes: string) => {
    await api.reportListing(listingId, reason, notes);
    setMyReports(await api.myReports());
  };

  const handleRecordInteraction = async (listingId: string, type: "view" | "whatsapp_click") => {
    await api.recordListingInteraction(listingId, type).catch(console.error);
  };

  return {
    snapshot,
    loadError,
    query,
    setQuery,
    gemType,
    setGemType,
    selectedLocations,
    setSelectedLocations,
    treatment,
    setTreatment,
    certificate,
    setCertificate,
    sort,
    setSort,
    page,
    setPage,
    totalPages,
    selectedId,
    setSelectedId,
    previewPhones,
    fullPhones,
    filteredListings,
    approvedListings,
    selectedListing,
    reportedListingIds,
    refreshSnapshot,
    handlePreviewPhone,
    handleRevealPhone,
    handleReportListing,
    handleRecordInteraction
  };
}
