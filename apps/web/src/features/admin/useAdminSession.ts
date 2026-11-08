import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onIdTokenChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { isAuthenticationError, type GemsAdminApiClient, type AdminSession, type AdminCounts } from "@gems/api-client";
import { useTheme } from "@gems/ui";
import { publicErrorMessage } from "../../shared/helpers";

const tokenStorageKey = "gems-admin-token";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_ADMIN_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_ADMIN_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_ADMIN_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_ADMIN_FIREBASE_APP_ID
};
const configured = Object.values(firebaseConfig).every(value => typeof value === "string" && value.trim() && !value.startsWith("replace-with-"));
const firebaseApp = configured ? getApps().find(app => app.name === "admin") ?? initializeApp(firebaseConfig, "admin") : undefined;
const auth = firebaseApp ? getAuth(firebaseApp) : undefined;

export function clearAdminSession(setToken: (token: string) => void) {
  window.localStorage.removeItem(tokenStorageKey);
  setToken("");
}

export function useAdminSession(api: GemsAdminApiClient) {
  const [token, setToken] = useState("");
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const [theme, setTheme] = useTheme("admin-theme");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!auth) return;
    let active = true;
    let generation = 0;
    let refresh: Promise<void> | undefined;
    const unsubscribe = onIdTokenChanged(auth, async user => {
      const request = ++generation;
      try {
        const nextToken = user ? await user.getIdToken() : "";
        if (!active || request !== generation) return;
        window.localStorage.removeItem(tokenStorageKey);
        setToken(nextToken);
        if (!nextToken) { setAdmin(null); setCounts(null); setLoading(false); }
      } catch (error) {
        if (active) { setLoadError(publicErrorMessage(error, "Unable to refresh admin session")); setLoading(false); }
      }
    });
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !auth.currentUser || refresh) return;
      // Firebase reuses a valid token and refreshes only when necessary.
      refresh = auth.currentUser.getIdToken().then(next => { if (active) setToken(next); })
        .catch(() => {}).finally(() => { refresh = undefined; });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; generation++; unsubscribe(); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  useEffect(() => {
    if (!token) { setAdmin(null); setCounts(null); return; }
    let active = true;
    setLoading(true);
    api.bootstrap(token).then(result => {
      if (active) { setAdmin(result.admin); setCounts(result.counts); setLoadError(null); }
    }).catch(error => {
      if (!active) return;
      if (isAuthenticationError(error)) { clearAdminSession(setToken); setAdmin(null); }
      setLoadError(publicErrorMessage(error, "Unable to verify admin session"));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, token, retryKey]);

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      if (!auth) throw new Error("Admin sign in is temporarily unavailable.");
      await signInWithEmailAndPassword(auth, email, password);
      setLoadError(null);
    } catch (error) { clearAdminSession(setToken); setLoadError(publicErrorMessage(error, "Unable to sign in")); setLoading(false); }
  };
  const handleLogout = () => {
    if (auth) void signOut(auth).catch(() => setLoadError("Unable to finish signing out. Please retry."));
    clearAdminSession(setToken); setAdmin(null); setCounts(null); setLoadError(null); setLoading(false);
  };
  return { token, setToken, admin, counts, setCounts, theme, setTheme, loadError, setLoadError, loading, retry: () => setRetryKey(value => value + 1), handleLogin, handleLogout };
}
