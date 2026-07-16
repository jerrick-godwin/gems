import { startTransition, useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { GemsApiClient, type MarketplaceReferences } from "@gems/api-client";
import type { PublicRouteData } from "../public/types.js";
import { MarketplaceRoute } from "../features/marketplace/MarketplaceRoute.js";
import type { AccountSurfaceProps, CustomerAuthState, CustomerNavigationOptions, MarketplaceReferenceState } from "../shared/customer.js";
import { pathForView, viewFromPathname, type View } from "../shared/types.js";

type AccountSurfaceModule = { default: ComponentType<AccountSurfaceProps> };

type CustomerRootProps = {
  initialTheme: "light" | "dark";
  initialPublicRoute?: PublicRouteData;
  initialView?: View;
  accountComponent?: ComponentType<AccountSurfaceProps>;
  loadAccountComponent?: () => Promise<AccountSurfaceModule>;
};

type CustomerHistoryState = {
  customerSurface: "public" | "account";
  customerEntryKey: string;
  view?: View;
};

const emptyReferences: MarketplaceReferences = { gemTypes: [], locations: [] };
const api = new GemsApiClient("/api/v1");
let entrySequence = 0;

function nextEntryKey() {
  entrySequence += 1;
  return `customer-${Date.now().toString(36)}-${entrySequence.toString(36)}`;
}

function referencesFromRoute(route?: PublicRouteData): MarketplaceReferences | undefined {
  if (route?.kind !== "marketplace" && route?.kind !== "category") return undefined;
  if (route.data.gemTypes.length === 0 || route.data.locations.length === 0) return undefined;
  return { gemTypes: route.data.gemTypes, locations: route.data.locations };
}

function isPublicOnlyView(view: View) {
  return view === "contact" || view === "terms" || view === "privacy" || view === "refund";
}

function defaultAccountLoader() {
  return import("../account-entry.js") as Promise<AccountSurfaceModule>;
}

export function CustomerRoot({
  initialTheme,
  initialPublicRoute,
  initialView = "market",
  accountComponent,
  loadAccountComponent = defaultAccountLoader
}: CustomerRootProps) {
  const initialReferences = referencesFromRoute(initialPublicRoute);
  const [surface, setSurface] = useState<"public" | "account">(initialPublicRoute ? "public" : "account");
  const [view, setView] = useState<View>(initialView);
  const [activePublicRoute, setActivePublicRoute] = useState(initialPublicRoute);
  const [publicRevision, setPublicRevision] = useState(0);
  const [LoadedAccount, setLoadedAccount] = useState<ComponentType<AccountSurfaceProps> | undefined>(() => accountComponent);
  const [pendingView, setPendingView] = useState<View | null>(null);
  const [authState, setAuthState] = useState<CustomerAuthState>({ status: "resolving", user: null });
  const [referenceData, setReferenceData] = useState<MarketplaceReferences>(initialReferences ?? emptyReferences);
  const [referenceStatus, setReferenceStatus] = useState<MarketplaceReferenceState["status"]>(
    initialReferences ? "ready" : "idle"
  );
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const accountLoadRef = useRef<Promise<ComponentType<AccountSurfaceProps>> | null>(null);
  const referenceLoadRef = useRef<Promise<MarketplaceReferences> | null>(null);
  const navigationSequenceRef = useRef(0);
  const currentPublicRouteRef = useRef(initialPublicRoute);
  const publicRouteCacheRef = useRef(new Map<string, PublicRouteData>());

  const ensureAccountLoaded = useCallback(() => {
    if (LoadedAccount) return Promise.resolve(LoadedAccount);
    if (!accountLoadRef.current) {
      accountLoadRef.current = loadAccountComponent().then((module) => {
        setLoadedAccount(() => module.default);
        return module.default;
      }).finally(() => {
        accountLoadRef.current = null;
      });
    }
    return accountLoadRef.current;
  }, [LoadedAccount, loadAccountComponent]);

  const loadReferences = useCallback(() => {
    if (referenceStatus === "ready") return Promise.resolve(referenceData);
    if (!referenceLoadRef.current) {
      setReferenceStatus("loading");
      setReferenceError(null);
      referenceLoadRef.current = api.marketplaceReferences()
        .then((nextReferences) => {
          setReferenceData(nextReferences);
          setReferenceStatus("ready");
          return nextReferences;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unable to load gem types and locations.";
          setReferenceStatus("error");
          setReferenceError(message);
          throw error;
        })
        .finally(() => {
          referenceLoadRef.current = null;
        });
    }
    return referenceLoadRef.current;
  }, [referenceData, referenceStatus]);

  const retryReferences = useCallback(() => {
    void loadReferences().catch(() => {});
  }, [loadReferences]);

  const ensureCurrentPublicEntry = useCallback(() => {
    const existing = window.history.state as Partial<CustomerHistoryState> | null;
    const key = existing?.customerSurface === "public" && existing.customerEntryKey
      ? existing.customerEntryKey
      : nextEntryKey();
    if (existing?.customerSurface !== "public" || !existing.customerEntryKey) {
      window.history.replaceState({ ...existing, customerSurface: "public", customerEntryKey: key }, "", window.location.href);
    }
    const route = currentPublicRouteRef.current;
    if (route) publicRouteCacheRef.current.set(key, route);
    return key;
  }, []);

  const commitAccountNavigation = useCallback((nextView: View, options: CustomerNavigationOptions = {}) => {
    const path = options.path ?? pathForView(nextView);
    const state: CustomerHistoryState = { customerSurface: "account", customerEntryKey: nextEntryKey(), view: nextView };
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (options.replace) window.history.replaceState(state, "", path);
    else if (path !== currentUrl) window.history.pushState(state, "", path);
    startTransition(() => {
      setView(nextView);
      setSurface("account");
    });
  }, []);

  const prepareAccountNavigation = useCallback((nextView: View, options: CustomerNavigationOptions = {}) => {
    const sequence = ++navigationSequenceRef.current;
    setPendingView(nextView);
    const preparations: Promise<unknown>[] = [ensureAccountLoaded()];
    if (nextView === "post") preparations.push(loadReferences());

    void Promise.all(preparations)
      .then(() => {
        if (sequence !== navigationSequenceRef.current) return;
        ensureCurrentPublicEntry();
        commitAccountNavigation(nextView, options);
        setPendingView(null);
      })
      .catch(() => {
        if (sequence !== navigationSequenceRef.current) return;
        setPendingView(null);
        window.location.assign(options.path ?? pathForView(nextView));
      });
  }, [commitAccountNavigation, ensureAccountLoaded, ensureCurrentPublicEntry, loadReferences]);

  const navigate = useCallback((nextView: View, options: CustomerNavigationOptions = {}) => {
    if (surface === "public") {
      if (nextView === "market" || isPublicOnlyView(nextView)) {
        window.location.assign(options.path ?? pathForView(nextView));
        return;
      }
      prepareAccountNavigation(nextView, options);
      return;
    }
    commitAccountNavigation(nextView, options);
  }, [commitAccountNavigation, prepareAccountNavigation, surface]);

  const preload = useCallback((nextView: View) => {
    if (surface !== "public" || nextView === "market" || isPublicOnlyView(nextView)) return;
    void ensureAccountLoaded().catch(() => {});
    if (nextView === "post") void loadReferences().catch(() => {});
  }, [ensureAccountLoaded, loadReferences, surface]);

  const updatePublicRoute = useCallback((route: PublicRouteData) => {
    currentPublicRouteRef.current = route;
    const state = window.history.state as Partial<CustomerHistoryState> | null;
    if (state?.customerSurface === "public" && state.customerEntryKey) {
      publicRouteCacheRef.current.set(state.customerEntryKey, route);
    }
  }, []);

  const pushPublicUrl = useCallback((href: string) => {
    ensureCurrentPublicEntry();
    const key = nextEntryKey();
    window.history.pushState({ customerSurface: "public", customerEntryKey: key } satisfies CustomerHistoryState, "", href);
  }, [ensureCurrentPublicEntry]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import("../firebase.js").then(({ authClient }) => {
      if (!active) return;
      unsubscribe = authClient.onAuthStateChanged((user) => {
        if (!active) return;
        setAuthState(user ? { status: "signed-in", user } : { status: "signed-out", user: null });
      });
    }).catch(() => {
      if (active) setAuthState({ status: "signed-out", user: null });
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (surface === "public") ensureCurrentPublicEntry();
  }, [ensureCurrentPublicEntry, surface]);

  useEffect(() => {
    if (surface === "account" && view === "post" && referenceStatus === "idle") {
      retryReferences();
    }
  }, [referenceStatus, retryReferences, surface, view]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as Partial<CustomerHistoryState> | null;
      if (state?.customerSurface === "public" && state.customerEntryKey) {
        const cachedRoute = publicRouteCacheRef.current.get(state.customerEntryKey);
        if (!cachedRoute) {
          window.location.assign(`${window.location.pathname}${window.location.search}${window.location.hash}`);
          return;
        }
        currentPublicRouteRef.current = cachedRoute;
        setActivePublicRoute(cachedRoute);
        setPublicRevision((current) => current + 1);
        startTransition(() => setSurface("public"));
        return;
      }

      const nextView = state?.view ?? viewFromPathname(window.location.pathname);
      void ensureAccountLoaded().then(() => {
        startTransition(() => {
          setView(nextView);
          setSurface("account");
        });
      }).catch(() => {
        window.location.assign(`${window.location.pathname}${window.location.search}${window.location.hash}`);
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [ensureAccountLoaded]);

  const references: MarketplaceReferenceState = {
    data: referenceData,
    status: referenceStatus,
    error: referenceError,
    retry: retryReferences
  };

  if (surface === "public" && activePublicRoute) {
    return (
      <MarketplaceRoute
        key={`public-${publicRevision}`}
        initialRoute={activePublicRoute}
        initialTheme={initialTheme}
        authState={authState}
        pendingView={pendingView}
        onNavigate={navigate}
        onNavigateIntent={preload}
        onRouteStateChange={updatePublicRoute}
        onPublicUrlChange={pushPublicUrl}
      />
    );
  }

  if (!LoadedAccount) return null;
  return <LoadedAccount view={view} authState={authState} references={references} navigate={navigate} />;
}
