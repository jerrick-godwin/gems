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
  const termsUrl = process.env.WEBXPAY_TERMS_URL || `${publicSiteUrl}/terms-and-conditions`;
  const privacyUrl = process.env.WEBXPAY_PRIVACY_URL || `${publicSiteUrl}/privacy-policy`;
  const refundUrl = process.env.WEBXPAY_REFUND_POLICY_URL || `${publicSiteUrl}/refund-policy`;
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
    callback_url: callbackUrl,
    terms_url: termsUrl,
    terms_conditions_url: termsUrl,
    terms_and_conditions_url: termsUrl,
    privacy_url: privacyUrl,
    privacy_policy_url: privacyUrl,
    refund_url: refundUrl,
    refund_policy_url: refundUrl,
    cancellation_policy_url: refundUrl,
    refund_policy: "No refunds. Listing subscriptions, renewals, and extra-photo fees are non-refundable."
  });

  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params.toString()}`;
}
