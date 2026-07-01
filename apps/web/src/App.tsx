import { useCallback, useEffect, useMemo, useState } from "react";
import { GemsApiClient } from "@gems/api-client";
import { useTheme } from "@gems/ui";
import { authClient, type MarketplaceAuthUser } from "./firebase";
import { ForgotPasswordPage } from "./features/account/ForgotPasswordPage";
import { LoginPage } from "./features/account/LoginPage";
import { MyListingsView } from "./features/account/MyListingsView";
import { MyReportsView } from "./features/account/MyReportsView";
import { PostGem } from "./features/account/PostGem";
import { PostGemCheckout } from "./features/account/PostGemCheckout";
import { ProfileSettings } from "./features/account/ProfileSettings";
import { ReceiptPage } from "./features/account/ReceiptPage";
import { SignupPage } from "./features/account/SignupPage";
import { useAccountWorkflow } from "./features/account/useAccountWorkflow";
import { AppFrame } from "./features/shell/AppFrame";
import { Marketplace } from "./features/marketplace/Marketplace";
import { useMarketplaceWorkflow } from "./features/marketplace/useMarketplaceWorkflow";
import { StatusState } from "./shared/StatusState";
import { listingCheckoutTokenFromPathname, pathForView, protectedViews, viewFromPathname, type View } from "./shared/types";
import { ContactUs, PrivacyPolicy, RefundPolicy, TermsAndConditions } from "./features/account/PolicyPages";
import { paymentNoticeFromResult, type PaymentNotice } from "./shared/helpers";

const siteOrigin = "https://gemslanka.lk";
const homepageTitle = "Gemslanka.lk | Sri Lankan Gemstone Marketplace";
const homepageDescription = "Browse approved gemstone listings in Sri Lanka, including sapphires, rubies, spinels, photos, lab details, treatment, origin, and seller contact options.";

const viewSeo: Record<View, { title: string; description: string; robots: "index,follow" | "noindex,follow" }> = {
  market: {
    title: homepageTitle,
    description: homepageDescription,
    robots: "index,follow"
  },
  contact: {
    title: "Contact Gemslanka.lk | Sri Lankan Gemstone Marketplace",
    description: "Contact Gemslanka.lk for marketplace support, merchant details, and gemstone listing inquiries.",
    robots: "index,follow"
  },
  terms: {
    title: "Terms and Conditions | Gemslanka.lk",
    description: "Read the Gemslanka.lk terms for gemstone listing services, seller responsibilities, subscriptions, and marketplace use.",
    robots: "index,follow"
  },
  privacy: {
    title: "Privacy Policy | Gemslanka.lk",
    description: "Learn how Gemslanka.lk handles account, listing, payment metadata, moderation, and support information.",
    robots: "index,follow"
  },
  refund: {
    title: "Refund Policy | Gemslanka.lk",
    description: "Review the Gemslanka.lk refund policy for listing subscriptions, renewals, and extra-photo fees.",
    robots: "index,follow"
  },
  login: {
    title: "Sign In | Gemslanka.lk",
    description: "Sign in to manage gemstone listings on Gemslanka.lk.",
    robots: "noindex,follow"
  },
  signup: {
    title: "Create Account | Gemslanka.lk",
    description: "Create a Gemslanka.lk account to post and manage gemstone listings.",
    robots: "noindex,follow"
  },
  forgot_password: {
    title: "Reset Password | Gemslanka.lk",
    description: "Reset your Gemslanka.lk account password.",
    robots: "noindex,follow"
  },
  post: {
    title: "Post a Gem | Gemslanka.lk",
    description: "Post and manage a gemstone listing on Gemslanka.lk.",
    robots: "noindex,follow"
  },
  post_checkout: {
    title: "Listing Checkout | Gemslanka.lk",
    description: "Complete a Gemslanka.lk listing checkout session.",
    robots: "noindex,follow"
  },
  profile: {
    title: "Profile | Gemslanka.lk",
    description: "Manage your Gemslanka.lk account profile.",
    robots: "noindex,follow"
  },
  reports: {
    title: "My Reports | Gemslanka.lk",
    description: "Review your Gemslanka.lk marketplace reports.",
    robots: "noindex,follow"
  },
  my_listings: {
    title: "My Listings | Gemslanka.lk",
    description: "Manage your Gemslanka.lk gemstone listings.",
    robots: "noindex,follow"
  },
  receipt: {
    title: "Receipt | Gemslanka.lk",
    description: "View a Gemslanka.lk listing payment receipt.",
    robots: "noindex,follow"
  }
};

function upsertMeta(selector: string, createMeta: () => HTMLMetaElement, content: string) {
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const meta = existing ?? createMeta();
  meta.content = content;
  if (!existing) document.head.appendChild(meta);
}

function upsertNamedMeta(name: string, content: string) {
  upsertMeta(`meta[name="${name}"]`, () => {
    const meta = document.createElement("meta");
    meta.name = name;
    return meta;
  }, content);
}

