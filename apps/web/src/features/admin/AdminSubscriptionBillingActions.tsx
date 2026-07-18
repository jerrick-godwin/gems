import { Ban, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { GemsAdminApiClient } from "@gems/api-client";
import type { ListingBillingSummary, ListingSubscriptionSummary } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import { adminBillingApi, normalizeBillingSummary } from "./adminBilling";

interface AdminSubscriptionBillingActionsProps {
  api: GemsAdminApiClient;
  token: string;
  subscriptionId?: string;
  currentSubscription?: ListingSubscriptionSummary;
}

export function AdminSubscriptionBillingActions({
  api,
  token,
  subscriptionId,
  currentSubscription
}: AdminSubscriptionBillingActionsProps) {
  const [summary, setSummary] = useState<ListingBillingSummary | null>(null);
  const [busyAction, setBusyAction] = useState<"cancel" | "reconcile" | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const billingApi = adminBillingApi(api);
  const subscription = summary?.subscription ?? currentSubscription;
  const resolvedSubscriptionId = subscriptionId ?? subscription?.id;
  const cancellationScheduled = subscription?.cancelAtPeriodEnd === true
    || subscription?.autoRenew === false
    || Boolean(subscription?.cancelledAt);
  const graceEndsAt = summary?.graceEndsAt ?? subscription?.graceEndsAt;
  const scheduledConversionAt = summary?.scheduledConversionAt ?? subscription?.scheduledConversionAt;
  const canCancel = Boolean(resolvedSubscriptionId && billingApi.cancelListingSubscriptionAtPeriodEnd);
  const canReconcile = Boolean(resolvedSubscriptionId && billingApi.reconcileBilling);

  if (!resolvedSubscriptionId || (!canCancel && !canReconcile)) return null;

  const cancelAtPeriodEnd = async () => {
    if (!billingApi.cancelListingSubscriptionAtPeriodEnd || !resolvedSubscriptionId) return;
    if (!window.confirm("Cancel this subscription at the end of its current service period? The listing keeps access until then.")) return;

    setBusyAction("cancel");
    setActionError("");
    setActionMessage("");
    try {
      const result = await billingApi.cancelListingSubscriptionAtPeriodEnd.call(api, token, resolvedSubscriptionId);
      setSummary(normalizeBillingSummary(result));
      setActionMessage("Cancellation is scheduled for the end of the current service period.");
    } catch (error) {
      setActionError(publicErrorMessage(error, "Unable to schedule cancellation"));
    } finally {
      setBusyAction(null);
    }
  };

  const reconcile = async () => {
    if (!billingApi.reconcileBilling || !resolvedSubscriptionId) return;

    setBusyAction("reconcile");
    setActionError("");
    setActionMessage("");
    try {
      const result = await billingApi.reconcileBilling.call(api, token, resolvedSubscriptionId);
      setSummary(normalizeBillingSummary(result));
      setActionMessage("Billing state reconciled with Stripe.");
    } catch (error) {
      setActionError(publicErrorMessage(error, "Unable to reconcile billing"));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div>
      <div className="active-listing-actions">
        {canReconcile && (
          <button type="button" className="active-listing-action" disabled={busyAction !== null} onClick={() => void reconcile()}>
            <RefreshCw size={15} aria-hidden="true" />
            {busyAction === "reconcile" ? "Reconciling..." : "Reconcile"}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            className="active-listing-action danger"
            disabled={busyAction !== null || cancellationScheduled}
            onClick={() => void cancelAtPeriodEnd()}
          >
            <Ban size={15} aria-hidden="true" />
            {busyAction === "cancel" ? "Scheduling..." : cancellationScheduled ? "Cancellation scheduled" : "Cancel at period end"}
          </button>
        )}
      </div>
      {graceEndsAt && <span className="admin-inline-note">Grace access ends {formatDateTime(graceEndsAt)}.</span>}
      {scheduledConversionAt && <span className="admin-inline-note">Plan conversion is scheduled for {formatDateTime(scheduledConversionAt)}.</span>}
      {cancellationScheduled && subscription?.expiresAt && <span className="admin-inline-note">Current access remains until {formatDateTime(subscription.expiresAt)}.</span>}
      {subscription?.stripeStatus && <span className="admin-inline-note">Stripe subscription status: {formatStatus(subscription.stripeStatus)}.</span>}
      {summary?.latestInvoice && <span className="admin-inline-note">Latest invoice: {formatStatus(summary.latestInvoice.status)}.</span>}
      {summary?.latestAttempt && <span className="admin-inline-note">Latest payment attempt: {formatStatus(summary.latestAttempt.status)}.</span>}
      {actionMessage && <span className="admin-inline-note" role="status">{actionMessage}</span>}
      {actionError && <span className="admin-inline-error" role="alert">{actionError}</span>}
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}
