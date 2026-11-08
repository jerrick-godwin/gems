import { useCallback, useEffect, useRef, useState } from "react";
import { isAuthenticationError, type GemsAdminApiClient, type AdminModerationSnapshot, type AdminPage, type AdminPageQuery } from "@gems/api-client";
import { clearAdminSession } from "./useAdminSession";
import { publicErrorMessage } from "../../shared/helpers";

export function useAdminModerationWorkflow({ api, token, enabled, query, setToken, setLoadError }: {
  api: GemsAdminApiClient; token: string; enabled: boolean; query: AdminPageQuery;
  setToken: (token: string) => void; setLoadError: (error: string | null) => void;
}) {
  const [data, setData] = useState<AdminPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const key = JSON.stringify(query);
  const currentToken = useRef(token);
  currentToken.current = token;
  const requestSequence = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    if (!token || !enabled) { setData(null); setLoadedKey(""); return; }
    if (query.view === "overview" && !query.target) { setLoading(false); return; }
    let active = true;
    const sequence = ++requestSequence.current;
    setLoading(true); setError(null);
    api.page(token, JSON.parse(key)).then(result => {
      if (active && sequence === requestSequence.current) { setData(result); setLoadedKey(key); setError(null); setLoadError(null); }
    }).catch(error => {
      if (!active) return;
      const message = publicErrorMessage(error, "Unable to load admin section");
      if (isAuthenticationError(error)) { clearAdminSession(setToken); setData(null); setLoadError(message); }
      else setError(message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, enabled, key, reloadKey, setLoadError, setToken, token]);
  const refresh = useCallback(async () => {
    const requestKey = currentKey.current;
    const sequence = ++requestSequence.current;
    const result = await api.page(token, JSON.parse(requestKey));
    if (sequence === requestSequence.current && currentToken.current === token && requestKey === currentKey.current) { setData(result); setLoadedKey(requestKey); }
  }, [api, token]);
  const setSnapshot = (snapshot: AdminModerationSnapshot) => {
    setData(previous => previous ? { ...previous, snapshot } : previous);
    void refresh().catch(error => setError(publicErrorMessage(error, "Change saved; unable to refresh admin data.")));
  };
  return { data: loadedKey === key ? data : null, snapshot: loadedKey === key ? data?.snapshot ?? null : null,
    setSnapshot, loading, error, refresh, retry: () => setReloadKey(value => value + 1) };
}
