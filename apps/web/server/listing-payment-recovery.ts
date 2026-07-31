import type { EffectiveListingPaymentStatus, ListingSubscription, PaymentIntent } from "@gems/schemas";

export type ListingPaymentRecoveryKind =
  | "not_required"
  | "trial_checkout"
  | "hosted_invoice"
  | "reuse_checkout"
  | "new_checkout"
  | "not_recoverable";

export function listingPaymentRecoveryKind(subscription: ListingSubscription, payment: PaymentIntent | undefined, now = new Date()): ListingPaymentRecoveryKind {
  const hasPaidAccess = (subscription.status === "active" || subscription.status === "past_due")
    && Boolean(subscription.expiresAt && new Date(subscription.expiresAt) > now);

  if (hasPaidAccess && subscription.status !== "past_due") return "not_required";
  if (subscription.source === "trial") return "trial_checkout";
  if (subscription.status === "past_due" && subscription.startsAt) return "hosted_invoice";
  if (subscription.status === "pending_payment" && payment?.status === "pending" && payment.paymentUrl) return "reuse_checkout";
  if (["pending_payment", "past_due", "cancelled", "expired"].includes(subscription.status)) return "new_checkout";
  return "not_recoverable";
}

export function effectiveListingPaymentStatus(subscription: ListingSubscription, payments: PaymentIntent[]): EffectiveListingPaymentStatus {
  if (subscription.status === "past_due") return "failed";
  if (subscription.status === "active") return "paid";
  if (subscription.source === "trial") return "required";

  const currentPayment = payments.find((payment) => payment.id === subscription.paymentIntentId)
    ?? payments.find((payment) => payment.subscriptionId === subscription.id);
  if (subscription.status === "pending_payment") {
    if (currentPayment?.status === "failed") return "failed";
    if (currentPayment?.status === "pending") return "pending";
  }
  return "required";
}
