import { useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onIdTokenChanged, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import type { GemsAdminApiClient, AdminSession } from "@gems/api-client";
import { useTheme } from "@gems/ui";
import { publicErrorMessage } from "../../shared/helpers";

const tokenStorageKey = "gems-admin-token";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_ADMIN_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_ADMIN_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_ADMIN_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_ADMIN_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_ADMIN_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_ADMIN_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_ADMIN_FIREBASE_MEASUREMENT_ID
};

function hasConfiguredFirebaseValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && !value.trim().startsWith("replace-with-");
}

const hasAdminFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId
].every(hasConfiguredFirebaseValue);

const firebaseApp = hasAdminFirebaseConfig ? initializeApp(firebaseConfig, "admin") : undefined;
const auth: Auth | undefined = firebaseApp ? getAuth(firebaseApp) : undefined;

export function clearAdminSession(setToken: (token: string) => void) {
  window.localStorage.removeItem(tokenStorageKey);
  setToken("");
}

export function useAdminSession(api: GemsAdminApiClient) {
  const [token, setToken] = useState(() => window.localStorage.getItem(tokenStorageKey) ?? "");
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [theme, setTheme] = useTheme("admin-theme");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (user) {
        const nextToken = await user.getIdToken();
        window.localStorage.setItem(tokenStorageKey, nextToken);
        setToken(nextToken);
      } else {
        clearAdminSession(setToken);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) {
      setAdmin(null);
      return;
    }

    let active = true;
    setLoading(true);
    api.me(token)
      .then((nextAdmin) => {
        if (!active) return;
        setAdmin(nextAdmin);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        clearAdminSession(setToken);
        setLoadError(publicErrorMessage(error, "Admin session expired"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      if (!auth) throw new Error("Admin sign in is temporarily unavailable. Please try again later.");
      await signInWithEmailAndPassword(auth, email, password);
      setLoadError(null);
    } catch (error) {
      clearAdminSession(setToken);
      setLoadError(publicErrorMessage(error, "Unable to sign in"));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (auth) void signOut(auth);
    clearAdminSession(setToken);
    setAdmin(null);
    setLoadError(null);
  };

  return { token, setToken, admin, theme, setTheme, loadError, setLoadError, loading, handleLogin, handleLogout };
}
