export type PaymentReturnStatus = "succeeded" | "pending" | "cancelled" | "expired" | "failed";

export function paymentReturnLocation(paymentIntentId: string, status: PaymentReturnStatus) {
  if (status === "succeeded") {
    return `/receipt?paymentIntentId=${encodeURIComponent(paymentIntentId)}`;
  }
  return `/listings?payment=${encodeURIComponent(status)}`;
}
