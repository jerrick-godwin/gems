import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentIntent } from "@gems/schemas";

const fallbackSecret = "local-webxpay-development-secret";

function paymentSecret() {
  return process.env.WEBXPAY_SECRET || fallbackSecret;
}

export function signPaymentIntent(intentId: string, status = "succeeded") {
  return createHmac("sha256", paymentSecret()).update(`${intentId}:${status}`).digest("hex");
}

export function verifyPaymentSignature(intentId: string, status: string, signature?: string | null) {
  if (!signature) return false;
  const expected = Buffer.from(signPaymentIntent(intentId, status), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createWebxpayPaymentUrl(intent: PaymentIntent) {
  const publicSiteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") || `http://localhost:${process.env.PORT ?? 4100}`;
  const returnUrl = `${publicSiteUrl}/api/v1/payments/${intent.id}/return`;
  const cancelUrl = `${publicSiteUrl}/api/v1/payments/${intent.id}/cancel`;
  const callbackUrl = `${publicSiteUrl}/api/v1/payments/webxpay/callback`;
  const endpoint = process.env.WEBXPAY_ENDPOINT?.trim();

  if (!endpoint) {
    const signature = signPaymentIntent(intent.id);
    return `${returnUrl}?status=succeeded&signature=${signature}`;
  }

  const params = new URLSearchParams({
    merchant_id: process.env.WEBXPAY_MERCHANT_ID ?? "",
    order_id: intent.id,
    amount: String(intent.amountLkr),
    currency: intent.currency,
    description: `${intent.quote.plan.name} listing subscription for gemslanka.lk`,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    callback_url: callbackUrl
  });

  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params.toString()}`;
}
