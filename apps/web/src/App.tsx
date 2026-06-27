import { useCallback, useEffect, useMemo, useState } from "react";
import { GemsApiClient } from "@gems/api-client";
import { useTheme } from "@gems/ui";
import { authClient, type MarketplaceAuthUser } from "./firebase";
import { ForgotPasswordPage } from "./features/account/ForgotPasswordPage";
import { LoginPage } from "./features/account/LoginPage";
import { MyListingsView } from "./features/account/MyListingsView";
import { MyReportsView } from "./features/account/MyReportsView";
import { PostGem } from "./features/account/PostGem";
import { ProfileSettings } from "./features/account/ProfileSettings";
import { ReceiptPage } from "./features/account/ReceiptPage";
import { SignupPage } from "./features/account/SignupPage";
import { useAccountWorkflow } from "./features/account/useAccountWorkflow";
import { AppFrame } from "./features/shell/AppFrame";
import { Marketplace } from "./features/marketplace/Marketplace";
import { useMarketplaceWorkflow } from "./features/marketplace/useMarketplaceWorkflow";
import { StatusState } from "./shared/StatusState";
import { pathForView, protectedViews, viewFromPathname, type View } from "./shared/types";
import { ContactUs, PrivacyPolicy, RefundPolicy, TermsAndConditions } from "./features/account/PolicyPages";
import { paymentNoticeFromResult, type PaymentNotice } from "./shared/helpers";



