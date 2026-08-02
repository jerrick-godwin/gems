import { useEffect, useMemo, useState } from "react";
import { GemsAdminApiClient } from "@gems/api-client";
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
  const moderation = useAdminModerationWorkflow({
    api,
    token: session.token,
    enabled: Boolean(session.token && session.admin),
    setToken: session.setToken,
    setLoadError: session.setLoadError
  });
  const initialLocation = useMemo(() => parseAdminLocation(window.location.pathname, window.location.search), []);
  const [activeView, setActiveView] = useState<AdminView>(initialLocation.view);
  const [deepLink, setDeepLink] = useState<AdminDeepLink | undefined>(initialLocation.target);

  useEffect(() => {
    const onPopState = () => {
      const location = parseAdminLocation(window.location.pathname, window.location.search);
      setActiveView(location.view);
      setDeepLink(location.target);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!moderation.snapshot || !deepLink) return;
    setActiveView(resolveAdminDeepLink(moderation.snapshot, deepLink).view);
  }, [deepLink, moderation.snapshot]);

  const selectView = (view: AdminView) => {
    setActiveView(view);
    setDeepLink(undefined);
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

  const snapshot = moderation.snapshot;
  const pendingCount = snapshot ? snapshot.listings.filter((l) => l.moderationStatus === "queued").length : 0;
  const openReportsCount = snapshot ? snapshot.reports.filter((r) => r.status !== "resolved").length : 0;
  const moderationCount = pendingCount + openReportsCount;
  const allListingsSize = snapshot ? new Map([...snapshot.listings, ...snapshot.liveListings].map((l) => [l.id, l])).size : 0;
  const listingCount = allListingsSize;
  const userCount = snapshot ? snapshot.users.length : 0;
  const paymentCount = snapshot ? snapshot.payments.filter((p) => p.status === "pending").length : 0;

  return (
    <AdminShell 
      admin={session.admin} 
      handleLogout={session.handleLogout} 
      theme={session.theme} 
      setTheme={session.setTheme}
      activeView={activeView}
      onSelect={selectView}
      moderationCount={moderationCount}
      listingCount={listingCount}
      userCount={userCount}
      paymentCount={paymentCount}
    >
      {session.loadError ? <div className="admin-error" role="alert">{session.loadError}</div> : null}
      {moderation.error && moderation.snapshot ? <div className="admin-error" role="alert">{moderation.error} <button type="button" onClick={moderation.retry}>Retry</button></div> : null}
      {(session.loading || (moderation.loading && !moderation.snapshot) || (!moderation.snapshot && !moderation.error)) && (
        <StatusState title="Loading admin console" message="Checking admin session and moderation data." loading variant="admin" />
      )}
      {!moderation.loading && !moderation.snapshot && moderation.error ? (
        <StatusState title="Admin data unavailable" message={moderation.error} variant="admin" onRetry={moderation.retry} />
      ) : null}
      {!session.loading && moderation.snapshot && (
        <AdminConsole api={api} token={session.token} snapshot={moderation.snapshot} setSnapshot={moderation.setSnapshot} setLoadError={session.setLoadError} activeView={activeView} setActiveView={selectView} deepLink={deepLink} handleLogout={session.handleLogout} theme={session.theme} setTheme={session.setTheme} />
      )}
    </AdminShell>
  );
}

export default AdminApp;
