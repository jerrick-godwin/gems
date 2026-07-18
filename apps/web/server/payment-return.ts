export type PaymentReturnStatus = "succeeded" | "scheduled" | "pending" | "cancelled" | "expired" | "failed";

export function paymentReturnLocation(paymentIntentId: string, status: PaymentReturnStatus) {
  if (status === "succeeded") {
    return `/receipt?paymentIntentId=${encodeURIComponent(paymentIntentId)}`;
  }
  return `/listings?payment=${encodeURIComponent(status)}&paymentAttemptId=${encodeURIComponent(paymentIntentId)}`;
}