function App() {
  const [user, setUser] = useState<MarketplaceAuthUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [view, setView] = useState<View>(() => viewFromPathname(window.location.pathname));
  const [paymentNotice, setPaymentNotice] = useState<PaymentNotice | null>(null);
  const isSignedIn = user !== null;
  const [theme, setTheme] = useTheme("app-theme");

  const navigateToView = useCallback((nextView: View, options?: { replace?: boolean }) => {
    setView(nextView);

    const nextPath = pathForView(nextView);
    const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl === currentUrl) return;

    if (options?.replace) {
      window.history.replaceState({}, "", nextUrl);
    } else {
      window.history.pushState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = authClient.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setAuthResolved(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const syncViewFromLocation = () => {
      const nextView = viewFromPathname(window.location.pathname);
      const canonicalPath = pathForView(nextView);
      const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
      setView(nextView);

      if (currentPath !== canonicalPath) {
        window.history.replaceState({}, "", `${canonicalPath}${window.location.search}${window.location.hash}`);
      }
    };

    syncViewFromLocation();
    window.addEventListener("popstate", syncViewFromLocation);
    return () => window.removeEventListener("popstate", syncViewFromLocation);
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
    setView: navigateToView,
    myReports: account.myReports,
    setMyReports: account.setMyReports
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("payment");
    if (!result) return;

    const notice = paymentNoticeFromResult(result);
    if (notice) {
      setPaymentNotice(notice);
      setView("my_listings");
      url.pathname = pathForView("my_listings");
    }

    url.searchParams.delete("payment");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!paymentNotice || !isSignedIn) return;
    let active = true;
    api.dashboard()
      .then((nextDashboard) => {
        if (active) account.setDashboard(nextDashboard);
      })
      .catch(() => {
        if (active) {
          setPaymentNotice({
            tone: "warning",
            message: "Payment status returned from Stripe. Refresh My Listings if your latest status is not visible yet."
          });
        }
      });

    return () => {
      active = false;
    };
  }, [api, account.setDashboard, isSignedIn, paymentNotice]);

  const frameProps = {
    isSignedIn,
    view,
    setView: navigateToView,
    query: marketplace.query,
    setQuery: marketplace.setQuery,
    selectedLocations: marketplace.selectedLocations,
    setSelectedLocations: marketplace.setSelectedLocations,
    locations: marketplace.snapshot?.locations ?? [],
    authResolved,
    theme,
    setTheme,
    user,
    accountUser: account.dashboard?.user ?? null,
    paymentNotice,
    onDismissPaymentNotice: () => setPaymentNotice(null)
  };

  if (view === "terms" || view === "privacy" || view === "refund" || view === "contact") {
    const policyView = view === "terms"
      ? <TermsAndConditions />
      : view === "privacy"
        ? <PrivacyPolicy />
        : view === "refund"
          ? <RefundPolicy />
          : <ContactUs disclosure={marketplace.snapshot?.content.merchantDisclosure} />;

    return (
      <AppFrame {...frameProps}>
        {policyView}
      </AppFrame>
    );
  }

  if (authResolved && !isSignedIn && protectedViews.has(view)) {
    return (
      <AppFrame {...frameProps}>
        <LoginPage onSignedIn={() => navigateToView(view, { replace: true })} onNavigate={navigateToView} />
      </AppFrame>
    );
  }

  if (!authResolved && protectedViews.has(view)) {
    return (
      <AppFrame {...frameProps}>
        <StatusState
          title="Checking account"
          message="Confirming your sign-in status."
          loading
        />
      </AppFrame>
    );
  }

  if (view === "login" || view === "signup" || view === "forgot_password") {
    return (
      <AppFrame {...frameProps}>
        {view === "login" && <LoginPage onSignedIn={() => navigateToView("market", { replace: true })} onNavigate={navigateToView} />}
        {view === "signup" && (
          <SignupPage
            onSignedIn={(dashboard) => {
              account.setDashboard(dashboard);
              navigateToView("my_listings", { replace: true });
            }}
            onNavigate={navigateToView}
          />
        )}
        {view === "forgot_password" && <ForgotPasswordPage onNavigate={navigateToView} />}
      </AppFrame>
    );
  }

  if (view === "receipt") {
    return (
      <AppFrame {...frameProps}>
        <ReceiptPage api={api} onDashboardChange={account.setDashboard} onNavigate={navigateToView} />
      </AppFrame>
    );
  }

  if (!marketplace.snapshot) {
    return (
      <AppFrame {...frameProps} locations={[]}>
        <StatusState
          title={marketplace.loadError ? "Marketplace unavailable" : "Preparing Gemslanka"}
          message={marketplace.loadError ?? "Curating live gem listings, seller details, and market filters for you."}
          loading={!marketplace.loadError}
          onRetry={marketplace.refreshSnapshot}
        />
      </AppFrame>
    );
  }

  const gemTypes = marketplace.snapshot.gemTypes;
  const subscriptionPlans = marketplace.snapshot.subscriptionPlans;
  const listings = marketplace.snapshot.listings;
  const locations = marketplace.snapshot.locations;
  const sellers = marketplace.snapshot.sellers;

  return (
    <AppFrame {...frameProps} locations={locations}>
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
          previewPhone={marketplace.selectedListing ? marketplace.previewPhones[marketplace.selectedListing.id] : undefined}
          revealedPhone={isSignedIn && marketplace.selectedListing ? marketplace.fullPhones[marketplace.selectedListing.id] : undefined}
          previewPhoneNumber={marketplace.handlePreviewPhone}
          revealPhone={marketplace.handleRevealPhone}
          isSignedIn={isSignedIn}
          reportedListingIds={marketplace.reportedListingIds}
          onRefresh={marketplace.refreshSnapshot}
          onReport={marketplace.handleReportListing}
        />
      )}
      {view === "post" && <PostGem gemTypes={gemTypes} locations={locations} subscriptionPlans={subscriptionPlans} api={api} onDashboardChange={account.setDashboard} />}
      {view === "my_listings" && <MyListingsView dashboard={account.dashboard} gemTypes={gemTypes} subscriptionPlans={subscriptionPlans} api={api} onDashboardChange={account.setDashboard} />}
      {view === "reports" && <MyReportsView reports={account.myReports} listings={listings} gemTypes={gemTypes} sellers={sellers} />}
      {view === "profile" && <ProfileSettings api={api} dashboard={account.dashboard} accountError={account.accountError} onDashboardChange={account.setDashboard} onMarketplaceRefresh={marketplace.refreshSnapshot} />}
    </AppFrame>
  );
}

export default App;
