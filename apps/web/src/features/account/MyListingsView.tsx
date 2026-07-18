import { ChevronLeft, ChevronRight, CreditCard, Download, ExternalLink, FileText, RefreshCcw, Trash2, ShieldCheck, Receipt, Search } from "lucide-react";
import { useState, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { GemsApiClient } from "@gems/api-client";
import { formatLkr, type BillingHistoryPage, type BillingInvoice, type GemType, type Listing, type ListingSubscription, type ListingSubscriptionSummary, type PaymentAttempt, type PaymentIntent, type Treatment, type UserDashboard, type ListingSubscriptionPlan } from "@gems/schemas";
import { createIdempotencyKey, useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { publicErrorMessage } from "../../shared/helpers";
import { TrialStatusPanel } from "./TrialStatusPanel";

export function MyListingsView({
  dashboard,
  gemTypes,
  subscriptionPlans,
  api,
  onDashboardChange,
  onNavigateToReceipt
}: {
  dashboard: UserDashboard | null;
  gemTypes: GemType[];
  subscriptionPlans: ListingSubscriptionPlan[];
  api: GemsApiClient;
  onDashboardChange: (dashboard: UserDashboard) => void;
  onNavigateToReceipt: (billingInvoiceId: string) => void;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [totalListings, setTotalListings] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isLoadingListings, setIsLoadingListings] = useState(true);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingSubscriptionId, setCancellingSubscriptionId] = useState<string | null>(null);
  const [payingSubscriptionId, setPayingSubscriptionId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryPage | null>(null);
  const [billingHistoryError, setBillingHistoryError] = useState<string | null>(null);
  const [loadingMoreBilling, setLoadingMoreBilling] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCancelSubscriptionId, setConfirmCancelSubscriptionId] = useState<string | null>(null);
  const cancelAction = useSingleFlightAction();
  const payAction = useSingleFlightAction();
  const deleteAction = useSingleFlightAction();
  const portalAction = useSingleFlightAction();
  const refreshBillingAction = useSingleFlightAction();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const fetchListings = async () => {
      setIsLoadingListings(true);
      try {
        const response = await api.getMyListings(page, 10, debouncedSearchQuery);
        if (active) {
          if (response.items.length === 0 && page > 1) {
            setPage(page - 1);
          } else {
            setListings(response.items);
            setTotalListings(response.total);
          }
        }
      } catch (error) {
        console.error("Failed to fetch listings:", error);
      } finally {
        if (active) setIsLoadingListings(false);
      }
    };
    fetchListings();
    return () => { active = false; };
  }, [api, page, debouncedSearchQuery, dashboard]);

  useEffect(() => {
    let active = true;
    setBillingHistoryError(null);
    api.billingHistory()
      .then((nextHistory) => {
        if (active) setBillingHistory(nextHistory);
      })
      .catch((error) => {
        if (!active) return;
        setBillingHistoryError(publicErrorMessage(error, "Unable to refresh billing history."));
      });
    return () => {
      active = false;
    };
  }, [api, dashboard?.recentPayments]);

  const getStatusLabel = (listing: Listing) => {
    if (listing.status === "rejected" || listing.moderationStatus === "rejected") {
      return { label: "Rejected", color: "var(--danger)", bg: "var(--danger-soft)" };
    }
    if (listing.moderationStatus === "approved") {
      return { label: "Approved", color: "var(--success)", bg: "var(--success-soft)" };
    }
    if (listing.moderationStatus === "queued" || listing.moderationStatus === "needs_changes" || listing.status === "pending_review") {
      return { label: "Review in Progress", color: "var(--gold)", bg: "rgba(251,191,36,0.15)" };
    }
    if (listing.status === "expired") {
      return { label: "Closed", color: "var(--sage)", bg: "var(--line-subtle)" };
    }
    return { label: listing.status.replace("_", " "), color: "var(--ink)", bg: "var(--line-subtle)" };
  };

  const handleCancelRenewal = async (subscriptionId: string) => {
    await cancelAction.run(async () => {
      try {
        setCancellingSubscriptionId(subscriptionId);
        await api.cancelListingSubscription(subscriptionId);
        onDashboardChange(await api.dashboard());
      } catch (error) {
        alert(`Failed to cancel renewal: ${publicErrorMessage(error, "Unknown error")}`);
      } finally {
        setCancellingSubscriptionId(null);
        setConfirmCancelSubscriptionId(null);
      }
    });
  };

  const handlePayNow = async (subscriptionId: string) => {
    await payAction.run(async () => {
      try {
        setPayingSubscriptionId(subscriptionId);
        const subscription = dashboard?.listingSubscriptions.find((item) => item.id === subscriptionId);
        let paymentIntent = await createPaymentAttemptWithFallback(api, subscriptionId);
        if (!paymentIntent.paymentUrl) {
          paymentIntent = await api.getListingSubscriptionPaymentIntent(subscriptionId).catch(() => paymentIntent);
        }
        if (!paymentIntent.paymentUrl) {
          alert(paymentIntent.status === "scheduled"
            ? "This payment is scheduled and does not need action right now."
            : "Checkout is not available for this payment yet. Refresh billing details or contact support if the issue continues.");
          setPayingSubscriptionId(null);
          payAction.release();
          return;
        }
        window.location.assign(paymentIntent.paymentUrl);
      } catch (error) {
        alert(`Failed to open checkout: ${publicErrorMessage(error, "Unknown error")}`);
        setPayingSubscriptionId(null);
        payAction.release();
      }
    }, { keepLocked: true });
  };

  const handleManageBilling = async () => {
    await portalAction.run(async () => {
      try {
        const returnUrl = `${window.location.origin}/listings`;
        const portal = await api.createBillingPortalSession(returnUrl);
        window.location.assign(portal.url);
      } catch (error) {
        alert(`Failed to open billing settings: ${publicErrorMessage(error, "Unknown error")}`);
        portalAction.release();
      }
    }, { keepLocked: true });
  };

  const handleRefreshBilling = async () => {
    await refreshBillingAction.run(async () => {
      let refreshError: unknown;
      await Promise.all([
        api.billingHistory()
          .then((nextHistory) => setBillingHistory(nextHistory))
          .catch((error) => { refreshError = error; }),
        api.dashboard()
          .then(onDashboardChange)
          .catch((error) => { refreshError ??= error; })
      ]);
      setBillingHistoryError(refreshError
        ? publicErrorMessage(refreshError, "Unable to refresh billing details.")
        : null);
    });
  };

  const handleLoadMoreBilling = async () => {
    if (!billingHistory?.nextCursor || loadingMoreBilling) return;
    setLoadingMoreBilling(true);
    try {
      const nextPage = await api.billingHistory({ cursor: billingHistory.nextCursor });
      setBillingHistory((current) => mergeBillingHistoryPages(current, nextPage));
      setBillingHistoryError(null);
    } catch (error) {
      setBillingHistoryError(publicErrorMessage(error, "Unable to load more billing history."));
    } finally {
      setLoadingMoreBilling(false);
    }
  };

  const handleDownloadReceipt = async (payment: PaymentAttempt | undefined, invoice: BillingInvoice | undefined) => {
    const receiptId = invoice?.id ?? payment?.id;
    if (!receiptId) return;
    try {
      setDownloadingReceiptId(receiptId);
      const receiptFile = invoice
        ? await api.downloadBillingInvoiceReceipt(invoice.id).catch(async (error) => {
          if (!payment) throw error;
          return api.downloadPaymentReceipt(payment.id);
        })
        : await api.downloadPaymentReceipt(payment!.id);
      const url = URL.createObjectURL(receiptFile.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = receiptFile.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert(`Failed to download receipt: ${publicErrorMessage(error, "Unknown error")}`);
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAction.run(async () => {
      try {
        setDeletingId(id);
        await api.removeMyListing(id);
        const newDashboard = await api.dashboard();
        onDashboardChange(newDashboard);
      } catch (error) {
        alert(`Failed to delete listing: ${publicErrorMessage(error, "Unknown error")}`);
      } finally {
        setDeletingId(null);
        setConfirmDeleteId(null);
      }
    });
  };

  const confirmDeleteListing = confirmDeleteId ? listings.find((listing) => listing.id === confirmDeleteId) : undefined;
  const confirmDeleteSubscription = confirmDeleteListing ? dashboard?.listingSubscriptions.find((item) => item.listingId === confirmDeleteListing.id) : undefined;
  const confirmDeleteRemovesAtExpiry = isSubscriptionInPaidAccess(confirmDeleteSubscription);
  const confirmCancelSubscription = confirmCancelSubscriptionId
    ? dashboard?.listingSubscriptions.find((subscription) => subscription.id === confirmCancelSubscriptionId)
    : undefined;
  const paymentAttempts = mergePaymentAttempts(billingHistory?.attempts ?? [], dashboard?.recentPayments ?? []);
  const billingInvoices = billingHistory?.invoices ?? [];
  const canManageBilling = Boolean(
    dashboard?.listingSubscriptions.some((subscription) => subscription.source === "paid") || billingInvoices.some((invoice) => invoice.stripeCustomerId)
  );

  return (
    <section className="dashboard">
      <div className="section-heading seller-listings-heading">
        <div className="seller-listings-heading-actions">
          <label className="seller-listings-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search listings..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search your listings"
            />
          </label>
          <button type="button" className="secondary-action" onClick={() => void handleRefreshBilling()} disabled={refreshBillingAction.busy}>
            {refreshBillingAction.busy ? <span className="button-spinner" aria-hidden="true" /> : <RefreshCcw size={17} />}
            {refreshBillingAction.busy ? "Refreshing..." : "Refresh Billing"}
          </button>
          {canManageBilling && (
            <button type="button" className="secondary-action" onClick={() => void handleManageBilling()} disabled={portalAction.busy}>
              {portalAction.busy ? <span className="button-spinner" aria-hidden="true" /> : <ExternalLink size={17} />}
              {portalAction.busy ? "Opening..." : "Manage Billing"}
            </button>
          )}
        </div>
      </div>
      {billingHistoryError && (
        <div className="payment-notice payment-notice-warning" role="status">
          <span>{billingHistoryError} Showing the latest saved account status.</span>
          <button type="button" onClick={() => void handleRefreshBilling()} disabled={refreshBillingAction.busy}>Retry billing details</button>
        </div>
      )}
      <TrialStatusPanel trial={dashboard?.user.trial} variant="compact" />
      <section className={`data-panel seller-listings-panel card card--surface ${isLoadingListings ? "is-loading" : ""}`}>
        {isLoadingListings && listings.length === 0 ? (
          <p className="seller-listings-state">Loading listings...</p>
        ) : listings.length === 0 ? (
          <p className="seller-listings-state">No listings found.</p>
        ) : (
          <div className="seller-listings-stack">
            {listings.map((listing) => {
              const statusInfo = getStatusLabel(listing);
              const gemTypeName = gemTypes.find((gemType) => gemType.id === listing.gemTypeId)?.name;
              const attributes = getListingAttributes(listing, gemTypeName);
              const subscription = dashboard?.listingSubscriptions.find((item) => item.listingId === listing.id);
              const plan = subscription ? subscriptionPlans.find(p => p.id === subscription.planId) : undefined;
              const payment = findListingPayment(paymentAttempts, listing.id, subscription);
              const invoice = findListingInvoice(billingInvoices, listing.id, subscription, payment);
              const paymentLines = payment ? paymentBreakdown(payment) : [];
              const canDownloadReceipt = Boolean(invoice?.status === "paid" || (payment?.stripeInvoiceId && payment.status === "succeeded"));
              const summarySpecs = compactValues([
                `${listing.attributes.carat} ct`,
                listing.attributes.color,
                listing.attributes.shape,
                listing.attributes.treatment
              ]);
              const isRejected = listing.status === "rejected" || listing.moderationStatus === "rejected";
              const hasPaidSubscriptionAccess = isSubscriptionInPaidAccess(subscription);
              const canCancelRenewal = Boolean(subscription?.autoRenew && hasPaidSubscriptionAccess && !isRejected && (subscription.source === "paid" || subscription.scheduledConversionAt));
              const canConvertTrial = Boolean(subscription?.source === "trial" && hasPaidSubscriptionAccess && !subscription.scheduledConversionAt && payment?.status !== "scheduled" && !isRejected);
              const needsPaymentRetry = isRetryableInitialPayment(payment, subscription);
              const needsPortalRecovery = Boolean(subscription?.status === "past_due" || invoice && (invoice.status === "failed" || invoice.status === "action_required" || invoice.status === "uncollectible"));
              const canStartPayment = Boolean(
                subscription &&
                !isRejected &&
                listing.status !== "paused" &&
                payment?.status !== "scheduled" &&
                (isAwaitingInitialPayment(subscription) || canConvertTrial || needsPaymentRetry)
              );
              const paymentActionLabel = getPaymentActionLabel(subscription, payment, canConvertTrial);
              const renewalStatus = getSubscriptionRenewalStatus(subscription);

              return (
                <article key={listing.id} className="seller-listing-card card card--surface card--compact">
                  {listing.media[0] && (
                    <img src={listing.media[0].url} alt={listing.title} className="seller-listing-image" />
                  )}
                  <div className="seller-listing-body">
                    <h3 className="seller-listing-title">{listing.title}</h3>
                    <div className="seller-listing-summary">
                      {summarySpecs.join(" · ")}
                    </div>
                    <strong className="seller-listing-price">
                      {formatLkr(listing.priceLkr)}
                    </strong>
                    <dl className="seller-listing-attributes">
                      {attributes.map((attribute) => (
                        <div key={attribute.label}>
                          <dt>{attribute.label}</dt>
                          <dd>{attribute.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="seller-listing-meta-panel">
                      <div className="seller-listing-finance-grid">
                        {subscription && plan && (
                          <div className={`seller-listing-finance-card ${canCancelRenewal ? "is-renewing" : "is-muted"}`}>
                            <div className="seller-listing-finance-title">
                              <ShieldCheck size={16} />
                              {subscription.source === "trial" ? `${plan.name} Trial Access` : `${plan.name} Subscription`}
                            </div>
                            <div className="seller-listing-finance-line">
                              Status: <span className="seller-listing-finance-value">{subscription.status.replace("_", " ")}</span>
                            </div>
                            {subscription.expiresAt && (
                              <div className="seller-listing-finance-line">
                                Valid until {formatDate(subscription.expiresAt)}
                              </div>
                            )}
                            {renewalStatus && (
                              <div className="seller-listing-finance-note is-status" style={{ "--status-foreground": renewalStatus.color } as CSSProperties}>
                                {renewalStatus.label}
                              </div>
                            )}
                          </div>
                        )}
                        {payment && (
                          <div className={`seller-listing-finance-card ${payment.status === "succeeded" ? "is-paid" : "is-pending"}`}>
                            <div className="seller-listing-finance-title">
                              <Receipt size={16} />
                              Latest payment attempt
                            </div>
                            <div className="seller-listing-finance-line">
                              Amount: <strong className="seller-listing-finance-value">{formatLkr(payment.amountLkr)}</strong> ({formatBillingStatus(payment.status)})
                            </div>
                            {payment.stripeInvoiceId && (
                              <div className="seller-listing-finance-line is-small">
                                Invoice: <code>{shortRef(payment.stripeInvoiceId)}</code>
                              </div>
                            )}
                            {paymentLines.length > 0 && (
                              <div className="seller-listing-finance-note">
                                {paymentLines.join(" · ")}
                              </div>
                            )}
                          </div>
                        )}
                        {invoice && (
                          <div className={`seller-listing-finance-card ${invoice.status === "paid" ? "is-paid" : "is-pending"}`}>
                            <div className="seller-listing-finance-title">
                              <FileText size={16} />
                              Latest invoice
                            </div>
                            <div className="seller-listing-finance-line">
                              Amount: <strong className="seller-listing-finance-value">{formatInvoiceAmount(invoice)}</strong> ({formatBillingStatus(invoice.status)})
                            </div>
                            <div className="seller-listing-finance-line is-small">
                              Invoice: <code>{shortRef(invoice.stripeInvoiceId)}</code>
                            </div>
                            {(invoice.servicePeriodStart || invoice.servicePeriodEnd) && (
                              <div className="seller-listing-finance-note">
                                {formatServicePeriod(invoice.servicePeriodStart, invoice.servicePeriodEnd)}
                              </div>
                            )}
                            {invoice.failureMessage && invoice.status !== "paid" && (
                              <div className="seller-listing-finance-note">
                                {publicErrorMessage(new Error(invoice.failureMessage), "Payment needs attention. Please retry or manage billing.")}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="seller-listing-status-row">
                        <span className="seller-listing-status" style={{ "--status-background": statusInfo.bg, "--status-foreground": statusInfo.color } as CSSProperties}>
                          {statusInfo.label}
                        </span>
                      </div>
                      {isRejected && listing.rejectionReason && (
                        <div className="seller-listing-rejection">
                          <strong>Reason:</strong> {listing.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="seller-listing-actions">
                    {subscription && canStartPayment && (
                      <button
                        onClick={() => void handlePayNow(subscription.id)}
                        disabled={payAction.busy || payingSubscriptionId === subscription.id}
                        className="seller-listing-action-button seller-listing-pay-button"
                      >
                        <CreditCard size={16} strokeWidth={2.5} />
                        {payingSubscriptionId === subscription.id ? "Opening..." : paymentActionLabel}
                      </button>
                    )}
                    {needsPortalRecovery && (
                      <button
                        type="button"
                        onClick={() => void handleManageBilling()}
                        disabled={portalAction.busy}
                        className="seller-listing-action-button seller-listing-secondary-button"
                      >
                        <ExternalLink size={16} strokeWidth={2.5} />
                        {portalAction.busy ? "Opening..." : "Fix Payment Method"}
                      </button>
                    )}
                    {invoice?.status === "paid" && (
                      <button
                        onClick={() => onNavigateToReceipt(invoice.id)}
                        className="seller-listing-action-button seller-listing-secondary-button"
                      >
                        <Receipt size={16} strokeWidth={2.5} />
                        View Receipt
                      </button>
                    )}
                    {canDownloadReceipt && (
                      <button
                        onClick={() => void handleDownloadReceipt(payment, invoice)}
                        disabled={downloadingReceiptId === (invoice?.id ?? payment?.id)}
                        className="seller-listing-action-button seller-listing-secondary-button"
                      >
                        <Download size={16} strokeWidth={2.5} />
                        {downloadingReceiptId === (invoice?.id ?? payment?.id) ? "Preparing..." : "Download Receipt"}
                      </button>
                    )}
                    {canCancelRenewal && subscription && (
                      <button
                        onClick={() => setConfirmCancelSubscriptionId(subscription.id)}
                        disabled={cancelAction.busy || cancellingSubscriptionId === subscription.id}
                        className="seller-listing-action-button seller-listing-secondary-button"
                      >
                        <RefreshCcw size={16} strokeWidth={2.5} />
                        {cancellingSubscriptionId === subscription.id ? "Cancelling..." : "Cancel Renewal"}
                      </button>
                    )}
                    <button 
                      onClick={() => setConfirmDeleteId(listing.id)}
                      disabled={deleteAction.busy || deletingId === listing.id}
                      className="seller-listing-action-button seller-listing-danger-button"
                    >
                      <Trash2 size={16} strokeWidth={2.5} />
                      {deletingId === listing.id ? "Archiving..." : "Archive"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          
          {listings.length > 0 && totalListings > 10 && (
            <div className="seller-listings-pagination">
              <span>
                Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, totalListings)} of {totalListings} listings
              </span>
              <div className="seller-listings-pagination-actions">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="seller-listing-secondary-button seller-listings-page-button"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 10 >= totalListings}
                  className="seller-listing-secondary-button seller-listings-page-button"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </section>

      <section className="data-panel seller-listings-panel card card--surface" aria-labelledby="billing-history-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Stripe billing</span>
            <h2 id="billing-history-title">Billing history</h2>
            <p>Immutable invoices and checkout attempts load independently from the listing dashboard.</p>
          </div>
        </div>
        {!billingHistory ? (
          <p className="seller-listings-state">Loading billing history...</p>
        ) : billingInvoices.length === 0 && paymentAttempts.length === 0 ? (
          <p className="seller-listings-state">No billing activity yet.</p>
        ) : (
          <div className="seller-listings-stack">
            {billingInvoices.map((invoice) => {
              const linkedAttempt = paymentAttempts.find((attempt) => attempt.id === invoice.paymentAttemptId || attempt.subscriptionId === invoice.subscriptionId);
              return (
                <article key={invoice.id} className="seller-listing-finance-card card card--inset card--compact">
                  <div className="seller-listing-finance-title">
                    <FileText size={16} /> Invoice {shortRef(invoice.stripeInvoiceId)}
                  </div>
                  <div className="seller-listing-finance-line">
                    <strong>{formatInvoiceAmount(invoice)}</strong> · {formatBillingStatus(invoice.status)} · {formatDate(invoice.createdAt)}
                  </div>
                  {(invoice.servicePeriodStart || invoice.servicePeriodEnd) && (
                    <div className="seller-listing-finance-note">{formatServicePeriod(invoice.servicePeriodStart, invoice.servicePeriodEnd)}</div>
                  )}
                  {invoice.failureMessage && invoice.status !== "paid" && (
                    <div className="seller-listing-finance-note" role="status">{publicErrorMessage(new Error(invoice.failureMessage), "Payment needs attention.")}</div>
                  )}
                  <div className="seller-listing-actions">
                    {invoice.status === "paid" && (
                      <>
                        <button type="button" className="seller-listing-action-button seller-listing-secondary-button" onClick={() => onNavigateToReceipt(invoice.id)}>
                          <Receipt size={16} /> View Receipt
                        </button>
                        <button type="button" className="seller-listing-action-button seller-listing-secondary-button" disabled={downloadingReceiptId === invoice.id} onClick={() => void handleDownloadReceipt(linkedAttempt, invoice)}>
                          <Download size={16} /> {downloadingReceiptId === invoice.id ? "Preparing..." : "Download PDF"}
                        </button>
                      </>
                    )}
                    {invoice.hostedInvoiceUrl && (
                      <a className="seller-listing-action-button seller-listing-secondary-button" href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={16} /> Open in Stripe
                      </a>
                    )}
                    {(invoice.status === "failed" || invoice.status === "action_required" || invoice.status === "uncollectible") && (
                      <button type="button" className="seller-listing-action-button seller-listing-secondary-button" disabled={portalAction.busy} onClick={() => void handleManageBilling()}>
                        <ExternalLink size={16} /> {portalAction.busy ? "Opening..." : "Manage Billing"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {paymentAttempts.map((attempt) => (
              <article key={attempt.id} className="seller-listing-finance-card card card--inset card--compact">
                <div className="seller-listing-finance-title">
                  <CreditCard size={16} /> Attempt {shortRef(attempt.id)}
                </div>
                <div className="seller-listing-finance-line">
                  <strong>{formatLkr(attempt.amountLkr)}</strong> · {formatBillingStatus(attempt.status)} · {formatDate(attempt.createdAt)}
                </div>
              </article>
            ))}
            {billingHistory.nextCursor && (
              <div className="seller-listings-pagination-actions">
                <button type="button" className="seller-listing-secondary-button seller-listings-page-button" disabled={loadingMoreBilling} onClick={() => void handleLoadMoreBilling()}>
                  {loadingMoreBilling ? "Loading..." : "Load more billing history"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {confirmDeleteId && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="delete-listing-title">
            <h3 id="delete-listing-title" className="confirmation-dialog-title tone-danger">
              <Trash2 size={20} /> Archive Listing
            </h3>
            <p className="confirmation-dialog-copy">
              {confirmDeleteRemovesAtExpiry && confirmDeleteSubscription?.expiresAt ? (
                <>
                  This immediately unpublishes the listing and cancels renewal at the end of the current access period on <strong>{formatDate(confirmDeleteSubscription.expiresAt)}</strong>. Billing history is retained.
                </>
              ) : (
                <>
                  This unpublishes and archives the listing. Existing billing history is retained for reconciliation and receipts.
                </>
              )}
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                disabled={deleteAction.busy || deletingId !== null}
                className="confirmation-dialog-button tone-danger"
              >
                {deletingId === confirmDeleteId ? "Processing..." : "Archive Listing"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmCancelSubscriptionId && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="cancel-renewal-title">
            <h3 id="cancel-renewal-title" className="confirmation-dialog-title tone-warning">
              <RefreshCcw size={20} /> Cancel Renewal
            </h3>
            <p className="confirmation-dialog-copy">
              Cancelling turns off future automatic charges. The listing keeps its current paid access
              {confirmCancelSubscription?.expiresAt ? <> through <strong>{formatDate(confirmCancelSubscription.expiresAt)}</strong></> : null},
              but it will not renew automatically after that date.
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setConfirmCancelSubscriptionId(null)}
                className="confirmation-dialog-button"
              >
                Keep Renewal
              </button>
              <button
                onClick={() => void handleCancelRenewal(confirmCancelSubscriptionId)}
                disabled={cancelAction.busy || cancellingSubscriptionId !== null}
                className="confirmation-dialog-button tone-danger"
              >
                {cancellingSubscriptionId === confirmCancelSubscriptionId ? "Cancelling..." : "Cancel Renewal"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

function getListingAttributes(listing: Listing, gemTypeName?: string) {
  const attributes: Array<[string, string | undefined]> = [
    ["Gem type", gemTypeName ?? listing.gemTypeId],
    ["Location", listing.location],
    ["Carat", `${listing.attributes.carat} ct`],
    ["Dimensions", listing.attributes.dimensions],
    ["Shape", listing.attributes.shape],
    ["Cut", listing.attributes.cut],
    ["Color", listing.attributes.color],
    ["Clarity", listing.attributes.clarity],
    ["Origin", listing.attributes.origin],
    ["Treatment", formatTreatment(listing.attributes.treatment)]
  ];

  return attributes.filter(isDisplayAttribute).map(([label, value]) => ({
    label,
    value
  }));
}

function isDisplayAttribute(attribute: [string, string | undefined]): attribute is [string, string] {
  return hasDisplayValue(attribute[1]);
}

function compactValues(values: Array<string | undefined>) {
  return values.filter(hasDisplayValue);
}

function hasDisplayValue(value: string | undefined): value is string {
  return Boolean(value?.replace(/[\s\u200B-\u200D\uFEFF]/g, ""));
}

function formatTreatment(treatment: Treatment) {
  return treatment.charAt(0).toUpperCase() + treatment.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function findListingPayment(payments: PaymentAttempt[], listingId: string, subscription: ListingSubscription | undefined) {
  const candidates = payments.filter((payment) => payment.listingId === listingId);
  return candidates.find((payment) => payment.id === subscription?.paymentIntentId) ?? newestByUpdatedAt(candidates)[0];
}

function findListingInvoice(
  invoices: BillingInvoice[],
  listingId: string,
  subscription: ListingSubscription | undefined,
  payment: PaymentAttempt | undefined
) {
  const candidates = invoices.filter((invoice) =>
    invoice.listingId === listingId ||
    (subscription && invoice.subscriptionId === subscription.id) ||
    (payment && invoice.paymentAttemptId === payment.id)
  );
  return newestByUpdatedAt(candidates)[0];
}

function mergePaymentAttempts(historyAttempts: PaymentAttempt[], dashboardPayments: PaymentIntent[]) {
  const attemptsById = new Map<string, PaymentAttempt>();
  for (const attempt of [...historyAttempts, ...dashboardPayments]) {
    const existing = attemptsById.get(attempt.id);
    if (!existing || new Date(attempt.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) attemptsById.set(attempt.id, attempt);
  }
  return newestByUpdatedAt([...attemptsById.values()]);
}

function mergeBillingHistoryPages(current: BillingHistoryPage | null, next: BillingHistoryPage): BillingHistoryPage {
  if (!current) return next;
  const attempts = new Map(current.attempts.map((attempt) => [attempt.id, attempt]));
  for (const attempt of next.attempts) attempts.set(attempt.id, attempt);
  const invoices = new Map(current.invoices.map((invoice) => [invoice.id, invoice]));
  for (const invoice of next.invoices) invoices.set(invoice.id, invoice);
  return {
    attempts: newestByUpdatedAt([...attempts.values()]),
    invoices: newestByUpdatedAt([...invoices.values()]),
    nextCursor: next.nextCursor
  };
}

function newestByUpdatedAt<T extends { updatedAt: string; createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt).getTime();
    return rightTime - leftTime;
  });
}

async function createPaymentAttemptWithFallback(api: GemsApiClient, subscriptionId: string) {
  try {
    return await api.createListingSubscriptionPaymentAttempt(subscriptionId, {
      idempotencyKey: createIdempotencyKey("subscription-payment")
    });
  } catch (createError) {
    try {
      return await api.getListingSubscriptionPaymentIntent(subscriptionId);
    } catch {
      throw createError;
    }
  }
}

function paymentBreakdown(payment: PaymentIntent) {
  const lines = [`Base ${formatLkr(payment.quote.basePriceLkr)}`];
  if (payment.quote.extraPhotoCount > 0) {
    lines.push(`${payment.quote.extraPhotoCount} extra photo${payment.quote.extraPhotoCount === 1 ? "" : "s"} ${formatLkr(payment.quote.extraPhotoTotalLkr)}`);
  }
  return lines;
}

function shortRef(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function formatBillingStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatServicePeriod(startsAt?: string, endsAt?: string) {
  if (startsAt && endsAt) return `Service period ${formatDate(startsAt)} to ${formatDate(endsAt)}`;
  if (endsAt) return `Service period ends ${formatDate(endsAt)}`;
  if (startsAt) return `Service period starts ${formatDate(startsAt)}`;
  return "";
}

function formatInvoiceAmount(invoice: BillingInvoice) {
  const currency = invoice.chargedCurrency?.toUpperCase();
  if (!currency || !Number.isFinite(invoice.chargedAmountMinor)) return formatLkr(invoice.amountLkr);
  const zeroDecimalCurrencies = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const amount = invoice.chargedAmountMinor / (zeroDecimalCurrencies.has(currency) ? 1 : 100);
  return new Intl.NumberFormat("en-LK", { style: "currency", currency }).format(amount);
}

function isRetryableInitialPayment(payment: PaymentAttempt | undefined, subscription: ListingSubscriptionSummary | undefined) {
  return Boolean(
    payment
    && (payment.status === "failed" || payment.status === "cancelled" || payment.status === "expired")
    && isAwaitingInitialPayment(subscription)
  );
}

function getPaymentActionLabel(
  subscription: ListingSubscriptionSummary | undefined,
  payment: PaymentAttempt | undefined,
  canConvertTrial: boolean
) {
  if (canConvertTrial || subscription?.source === "trial") return "Continue with Paid Plan";
  if (isRetryableInitialPayment(payment, subscription)) return "Retry Payment";
  if (payment?.status === "pending") return "Resume Payment";
  return "Pay Now";
}

function isSubscriptionInPaidAccess(subscription: ListingSubscriptionSummary | undefined) {
  const accessEndsAt = subscription?.graceEndsAt && new Date(subscription.graceEndsAt) > new Date()
    ? subscription.graceEndsAt
    : subscription?.expiresAt;
  return Boolean(
    subscription &&
    (subscription.status === "active" || subscription.status === "past_due") &&
    accessEndsAt &&
    new Date(accessEndsAt) > new Date()
  );
}

function isAwaitingInitialPayment(subscription: ListingSubscriptionSummary | undefined) {
  return Boolean(
    subscription &&
    (subscription.status === "pending_payment" || (subscription.status === "cancelled" && !subscription.startsAt && !subscription.expiresAt))
  );
}

function getSubscriptionRenewalStatus(subscription: ListingSubscriptionSummary | undefined) {
  if (!subscription) return undefined;

  if (subscription.source === "trial") {
    const activeAccess = Boolean(subscription.expiresAt && new Date(subscription.expiresAt) > new Date() && (subscription.status === "active" || subscription.status === "past_due"));
    if (activeAccess) {
      if (subscription.scheduledConversionAt) {
        return { label: `First charge scheduled ${formatDate(subscription.scheduledConversionAt)}`, color: "var(--gold)" };
      }
      return { label: "Free trial access", color: "var(--emerald)" };
    }
    if (subscription.status === "expired") {
      return { label: "Trial expired", color: "var(--muted)" };
    }
    return { label: "Trial ended", color: "var(--danger)" };
  }

  if (subscription.status === "pending_payment") {
    return { label: "Payment required", color: "var(--gold)" };
  }

  if (subscription.status === "active" || subscription.status === "past_due") {
    if (subscription.status === "past_due" && subscription.graceEndsAt) {
      return { label: `Payment recovery grace until ${formatDate(subscription.graceEndsAt)}`, color: "var(--danger)" };
    }
    return subscription.autoRenew
      ? { label: "Auto-renew active", color: "var(--emerald)" }
      : { label: "Auto-renew off", color: "var(--muted)" };
  }

  if (subscription.status === "expired") {
    return { label: "Subscription expired", color: "var(--muted)" };
  }

  return { label: "Subscription cancelled", color: "var(--danger)" };
}
