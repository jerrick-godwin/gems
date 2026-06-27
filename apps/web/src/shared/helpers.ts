export type PaymentNotice = {
  tone: "success" | "warning" | "error" | "neutral";
  message: string;
};

const internalProviderPatterns = [
  /\bFirebase(?: Authentication| Admin(?: SDK)?)?\b/i,
  /\bStripe\b/i,
  /\bSupabase\b/i,
  /\bAuth0\b/i,
  /\bClerk\b/i,
  /\bResend\b/i,
  /\bVercel\b/i,
  /\bPostgres(?:ql)?\b/i,
  /\bMongo(?:DB)?\b/i,
  /\bRedis\b/i,
  /\bVITE_(?:ADMIN_)?FIREBASE_[A-Z0-9_]+\b/,
  /\bauth\/[a-z0-9-]+\b/i
];

export function publicErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return sanitizePublicMessage(message, fallback);
}

export function sanitizePublicMessage(message: string, fallback = "Something went wrong. Please try again.") {
  const trimmed = message.trim();
  if (!trimmed) return fallback;

  if (internalProviderPatterns.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }

  return trimmed;
}

export function paymentNoticeFromResult(result: string): PaymentNotice | null {
  if (result === "success") {
    return { tone: "success", message: "Payment received. Your listing has moved into moderation." };
  }
  if (result === "cancelled") {
    return { tone: "warning", message: "Checkout was cancelled. Your listing is still saved, and you can restart payment from My Listings." };
  }
  if (result === "pending") {
    return { tone: "neutral", message: "Payment is pending. We will update your listing after confirmation." };
  }
  if (result === "failed" || result === "expired") {
    return { tone: "error", message: "Payment was not completed. You can restart checkout from My Listings." };
  }
  return null;
}

export function formatPriceInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("en-US") : "";
}

export function parsePriceInput(value: string) {
  return Number(value.replace(/\D/g, "") || 0);
}

export function isUploadableUrl(uploadUrl: string) {
  return uploadUrl.startsWith("http") || uploadUrl.startsWith("/");
}