function upsertPropertyMeta(property: string, content: string) {
  upsertMeta(`meta[property="${property}"]`, () => {
    const meta = document.createElement("meta");
    meta.setAttribute("property", property);
    return meta;
  }, content);
}

function setCanonicalUrl(url: string) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const link = existing ?? document.createElement("link");
  link.rel = "canonical";
  link.href = url;
  if (!existing) document.head.appendChild(link);
}

function canonicalPathForView(view: View) {
  if (view === "post_checkout" && window.location.pathname.startsWith("/post/checkout/")) {
    return window.location.pathname;
  }
  return pathForView(view);
}



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

  const navigateToListingCheckout = useCallback((token: string, checkoutUrl: string) => {
    setView("post_checkout");
    const nextPath = `/post/checkout/${encodeURIComponent(token)}`;
    const nextUrl = checkoutUrl.startsWith(window.location.origin) ? new URL(checkoutUrl).pathname : nextPath;
    window.history.pushState({}, "", nextUrl);
  }, []);

  const navigateToPostEditCheckout = useCallback((token: string) => {
    setView("post");
    window.history.pushState({}, "", `/post?checkoutToken=${encodeURIComponent(token)}`);
  }, []);

  useEffect(() => {
    const unsubscribe = authClient.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setAuthResolved(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const seo = viewSeo[view];
    const canonicalUrl = `${siteOrigin}${canonicalPathForView(view)}`;
    document.title = seo.title;
    upsertNamedMeta("description", seo.description);
    upsertNamedMeta("robots", seo.robots);
    upsertPropertyMeta("og:title", seo.title);
    upsertPropertyMeta("og:description", seo.description);
    upsertPropertyMeta("og:url", canonicalUrl);
    upsertNamedMeta("twitter:title", seo.title);
    upsertNamedMeta("twitter:description", seo.description);
    setCanonicalUrl(canonicalUrl);
  }, [view]);

  useEffect(() => {
    const syncViewFromLocation = () => {
      const nextView = viewFromPathname(window.location.pathname);
      const canonicalPath = pathForView(nextView);
      const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
      setView(nextView);

      if (nextView === "post_checkout" && currentPath.startsWith("/post/checkout/")) return;

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
            message: "Payment status returned. Refresh My Listings if your latest status is not visible yet."
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
    const isProcessingPaymentReturn = Boolean(paymentNotice);

    return (
      <AppFrame {...frameProps} locations={[]}>
        <StatusState
          title={isProcessingPaymentReturn ? "Processing your payment" : marketplace.loadError ? "Marketplace unavailable" : "Preparing Gemslanka"}
          message={isProcessingPaymentReturn ? "Please wait while we update your listing and payment status." : marketplace.loadError ?? "Curating live gem listings, seller details, and market filters for you."}
          loading={!marketplace.loadError}
          variant={isProcessingPaymentReturn && !marketplace.loadError ? "payment" : "marketplace"}
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
  const listingCheckoutToken = view === "post_checkout" ? listingCheckoutTokenFromPathname(window.location.pathname) : "";
  const editCheckoutToken = view === "post" ? new URLSearchParams(window.location.search).get("checkoutToken") ?? "" : "";

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
          revealedPhone={marketplace.selectedListing ? marketplace.fullPhones[marketplace.selectedListing.id] : undefined}
          previewPhoneNumber={marketplace.handlePreviewPhone}
          revealPhone={marketplace.handleRevealPhone}
          isSignedIn={isSignedIn}
          reportedListingIds={marketplace.reportedListingIds}
          onRefresh={marketplace.refreshSnapshot}
          onReport={marketplace.handleReportListing}
          onRecordInteraction={marketplace.handleRecordInteraction}
        />
      )}
      {view === "post" && <PostGem gemTypes={gemTypes} locations={locations} api={api} editCheckoutToken={editCheckoutToken} onCheckoutCreated={navigateToListingCheckout} />}
      {view === "post_checkout" && (
        <PostGemCheckout
          token={listingCheckoutToken}
          api={api}
          subscriptionPlans={subscriptionPlans}
          isSignedIn={isSignedIn}
          authResolved={authResolved}
          onDashboardChange={account.setDashboard}
          onNavigate={navigateToView}
          onEditListing={navigateToPostEditCheckout}
        />
      )}
      {view === "my_listings" && paymentNotice && !account.dashboard && (
        <StatusState
          title="Processing your payment"
          message="Please wait while we update your listing and payment status."
          loading
          variant="payment"
        />
      )}
      {view === "my_listings" && (!paymentNotice || account.dashboard) && <MyListingsView dashboard={account.dashboard} gemTypes={gemTypes} subscriptionPlans={subscriptionPlans} api={api} onDashboardChange={account.setDashboard} />}
      {view === "reports" && <MyReportsView reports={account.myReports} listings={listings} gemTypes={gemTypes} sellers={sellers} />}
      {view === "profile" && <ProfileSettings api={api} dashboard={account.dashboard} accountError={account.accountError} onDashboardChange={account.setDashboard} onMarketplaceRefresh={marketplace.refreshSnapshot} />}
    </AppFrame>
  );
}

export default App;
