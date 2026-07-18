import type { GemsAdminApiClient } from "@gems/api-client";
import type {
  BillingHistoryPage,
  BillingInvoice,
  ListingBillingSummary,
  ListingSubscription,
  PaymentAttempt
} from "@gems/schemas";

export interface AdminBillingHistoryOptions {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: string;
}

export interface AdminBillingApi {
  billingHistory(token: string, options?: AdminBillingHistoryOptions): Promise<BillingHistoryPage>;
  downloadBillingInvoiceReceipt(token: string, invoiceId: string): Promise<{ blob: Blob; fileName: string }>;
  cancelListingSubscriptionAtPeriodEnd(token: string, subscriptionId: string): Promise<ListingBillingSummary | ListingSubscription>;
  reconcileBilling(token: string, subscriptionId: string): Promise<ListingBillingSummary | ListingSubscription>;
}

export function adminBillingApi(api: GemsAdminApiClient): Partial<AdminBillingApi> {
  return api as unknown as Partial<AdminBillingApi>;
}

export function mergeBillingHistory(
  current: BillingHistoryPage | null,
  next: BillingHistoryPage
): BillingHistoryPage {
  return {
    attempts: uniqueNewest([...(current?.attempts ?? []), ...next.attempts]),
    invoices: uniqueNewest([...(current?.invoices ?? []), ...next.invoices]),
    nextCursor: next.nextCursor
  };
}

export function mergePaymentAttempts(
  billingAttempts: PaymentAttempt[],
  legacyAttempts: PaymentAttempt[]
): PaymentAttempt[] {
  return uniqueNewest([...billingAttempts, ...legacyAttempts]);
}

export function normalizeBillingSummary(
  result: ListingBillingSummary | ListingSubscription
): ListingBillingSummary {
  if (!("listingId" in result) || !("planId" in result)) return result;
  const subscription = result as ListingSubscription & {
    graceEndsAt?: string;
    scheduledConversionAt?: string;
  };
  return {
    subscription,
    graceEndsAt: subscription.graceEndsAt,
    scheduledConversionAt: subscription.scheduledConversionAt
  };
}

export function invoiceNeedsAttention(invoice: BillingInvoice) {
  return invoice.status === "failed"
    || invoice.status === "action_required"
    || invoice.status === "uncollectible";
}

export function billingStatusClass(status: string) {
  if (status === "paid" || status === "succeeded") return "succeeded";
  if (status === "open" || status === "pending" || status === "scheduled") return "pending";
  if (status === "failed" || status === "action_required" || status === "uncollectible") return "failed";
  return status;
}

export function saveDownloadedFile({ blob, fileName }: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function matchesBillingInvoice(
  invoice: BillingInvoice,
  query: string,
  context: { userName?: string; userEmail?: string; listingTitle?: string } = {}
) {
  return matchesSearch([
    invoice.id,
    invoice.status,
    invoice.purpose,
    invoice.amountLkr,
    invoice.stripeInvoiceId,
    invoice.stripeCustomerId,
    invoice.stripeSubscriptionId,
    invoice.failureCode,
    invoice.failureMessage,
    context.userName,
    context.userEmail,
    context.listingTitle
  ], query);
}

export function matchesPaymentAttempt(
  attempt: PaymentAttempt,
  query: string,
  context: { userName?: string; userEmail?: string; listingTitle?: string } = {}
) {
  return matchesSearch([
    attempt.id,
    attempt.status,
    attempt.purpose,
    attempt.amountLkr,
    attempt.gateway,
    attempt.gatewayReference,
    attempt.stripeInvoiceId,
    attempt.stripeSubscriptionId,
    attempt.quote.plan.name,
    context.userName,
    context.userEmail,
    context.listingTitle
  ], query);
}

function uniqueNewest<T extends { id: string; createdAt: string }>(records: T[]) {
  return Array.from(new Map(records.map((record) => [record.id, record])).values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function matchesSearch(values: Array<string | number | undefined>, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  if (!normalizedQuery) return true;
  return values
    .filter((value) => value !== undefined)
    .join(" ")
    .toLocaleLowerCase("en-US")
    .includes(normalizedQuery);
}
