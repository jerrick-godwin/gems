import { useMemo } from "react";
import { GemsAdminApiClient } from "@gems/api-client";
import { AdminConsole } from "./features/admin/AdminConsole";
import { AdminLogin } from "./features/admin/AdminLogin";
import { AdminShell } from "./features/admin/AdminShell";
import { useAdminModerationWorkflow } from "./features/admin/useAdminModerationWorkflow";
import { useAdminSession } from "./features/admin/useAdminSession";
import { StatusState } from "./shared/StatusState";

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

  if (!session.token || !session.admin) {
    return <AdminLogin error={session.loadError} loading={session.loading} onLogin={session.handleLogin} />;
  }

  return (
    <AdminShell admin={session.admin} handleLogout={session.handleLogout} theme={session.theme} setTheme={session.setTheme}>
      {session.loadError && <StatusState title="Admin unavailable" message={session.loadError} variant="admin" />}
      {(session.loading || moderation.loading || !moderation.snapshot) && !session.loadError && (
        <StatusState title="Loading admin console" message="Checking admin session and moderation data." loading variant="admin" />
      )}
      {!session.loading && !moderation.loading && moderation.snapshot && (
        <AdminConsole api={api} token={session.token} snapshot={moderation.snapshot} setSnapshot={moderation.setSnapshot} setLoadError={session.setLoadError} />
      )}
    </AdminShell>
  );
}

export default AdminApp;
