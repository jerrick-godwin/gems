import { initializeApp } from "firebase/app";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, updateProfile, type Auth, type User } from "firebase/auth";

export interface MarketplaceAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

interface LocalStoredUser {
  uid: string;
  email: string;
  name: string;
  password: string;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId
];
const hasPublicFirebaseConfig = requiredFirebaseConfig.every((value) => typeof value === "string" && value.trim().length > 0);
const canUseLocalAuth = import.meta.env.DEV && !hasPublicFirebaseConfig;
const localUsersKey = "gems-local-auth-users";
const localSessionKey = "gems-local-auth-session";
const localAuthListeners = new Set<(user: MarketplaceAuthUser | null) => void>();

export const app = hasPublicFirebaseConfig ? initializeApp(firebaseConfig) : undefined;
const firebaseAuth = app ? getAuth(app) : undefined;

function toAuthUser(user: User): MarketplaceAuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    getIdToken: (forceRefresh?: boolean) => user.getIdToken(forceRefresh)
  };
}

function readLocalUsers() {
  try {
    return JSON.parse(window.localStorage.getItem(localUsersKey) ?? "[]") as LocalStoredUser[];
  } catch {
    return [];
  }
}

function writeLocalUsers(users: LocalStoredUser[]) {
  window.localStorage.setItem(localUsersKey, JSON.stringify(users));
}

function uidFromEmail(email: string) {
  return `local-${email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user"}`;
}

function displayNameFromEmail(email: string) {
  return email.split("@")[0] || "Gem collector";
}

function encodeDevClaims(user: LocalStoredUser) {
  return btoa(JSON.stringify({ uid: user.uid, email: user.email, name: user.name })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toLocalAuthUser(user: LocalStoredUser): MarketplaceAuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.name,
    getIdToken: async () => `dev:${encodeDevClaims(user)}`
  };
}

function readLocalSessionUser() {
  const sessionEmail = window.localStorage.getItem(localSessionKey);
  if (!sessionEmail) return null;
  return readLocalUsers().find((user) => user.email === sessionEmail) ?? null;
}

function notifyLocalAuthListeners() {
  const user = readLocalSessionUser();
  const authUser = user ? toLocalAuthUser(user) : null;
  localAuthListeners.forEach((listener) => listener(authUser));
}

function createMissingConfigError() {
  return new Error("Local Firebase config is missing. Run in development to use local auth, or set VITE_FIREBASE_* values.");
}

class MarketplaceAuthClient {
  constructor(private readonly auth: Auth | undefined) {}

  onAuthStateChanged(callback: (user: MarketplaceAuthUser | null) => void) {
    if (this.auth) return onAuthStateChanged(this.auth, (user) => callback(user ? toAuthUser(user) : null));
    if (!canUseLocalAuth) {
      callback(null);
      return () => {};
    }

    const sessionUser = readLocalSessionUser();
    callback(sessionUser ? toLocalAuthUser(sessionUser) : null);
    localAuthListeners.add(callback);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === localSessionKey || event.key === localUsersKey) {
        notifyLocalAuthListeners();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      localAuthListeners.delete(callback);
      window.removeEventListener("storage", handleStorage);
    };
  }

  async signInOrSignUp({ email, password }: { email: string; password: string }) {
    if (this.auth) {
      try {
        return toAuthUser((await signInWithEmailAndPassword(this.auth, email, password)).user);
      } catch (error) {
        const canCreateAccount = error instanceof FirebaseError && ["auth/user-not-found", "auth/invalid-credential"].includes(error.code);
        if (!canCreateAccount) throw error;

        const credential = await createUserWithEmailAndPassword(this.auth, email, password);
        await updateProfile(credential.user, { displayName: displayNameFromEmail(email) });
        await credential.user.getIdToken(true);
        return toAuthUser(credential.user);
      }
    }

    if (!canUseLocalAuth) throw createMissingConfigError();

    const users = readLocalUsers();
    const existing = users.find((user) => user.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      if (existing.password !== password) throw new Error("Password does not match this email.");
      window.localStorage.setItem(localSessionKey, existing.email);
      notifyLocalAuthListeners();
      return toLocalAuthUser(existing);
    }

    const created = { uid: uidFromEmail(email), email, name: displayNameFromEmail(email), password };
    users.push(created);
    writeLocalUsers(users);
    window.localStorage.setItem(localSessionKey, created.email);
    notifyLocalAuthListeners();
    return toLocalAuthUser(created);
  }

  async signOut() {
    if (this.auth) {
      await this.auth.signOut();
      return;
    }
    window.localStorage.removeItem(localSessionKey);
    notifyLocalAuthListeners();
  }
}

export const authClient = new MarketplaceAuthClient(firebaseAuth);
