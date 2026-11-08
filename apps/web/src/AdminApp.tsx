import { useEffect, useMemo, useState } from "react";
import { GemsAdminApiClient, type AdminModerationSnapshot } from "@gems/api-client";
import { AdminConsole } from "./features/admin/AdminConsole";
import { AdminLogin } from "./features/admin/AdminLogin";
import { AdminShell } from "./features/admin/AdminShell";
import { useAdminModerationWorkflow } from "./features/admin/useAdminModerationWorkflow";
import { useAdminSession } from "./features/admin/useAdminSession";
import { StatusState } from "./shared/StatusState";
import { adminViewUrl, parseAdminLocation, resolveAdminDeepLink, type AdminDeepLink, type AdminView } from "./features/admin/adminState";

const defaultApiBaseUrl = window.location.port === "4200" ? "http://127.0.0.1:4100" : "/api/v1";

function AdminApp() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;
  const api = useMemo(() => new GemsAdminApiClient(apiBaseUrl), [apiBaseUrl]);
  const session = useAdminSession(api);
  const initialLocation = useMemo(() => parseAdminLocation(window.location.pathname, window.location.search), []);
  const [activeView, setActiveView] = useState<AdminView>(initialLocation.view);
  const [deepLink, setDeepLink] = useState<AdminDeepLink | undefined>(initialLocation.target);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const moderation = useAdminModerationWorkflow({ api, token: session.token,
    enabled: Boolean(session.token && session.admin),
    query: { view: activeView, page, search: debouncedSearch, target: deepLink },
    setToken: session.setToken, setLoadError: session.setLoadError });
  const counts = moderation.data?.counts ?? session.counts;
  useEffect(() => { if (moderation.data) session.setCounts(moderation.data.counts); }, [moderation.data, session.setCounts]);

  useEffect(() => {
    const onPopState = () => {
      const location = parseAdminLocation(window.location.pathname, window.location.search);
      setActiveView(location.view);
      setDeepLink(location.target); setPage(1); setSearch(""); setDebouncedSearch("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);


  const selectView = (view: AdminView) => {
    setActiveView(view);
    setDeepLink(undefined); setPage(1); setSearch(""); setDebouncedSearch("");
    window.history.pushState(null, "", adminViewUrl(view));
  };

  if (!session.token) {
    return <AdminLogin error={session.loadError} loading={session.loading} onLogin={session.handleLogin} />;
  }
  if (!session.admin) {
    return session.loading
      ? <StatusState title="Loading admin console" message="Checking admin session." loading variant="admin" />
      : <StatusState title="Admin unavailable" message={session.loadError ?? "Unable to verify admin session"} variant="admin" onRetry={session.retry} />;
  }

  const empty: AdminModerationSnapshot = { listings: [], liveListings: [], reportedListings: [], reports: [], users: [], sellers: [], payments: [], orders: [] };
  const snapshot = activeView === "overview" && !deepLink ? empty : moderation.snapshot;
  const displayView = moderation.data?.view ?? activeView;
  const moderationCount = (counts?.queued ?? 0) + (counts?.reports ?? 0);
  const listingCount = counts?.listings ?? 0;
  const userCount = counts?.users ?? 0;
  const paymentCount = counts?.pending ?? 0;

  return (
    <AdminShell 
      admin={session.admin} 
      handleLogout={session.handleLogout} 
      theme={session.theme} 
      setTheme={session.setTheme}
      activeView={displayView}
      onSelect={selectView}
      moderationCount={moderationCount}
      listingCount={listingCount}
      userCount={userCount}
      paymentCount={paymentCount}
    >
      {session.loadError ? <div className="admin-error" role="alert">{session.loadError}</div> : null}
      {displayView !== "overview" && !deepLink && (
        <label className="admin-section-search">Search this section
          <input aria-label="Search this section" value={search} onChange={event => setSearch(event.target.value)} type="search" />
        </label>
      )}
      {moderation.error && <div role="alert">{moderation.error} <button onClick={moderation.retry}>Retry</button></div>}
      {!snapshot && !moderation.error && <StatusState title="Loading admin section" message="Loading records." loading variant="admin" />}
      {snapshot && counts && <AdminConsole api={api} token={session.token} snapshot={snapshot} counts={counts}
        refreshSnapshot={moderation.refresh} setSnapshot={moderation.setSnapshot} setLoadError={session.setLoadError}
        activeView={displayView} setActiveView={selectView} deepLink={deepLink} handleLogout={session.handleLogout} theme={session.theme} setTheme={session.setTheme} />}
      {moderation.data && displayView !== "overview" && (
        <nav aria-label="Admin pagination">
          <button disabled={moderation.loading || moderation.data.page <= 1} onClick={() => setPage(moderation.data!.page - 1)}>Previous</button>
          <span> Page {moderation.data.page} of {Math.max(1, Math.ceil(moderation.data.total / 50))} · {moderation.data.total} records </span>
          <button disabled={moderation.loading || moderation.data.page * 50 >= moderation.data.total} onClick={() => setPage(moderation.data!.page + 1)}>Next</button>
        </nav>
      )}
    </AdminShell>
  );
}

export default AdminApp;
