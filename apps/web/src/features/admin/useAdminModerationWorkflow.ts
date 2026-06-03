import { useEffect, useState } from "react";
import type { GemsAdminApiClient, AdminModerationSnapshot } from "@gems/api-client";
import { clearAdminSession } from "./useAdminSession";

export function useAdminModerationWorkflow({
  api,
  token,
  enabled,
  setToken,
  setLoadError
}: {
  api: GemsAdminApiClient;
  token: string;
  enabled: boolean;
  setToken: (token: string) => void;
  setLoadError: (error: string | null) => void;
}) {
  const [snapshot, setSnapshot] = useState<AdminModerationSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !enabled) {
      setSnapshot(null);
      return;
    }

    let active = true;
    setLoading(true);
    api.moderationSnapshot(token)
      .then((nextSnapshot) => {
        if (!active) return;
        setSnapshot(nextSnapshot);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        clearAdminSession(setToken);
        setSnapshot(null);
        setLoadError(error instanceof Error ? error.message : "Admin session expired");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, enabled, setLoadError, setToken, token]);

  return { snapshot, setSnapshot, loading };
}
