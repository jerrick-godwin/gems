import { useEffect, useState } from "react";
import type { CustomerAuthClient } from "../firebase";
import { createImpersonationAuthClient } from "../firebase";
import { CustomerRoot } from "./CustomerRoot";
import type { ImpersonationInfo } from "../features/admin/ImpersonationBanner";
import { isImpersonationErrorMessage, isImpersonationStartMessage, type ImpersonationReadyMessage } from "../features/admin/impersonationMessages";
import { viewFromPathname } from "../shared/types";
import App from "../App";

function impersonationPathname(pathname: string) {
  const stripped = pathname.replace(/^\/impersonate/, "") || "/";
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

export function ImpersonationEntry() {
  const requestId = new URLSearchParams(window.location.search).get("request") ?? "";
  const [authClient, setAuthClient] = useState<CustomerAuthClient | null>(null);
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let client: CustomerAuthClient | undefined;

    void createImpersonationAuthClient().then((nextClient) => {
      if (!active) return;
      client = nextClient;
      setAuthClient(nextClient);
      unsubscribe = nextClient.onAuthStateChanged((user) => {
        if (!active) return;
        if (user) setInfo({ uid: user.uid, email: user.email ?? "Impersonated user" });
        else if (!requestId) setError("This impersonation session has ended.");
      });

      if (requestId && window.opener) {
        const ready: ImpersonationReadyMessage = { type: "gems:impersonation-ready", requestId };
        window.opener.postMessage(ready, window.location.origin);
      }
    }).catch(() => {
      if (active) setError("Unable to initialize the isolated impersonation session.");
    });

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.opener || !client) return;
      if (isImpersonationStartMessage(event.data, requestId)) {
        void client.signInWithCustomToken(event.data.customToken)
          .then(() => {
            if (active) {
              setInfo({ uid: event.data.userId, email: event.data.email });
              window.history.replaceState(null, "", "/impersonate");
            }
          })
          .catch(() => active && setError("Unable to sign in as the selected user."));
      } else if (isImpersonationErrorMessage(event.data, requestId)) {
        setError(event.data.message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener("message", onMessage);
    };
  }, [requestId]);

  if (error) return <main className="status-state"><h1>Impersonation unavailable</h1><p>{error}</p><button type="button" onClick={() => window.close()}>Close tab</button></main>;
  if (!authClient || !info) return <main className="status-state" aria-busy="true"><h1>Opening isolated session</h1><p>Waiting for the admin console.</p></main>;

  return (
    <CustomerRoot
      initialTheme={document.documentElement.dataset.theme === "dark" ? "dark" : "light"}
      initialView={viewFromPathname(impersonationPathname(window.location.pathname))}
      accountComponent={App}
      authClient={authClient}
      basePath="/impersonate"
      impersonationInfo={info}
    />
  );
}
