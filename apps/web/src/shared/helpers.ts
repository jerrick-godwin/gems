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

export function formatTimeAgo(dateString: string | undefined): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} Day${diffDays > 1 ? 's' : ''} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} Hour${diffHours > 1 ? 's' : ''} ago`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''} ago`;
  }
  return "Just now";
}

export function formatPostedDate(dateString: string | undefined): string | null {
  if (!dateString) return null;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(dateString));
}
