import { useCallback, useEffect, useMemo, useState } from "react";
import { GemsApiClient } from "@gems/api-client";
import { useTheme } from "@gems/ui";
import { authClient, type MarketplaceAuthUser } from "./firebase";
import { LoginPage } from "./features/account/LoginPage";
import { MyListingsView } from "./features/account/MyListingsView";
import { MyReportsView } from "./features/account/MyReportsView";
import { PostGem } from "./features/account/PostGem";
import { ProfileSettings } from "./features/account/ProfileSettings";
import { SellerDashboard } from "./features/account/SellerDashboard";
import { useAccountWorkflow } from "./features/account/useAccountWorkflow";
import { AppFrame } from "./features/shell/AppFrame";
import { Marketplace } from "./features/marketplace/Marketplace";
import { useMarketplaceWorkflow } from "./features/marketplace/useMarketplaceWorkflow";
import { StatusState } from "./shared/StatusState";
import { protectedViews, type View } from "./shared/types";
import { ContactUs, PrivacyPolicy, TermsAndConditions } from "./features/account/PolicyPages";

function App() {
  const [user, setUser] = useState<MarketplaceAuthUser | null>(null);
  const [view, setView] = useState<View>("market");
  const isSignedIn = user !== null;
  const [theme, setTheme] = useTheme("app-theme");

  useEffect(() => {
    const unsubscribe = authClient.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!user) return undefined;
    return await user.getIdToken();
  }, [user]);

  const api = useMemo(() => new GemsApiClient("/api/v1", { getAccessToken }), [getAccessToken]);
  const account = useAccountWorkflow(api, isSignedIn);
  const marketplace = useMarketplaceWorkflow({
    api,
    isSignedIn,
    setView,
    wishlistItems: account.wishlistItems,
    setWishlistItems: account.setWishlistItems,
    myReports: account.myReports,
    setMyReports: account.setMyReports
  });

  const frameProps = {
    isSignedIn,
    view,
    setView,
    query: marketplace.query,
    setQuery: marketplace.setQuery,
    selectedLocations: marketplace.selectedLocations,
    setSelectedLocations: marketplace.setSelectedLocations,
    locations: marketplace.snapshot?.locations ?? [],
    theme,
    setTheme,
    user
  };

  if (view === "terms" || view === "privacy" || view === "contact") {
    const policyView = view === "terms" ? <TermsAndConditions /> : view === "privacy" ? <PrivacyPolicy /> : <ContactUs />;

    return (
      <AppFrame {...frameProps}>
        {policyView}
      </AppFrame>
    );
  }

  if (!marketplace.snapshot) {
    return (
      <AppFrame {...frameProps} locations={[]}>
        <StatusState
          title={marketplace.loadError ? "Marketplace unavailable" : "Loading marketplace"}
          message={marketplace.loadError ?? "Fetching the latest gem listings and seller data."}
          loading={!marketplace.loadError}
        />
      </AppFrame>
    );
  }

  if (!isSignedIn && protectedViews.has(view)) {
    return (
      <AppFrame {...frameProps}>
        <LoginPage onSignedIn={() => setView("dashboard")} />
      </AppFrame>
    );
  }

  const gemTypes = marketplace.snapshot.gemTypes;
  const listings = marketplace.snapshot.listings;
  const locations = marketplace.snapshot.locations;
  const sellers = marketplace.snapshot.sellers;

  return (
    <AppFrame {...frameProps} locations={locations}>
      {view === "login" && <LoginPage onSignedIn={() => setView("dashboard")} initialSignUp={false} />}
      {view === "signup" && <LoginPage onSignedIn={() => setView("dashboard")} initialSignUp={true} />}
      {view === "market" && (
        <Marketplace
          gemTypes={gemTypes}
          sellers={sellers}
          locations={locations}
          selectedLocations={marketplace.selectedLocations}
          setSelectedLocations={marketplace.setSelectedLocations}
          sourceListingCount={marketplace.approvedListings.length}
          filteredListings={marketplace.filteredListings}
          page={marketplace.page}
          setPage={marketplace.setPage}
          totalPages={marketplace.totalPages}
          selectedListing={marketplace.selectedListing}
          setQuery={marketplace.setQuery}
          query={marketplace.query}
          gemType={marketplace.gemType}
          setGemType={marketplace.setGemType}
          treatment={marketplace.treatment}
          setTreatment={marketplace.setTreatment}
          certificate={marketplace.certificate}
          setCertificate={marketplace.setCertificate}
          sort={marketplace.sort}
          setSort={marketplace.setSort}
          selectedId={marketplace.selectedListing?.id ?? ""}
          setSelectedId={(id) => marketplace.setSelectedId(id)}
          revealedPhone={marketplace.selectedListing ? marketplace.revealedPhones[marketplace.selectedListing.id] : undefined}
          revealPhone={marketplace.handleRevealPhone}
          savedIds={marketplace.savedIds}
          toggleSaved={marketplace.toggleSaved}
          isSignedIn={isSignedIn}
          reportedListingIds={marketplace.reportedListingIds}
          onReport={marketplace.handleReportListing}
        />
      )}
      {view === "wishlist" && (
        <Marketplace
          gemTypes={gemTypes}
          sellers={sellers}
          locations={locations}
          selectedLocations={marketplace.selectedLocations}
          setSelectedLocations={marketplace.setSelectedLocations}
          sourceListingCount={marketplace.savedIds.length}
          filteredListings={marketplace.approvedListings.filter((listing) => marketplace.savedIds.includes(listing.id))}
          page={1}
          setPage={() => {}}
          totalPages={1}
          selectedListing={marketplace.selectedListing}
          setQuery={marketplace.setQuery}
          query={marketplace.query}
          gemType={marketplace.gemType}
          setGemType={marketplace.setGemType}
          treatment={marketplace.treatment}
          setTreatment={marketplace.setTreatment}
          certificate={marketplace.certificate}
          setCertificate={marketplace.setCertificate}
          sort={marketplace.sort}
          setSort={marketplace.setSort}
          selectedId={marketplace.selectedListing?.id ?? ""}
          setSelectedId={(id) => marketplace.setSelectedId(id)}
          revealedPhone={marketplace.selectedListing ? marketplace.revealedPhones[marketplace.selectedListing.id] : undefined}
          revealPhone={marketplace.handleRevealPhone}
          savedIds={marketplace.savedIds}
          toggleSaved={marketplace.toggleSaved}
          isSignedIn={isSignedIn}
          reportedListingIds={marketplace.reportedListingIds}
          onReport={marketplace.handleReportListing}
        />
      )}
      {view === "post" && <PostGem gemTypes={gemTypes} locations={locations} api={api} onDashboardChange={account.setDashboard} />}
      {view === "dashboard" && <SellerDashboard listings={account.dashboard?.sellerListings ?? []} content={marketplace.snapshot.content} dashboard={account.dashboard} accountError={account.accountError} />}
      {view === "my_listings" && <MyListingsView dashboard={account.dashboard} gemTypes={gemTypes} api={api} onDashboardChange={account.setDashboard} />}
      {view === "reports" && <MyReportsView reports={account.myReports} listings={listings} gemTypes={gemTypes} sellers={sellers} />}
      {view === "profile" && <ProfileSettings api={api} dashboard={account.dashboard} accountError={account.accountError} onDashboardChange={account.setDashboard} />}
    </AppFrame>
  );
}

export default App;
