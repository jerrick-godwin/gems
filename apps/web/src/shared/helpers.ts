export type PaymentNotice = {
  tone: "success" | "warning" | "error" | "neutral";
  message: string;
};

export function paymentNoticeFromResult(result: string): PaymentNotice | null {
  if (result === "success") {
    return { tone: "success", message: "Payment received. Your listing has moved into moderation." };
  }
  if (result === "cancelled") {
    return { tone: "warning", message: "Checkout was cancelled. Your listing is still saved, and you can restart payment from My Listings." };
  }
  if (result === "pending") {
    return { tone: "neutral", message: "Payment is pending. We will update your listing after Stripe confirms it." };
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
