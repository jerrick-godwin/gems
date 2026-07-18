import type { PaymentAttempt, PaymentStatus } from "@gems/schemas";
import { paymentNoticeFromResult, type PaymentNotice } from "./helpers";

export type ReceiptReference =
  | { kind: "billing-invoice"; id: string }
  | { kind: "payment-attempt"; id: string };

export type PaymentReturnReference = {
  result: string;
  paymentAttemptId?: string;
};

export type PaymentAttemptPollResult = {
  attempt?: PaymentAttempt;
  state: "settled" | "exhausted" | "cancelled";
  polls: number;
};

type PollPaymentAttemptOptions = {
  load: () => Promise<PaymentAttempt>;
  maxPolls?: number;
  intervalMs?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

const pendingPaymentStatuses = new Set<PaymentStatus>(["pending", "scheduled"]);
export const PAYMENT_ATTEMPT_POLL_INTERVAL_MS = 2_000;
export const PAYMENT_ATTEMPT_MAX_POLLS = 15;

export function receiptReferenceFromSearch(search: string): ReceiptReference | null {
  const params = new URLSearchParams(search);
  const billingInvoiceId = params.get("billingInvoiceId") ?? params.get("invoiceId");
  if (billingInvoiceId) return { kind: "billing-invoice", id: billingInvoiceId };

  const paymentAttemptId = params.get("paymentAttemptId") ?? params.get("paymentIntentId");
  return paymentAttemptId ? { kind: "payment-attempt", id: paymentAttemptId } : null;
}

export function paymentReturnReferenceFromSearch(search: string): PaymentReturnReference | null {
  const params = new URLSearchParams(search);
  const result = params.get("payment");
  if (!result) return null;

  const paymentAttemptId = params.get("paymentAttemptId") ?? params.get("paymentIntentId") ?? undefined;
  return { result, paymentAttemptId };
}

export function removePaymentReturnParams(url: URL) {
  url.searchParams.delete("payment");
  url.searchParams.delete("paymentAttemptId");
  url.searchParams.delete("paymentIntentId");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isPendingPaymentStatus(status: PaymentStatus) {
  return pendingPaymentStatuses.has(status);
}

export function paymentNoticeForAttempt(status: PaymentStatus, exhausted = false): PaymentNotice {
  if (exhausted && isPendingPaymentStatus(status)) {
    return {
      tone: "neutral",
      message: "Payment is still processing. You can safely leave this page; My Listings will show the latest status when it is confirmed."
    };
  }
  if (status === "succeeded") return paymentNoticeFromResult("success")!;
  if (status === "scheduled") {
    return { tone: "neutral", message: "Payment is scheduled. My Listings will update after it is processed." };
  }
  return paymentNoticeFromResult(status) ?? {
    tone: "neutral",
    message: "Your latest payment status is available in My Listings."
  };
}

export async function pollPaymentAttempt({
  load,
  maxPolls = PAYMENT_ATTEMPT_MAX_POLLS,
  intervalMs = PAYMENT_ATTEMPT_POLL_INTERVAL_MS,
  requestTimeoutMs = PAYMENT_ATTEMPT_POLL_INTERVAL_MS,
  signal,
  wait = waitForDelay
}: PollPaymentAttemptOptions): Promise<PaymentAttemptPollResult> {
  const boundedMaxPolls = Math.max(1, Math.floor(maxPolls));
  let latestAttempt: PaymentAttempt | undefined;
  const deadline = Date.now() + boundedMaxPolls * Math.max(1, intervalMs);

  for (let polls = 1; polls <= boundedMaxPolls; polls += 1) {
    if (signal?.aborted) return { attempt: latestAttempt, state: "cancelled", polls: polls - 1 };
    const pollStartedAt = Date.now();
    const remainingMs = Math.max(1, deadline - pollStartedAt);
    try {
      latestAttempt = await withRequestDeadline(load(), Math.min(Math.max(1, requestTimeoutMs), remainingMs));
      if (!isPendingPaymentStatus(latestAttempt.status)) {
        return { attempt: latestAttempt, state: "settled", polls };
      }
    } catch {
      // Verification/network timeouts are transient; the bounded poll loop leaves a manual recovery action.
    }
    if (polls < boundedMaxPolls) {
      const delayMs = Math.min(
        Math.max(0, intervalMs - (Date.now() - pollStartedAt)),
        Math.max(0, deadline - Date.now())
      );
      if (delayMs > 0) await wait(delayMs, signal);
    }
    if (Date.now() >= deadline) return { attempt: latestAttempt, state: signal?.aborted ? "cancelled" : "exhausted", polls };
  }

  return { attempt: latestAttempt, state: signal?.aborted ? "cancelled" : "exhausted", polls: boundedMaxPolls };
}

function withRequestDeadline<T>(request: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new Error("Payment status request timed out.")), timeoutMs);
    request.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function waitForDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const finish = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
