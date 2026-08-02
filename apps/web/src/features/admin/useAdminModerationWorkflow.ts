import { useEffect, useState } from "react";
import { isAuthenticationError, type GemsAdminApiClient, type AdminModerationSnapshot } from "@gems/api-client";
import { clearAdminSession } from "./useAdminSession";
import { publicErrorMessage } from "../../shared/helpers";

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
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
        setError(null);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = publicErrorMessage(error, "Unable to load admin snapshot");
        if (isAuthenticationError(error)) {
          clearAdminSession(setToken);
          setSnapshot(null);
          setLoadError(message);
        } else {
          setError(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, enabled, reloadKey, setLoadError, setToken, token]);

  return { snapshot, setSnapshot, loading, error, retry: () => setReloadKey((value) => value + 1) };
}
