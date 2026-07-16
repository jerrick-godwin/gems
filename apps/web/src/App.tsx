import { useCallback, useEffect, useMemo, useState } from "react";
import { GemsApiClient } from "@gems/api-client";
import { useTheme } from "@gems/ui";
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
import { listingCheckoutTokenFromPathname, pathForView, protectedViews, signedOutOnlyViews, viewForAuthState, type View } from "./shared/types";
import type { AccountSurfaceProps, CustomerNavigationOptions } from "./shared/customer";
import { ContactUs, PrivacyPolicy, RefundPolicy, TermsAndConditions } from "./features/account/PolicyPages";
import { paymentNoticeFromResult, type PaymentNotice } from "./shared/helpers";
import { footerDescription, siteName } from "./shared/seo";

const siteOrigin = "https://gemslanka.lk";
const homepageTitle = `${siteName} | Buy and Sell Gemstones Worldwide`;
const homepageDescription = footerDescription;

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
    robots: "noindex,follow"
  },
  privacy: {
    title: "Privacy Policy | Gemslanka.lk",
    description: "Learn how Gemslanka.lk handles account, listing, payment metadata, moderation, and support information.",
    robots: "noindex,follow"
  },
  refund: {
    title: "Refund Policy | Gemslanka.lk",
    description: "Review the Gemslanka.lk refund policy for listing subscriptions, renewals, and extra-photo fees.",
    robots: "noindex,follow"
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



function App({ view, authState, references, navigate }: AccountSurfaceProps) {
  const [paymentNotice, setPaymentNotice] = useState<PaymentNotice | null>(null);
  const user = authState.status === "signed-in" ? authState.user : null;
  const authResolved = authState.status !== "resolving";
  const isSignedIn = user !== null;
  const [theme, setTheme] = useTheme("app-theme");

  const navigateToView = useCallback((requestedView: View, options?: CustomerNavigationOptions) => {
    const nextView = viewForAuthState(requestedView, isSignedIn);
    navigate(nextView, options);
  }, [isSignedIn, navigate]);

  const navigateToListingCheckout = useCallback((token: string, checkoutUrl: string) => {
    const nextPath = `/post/checkout/${encodeURIComponent(token)}`;
    const nextUrl = checkoutUrl.startsWith(window.location.origin) ? new URL(checkoutUrl).pathname : nextPath;
    navigate("post_checkout", { path: nextUrl });
  }, [navigate]);

  const navigateToPostEditCheckout = useCallback((token: string) => {
    navigate("post", { path: `/post?checkoutToken=${encodeURIComponent(token)}` });
  }, [navigate]);

  useEffect(() => {
    if (!authResolved || !isSignedIn || !signedOutOnlyViews.has(view)) return;
    navigateToView("market", { replace: true });
  }, [authResolved, isSignedIn, navigateToView, view]);

  useEffect(() => {
    const seo = viewSeo[view];
    const canonicalUrl = `${siteOrigin}${canonicalPathForView(view)}`;
    document.title = seo.title;
    upsertNamedMeta("description", seo.description);
    upsertNamedMeta("robots", seo.robots);
    document.head.querySelector<HTMLMetaElement>('meta[name="keywords"]')?.remove();
    upsertPropertyMeta("og:title", seo.title);
    upsertPropertyMeta("og:description", seo.description);
    upsertPropertyMeta("og:url", canonicalUrl);
    upsertNamedMeta("twitter:title", seo.title);
    upsertNamedMeta("twitter:description", seo.description);
    setCanonicalUrl(canonicalUrl);
  }, [view]);

  const getAccessToken = useCallback(async () => {
    if (!user) return undefined;
    return await user.getIdToken();
  }, [user]);

  const api = useMemo(() => new GemsApiClient("/api/v1", { getAccessToken }), [getAccessToken]);
  const accountWorkflowEnabled = isSignedIn && (protectedViews.has(view) || view === "post_checkout");
  const marketplaceWorkflowEnabled = view === "market" || view === "post_checkout" || view === "profile" || view === "reports" || view === "my_listings";
  const account = useAccountWorkflow(api, isSignedIn, accountWorkflowEnabled);
  const marketplace = useMarketplaceWorkflow({
    api,
    myReports: account.myReports,
    setMyReports: account.setMyReports,
    enabled: marketplaceWorkflowEnabled
  });
  const referenceGemTypes = references.data.gemTypes.length > 0 ? references.data.gemTypes : marketplace.snapshot?.gemTypes ?? [];
  const referenceLocations = references.data.locations.length > 0 ? references.data.locations : marketplace.snapshot?.locations ?? [];

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("payment");
    if (!result) return;

    const notice = paymentNoticeFromResult(result);
    if (notice) {
      setPaymentNotice(notice);
      url.pathname = pathForView("my_listings");
    }

    url.searchParams.delete("payment");
    navigate(notice ? "my_listings" : view, { replace: true, path: `${url.pathname}${url.search}${url.hash}` });
  }, [navigate, view]);

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
    locations: referenceLocations,
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

  if (signedOutOnlyViews.has(view) && (!authResolved || isSignedIn)) {
    return (
      <AppFrame {...frameProps}>
        <StatusState
          title={isSignedIn ? "Opening marketplace" : "Checking account"}
          message={isSignedIn ? "Taking you back to the main page." : "Confirming your sign-in status."}
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

  if (view === "post") {
    const editCheckoutToken = new URLSearchParams(window.location.search).get("checkoutToken") ?? "";
    return (
      <AppFrame {...frameProps} locations={referenceLocations}>
        <PostGem
          gemTypes={referenceGemTypes}
          locations={referenceLocations}
          referencesLoading={references.status === "idle" || references.status === "loading"}
          referencesError={references.error}
          onRetryReferences={references.retry}
          api={api}
          editCheckoutToken={editCheckoutToken}
          onCheckoutCreated={navigateToListingCheckout}
        />
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
          pageSize={marketplace.pageSize}
          setPageSize={(pageSize) => { marketplace.setPage(1); marketplace.setPageSize(pageSize); }}
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
      {view === "post_checkout" && (
        <PostGemCheckout
          token={listingCheckoutToken}
          api={api}
          subscriptionPlans={subscriptionPlans}
          isSignedIn={isSignedIn}
          authResolved={authResolved}
          dashboard={account.dashboard}
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
