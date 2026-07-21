import type { IncomingMessage } from "node:http";
import { cert, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FirebaseAuthClaims {
  uid: string;
  email: string;
  name: string;
}

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const serviceAccountPath = join(currentDir, "firebase-service-account.json");
const adminServiceAccountPath = join(currentDir, "admin-firebase-service-account.json");

let firebaseApp: App;
try {
  const serviceAccountContent = process.env.FIREBASE_SERVICE_ACCOUNT || readFileSync(serviceAccountPath, "utf-8");
  const serviceAccount = JSON.parse(serviceAccountContent);
  firebaseApp = initializeApp({
    credential: cert(serviceAccount)
  }, "default");
} catch (error) {
  console.warn("Failed to initialize Firebase Admin:", error);
}

let adminFirebaseApp: App;
try {
  const adminServiceAccountContent = process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT || readFileSync(adminServiceAccountPath, "utf-8");
  const adminServiceAccount = JSON.parse(adminServiceAccountContent);
  adminFirebaseApp = initializeApp({
    credential: cert(adminServiceAccount)
  }, "admin");
} catch (error) {
  console.warn("Failed to initialize Admin Firebase App:", error);
}

export function readBearerToken(request: IncomingMessage) {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

export async function verifyFirebaseIdToken(token: string, options: { allowDevelopmentFallback: boolean }): Promise<FirebaseAuthClaims> {
  if (options.allowDevelopmentFallback && token.startsWith("dev:")) {
    const payload = token.slice("dev:".length);
    try {
      const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(Buffer.from(normalizedPayload, "base64").toString("utf8")) as Partial<FirebaseAuthClaims>;
      if (claims.uid && claims.email) {
        return {
          uid: claims.uid,
          email: claims.email,
          name: claims.name ?? claims.email
        };
      }
    } catch {
      // Keep compatibility with the original plain dev token format.
    }

    return {
      uid: payload || "dev-user",
      email: "dev@example.com",
      name: "Development User"
    };
  }

  if (!firebaseApp) {
    throw new Error("Authentication service is not initialized.");
  }

  const decodedToken = await getAuth(firebaseApp).verifyIdToken(token);
  
  const uid = decodedToken.uid;
  const email = decodedToken.email ?? "";
  const name = decodedToken.name ?? email ?? "Gem Marketplace User";

  if (!uid || !email) {
    throw new Error("Authentication token is missing required claims");
  }

  return { uid, email, name };
}

export async function verifyAdminFirebaseIdToken(token: string): Promise<{ email: string, role: "admin" }> {
  if (!adminFirebaseApp) {
    throw new Error("Admin authentication service is not initialized.");
  }

  const decodedToken = await getAuth(adminFirebaseApp).verifyIdToken(token);
  
  const email = decodedToken.email;
  if (!email) {
    throw new Error("Authentication token is missing email claim");
  }

  return { email, role: "admin" };
}

export async function generatePasswordResetLink(email: string, redirectUrl: string): Promise<string> {
  if (!firebaseApp) {
    throw new Error("Authentication service is not initialized.");
  }
  
  const actionCodeSettings = {
    url: redirectUrl,
    handleCodeInApp: true,
  };

  return await getAuth(firebaseApp).generatePasswordResetLink(email, actionCodeSettings);
}

export async function generateImpersonationToken(firebaseUid: string): Promise<string> {
  if (!firebaseApp) {
    throw new Error("Authentication service is not initialized.");
  }
  // createCustomToken signs a JWT for this uid using the service account.
  // Tokens expire in 1 hour and are single-use once exchanged for an ID token.
  return getAuth(firebaseApp).createCustomToken(firebaseUid, { impersonated: true });
}

export async function getActiveAdminEmails(): Promise<string[]> {
  if (!adminFirebaseApp) {
    console.warn("Admin authentication service is not initialized, cannot fetch admin emails.");
    return [];
  }

  try {
    const listUsersResult = await getAuth(adminFirebaseApp).listUsers();
    return listUsersResult.users
      .filter((user) => !user.disabled && user.email)
      .map((user) => user.email as string);
  } catch (error) {
    console.error("Failed to fetch admin users:", error);
    return [];
  }
}
