import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Clock3,
  CreditCard,
  Download,
  FilePenLine,
  Gem,
  MoreHorizontal,
  PauseCircle,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import type { GemsApiClient } from "@gems/api-client";
import {
  formatLkr,
  type GemType,
  type Listing,
  type ListingStatus,
  type ListingSubscription,
  type ListingSubscriptionPlan,
  type ListingSubscriptionSummary,
  type PaymentIntent,
  type Treatment,
  type UserDashboard
} from "@gems/schemas";
import { ClassicLoader } from "../../shared/ClassicLoader";
import { publicErrorMessage } from "../../shared/helpers";
import { createIdempotencyKey, useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { TrialStatusPanel } from "./TrialStatusPanel";

type StatusTone = "success" | "warning" | "danger" | "info" | "muted" | "ruby";

export type StatusPresentation = {
  label: string;
  tone: StatusTone;
  icon: typeof CheckCircle2;
};

type ListingFilter = "" | ListingStatus;

const STATUS_FILTERS: ReadonlyArray<{ label: string; value: ListingFilter }> = [
  { label: "All", value: "" },
  { label: "Live", value: "live" },
  { label: "In review", value: "pending_review" },
  { label: "Promoted", value: "promoted" },
  { label: "Paused", value: "paused" },
  { label: "Draft", value: "draft" },
  { label: "Rejected", value: "rejected" },
  { label: "Closed", value: "expired" }
];

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function deriveListingStatus(
  listing: Listing,
  subscription?: ListingSubscriptionSummary
): StatusPresentation {
  if (listing.status === "rejected" || listing.moderationStatus === "rejected") {
    return { label: "Rejected", tone: "danger", icon: Ban };
  }
  if (listing.moderationStatus === "needs_changes") {
    return { label: "Changes requested", tone: "warning", icon: AlertTriangle };
  }
  if (listing.status === "promoted") {
    return { label: "Promoted", tone: "ruby", icon: Sparkles };
  }
  if (listing.status === "expired") {
    return { label: "Closed", tone: "muted", icon: CircleDashed };
  }
  if (listing.status === "paused") {
    return { label: "Paused", tone: "muted", icon: PauseCircle };
  }
  if (listing.status === "draft") {
    return { label: "Draft", tone: "info", icon: FilePenLine };
  }
  if (listing.status === "pending_review" || listing.moderationStatus === "queued") {
    return { label: "In review", tone: "warning", icon: Clock3 };
  }

  if (subscription) {
    const now = new Date();
    const hasPaidAccess = Boolean(
      (subscription.status === "active" || subscription.status === "past_due")
      && subscription.expiresAt
      && new Date(subscription.expiresAt) > now
    );
    const isTrialActive = Boolean(
      subscription.source === "trial"
      && subscription.status !== "expired"
      && subscription.expiresAt
      && new Date(subscription.expiresAt) > now
    );

    if (subscription.paymentStatus === "required" || subscription.paymentStatus === "failed") {
      if (!hasPaidAccess && !isTrialActive) {
        return { label: "Suspended", tone: "danger", icon: Ban };
      }
    }
    if (subscription.status === "pending_payment" || subscription.paymentStatus === "pending") {
      if (!hasPaidAccess && !isTrialActive) {
        return { label: "Payment pending", tone: "warning", icon: Clock3 };
      }
    }
  }

  return { label: "Live", tone: "success", icon: BadgeCheck };
}

export function deriveAccessStatus(
  subscription: ListingSubscriptionSummary | undefined,
  plan: ListingSubscriptionPlan | undefined,
  now = new Date()
): { status: StatusPresentation; planLabel: string; detail?: string } {
  if (!subscription) {
    return {
      status: { label: "No access plan", tone: "muted", icon: ShieldCheck },
      planLabel: "No plan"
    };
  }

  const planLabel = subscription.source === "trial"
    ? `${plan?.name ?? "Listing"} trial`
    : plan?.name ?? "Listing plan";
  const hasFutureAccess = Boolean(subscription.expiresAt && new Date(subscription.expiresAt) > now);

  if (subscription.paymentStatus === "failed" || subscription.paymentStatus === "required") {
    return {
      status: { label: "Pending Payment", tone: "danger", icon: CreditCard },
      planLabel,
      detail: hasFutureAccess && subscription.expiresAt
        ? `Access ends ${formatDate(subscription.expiresAt)}`
        : "Access is unavailable"
    };
  }
  if (subscription.paymentStatus === "pending" || subscription.status === "pending_payment") {
    return {
      status: { label: "Payment pending", tone: "warning", icon: Clock3 },
      planLabel,
      detail: "Waiting for payment confirmation"
    };
  }
  if (subscription.source === "trial") {
    return {
      status: {
        label: hasFutureAccess && subscription.status !== "expired" ? "Trial active" : "Trial ended",
        tone: hasFutureAccess && subscription.status !== "expired" ? "info" : "muted",
        icon: Clock3
      },
      planLabel,
      detail: subscription.expiresAt
        ? `${hasFutureAccess ? "Ends" : "Ended"} ${formatDate(subscription.expiresAt)}`
        : undefined
    };
  }
  if (subscription.status === "active" || subscription.status === "past_due") {
    return {
      status: {
        label: subscription.autoRenew ? "Renews automatically" : "Renewal cancelled",
        tone: subscription.autoRenew ? "success" : "muted",
        icon: subscription.autoRenew ? RefreshCcw : Ban
      },
      planLabel,
      detail: subscription.expiresAt
        ? `${subscription.autoRenew ? "Renews" : "Access ends"} ${formatDate(subscription.expiresAt)}`
        : undefined
    };
  }
  return {
    status: { label: subscription.status === "expired" ? "Access ended" : "Renewal cancelled", tone: "muted", icon: Ban },
    planLabel,
    detail: subscription.expiresAt ? `Ended ${formatDate(subscription.expiresAt)}` : undefined
  };
}

export function MyListingsView({
  dashboard,
  gemTypes,
  subscriptionPlans,
  api,
  onDashboardChange
}: {
  dashboard: UserDashboard | null;
  gemTypes: GemType[];
  subscriptionPlans: ListingSubscriptionPlan[];
  api: GemsApiClient;
  onDashboardChange: (dashboard: UserDashboard) => void;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [totalListings, setTotalListings] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<ListingFilter>("");
  const [filterGemType, setFilterGemType] = useState("");
  const [isLoadingListings, setIsLoadingListings] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [feedback, setFeedback] = useState("Loading your listings.");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingSubscriptionId, setCancellingSubscriptionId] = useState<string | null>(null);
  const [payingSubscriptionId, setPayingSubscriptionId] = useState<string | null>(null);
  const [downloadingPaymentId, setDownloadingPaymentId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCancelSubscriptionId, setConfirmCancelSubscriptionId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const cancelAction = useSingleFlightAction();
  const payAction = useSingleFlightAction();
  const deleteAction = useSingleFlightAction();

  const gemTypeNameById = useMemo(() => new Map(gemTypes.map((gemType) => [gemType.id, gemType.name])), [gemTypes]);
  const planById = useMemo(() => new Map(subscriptionPlans.map((plan) => [plan.id, plan])), [subscriptionPlans]);
  const subscriptionByListingId = useMemo(
    () => new Map((dashboard?.listingSubscriptions ?? []).map((subscription) => [subscription.listingId, subscription])),
    [dashboard?.listingSubscriptions]
  );
  const hasFilters = Boolean(searchQuery || filterStatus || filterGemType);
  const totalPages = Math.max(1, Math.ceil(totalListings / limit));
  const rangeStart = totalListings === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, totalListings);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const fetchListings = async () => {
      setIsLoadingListings(true);
      setLoadError("");
      try {
        const response = await api.getMyListings(page, limit, debouncedSearchQuery, filterStatus || undefined, filterGemType || undefined);
        if (!active) return;
        if (response.items.length === 0 && page > 1) {
          setPage((currentPage) => Math.max(1, currentPage - 1));
          return;
        }
        setListings(response.items);
        setTotalListings(response.total);
        setFeedback(`${response.total} ${response.total === 1 ? "listing" : "listings"} found.`);
      } catch (error) {
        if (!active) return;
        const message = publicErrorMessage(error, "Please try again.");
        setLoadError(message);
        setFeedback(`Listings could not be loaded. ${message}`);
      } finally {
        if (active) setIsLoadingListings(false);
      }
    };
    void fetchListings();
    return () => { active = false; };
  }, [api, page, limit, debouncedSearchQuery, filterStatus, filterGemType, dashboard, retryKey]);

  const resetFilters = () => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setFilterStatus("");
    setFilterGemType("");
    setPage(1);
    setFeedback("Filters reset. Loading all listings.");
  };

  const handleCancelRenewal = async (subscriptionId: string) => {
    await cancelAction.run(async () => {
      try {
        setCancellingSubscriptionId(subscriptionId);
        await api.cancelListingSubscription(subscriptionId);
        onDashboardChange(await api.dashboard());
        setFeedback("Automatic renewal cancelled. Current paid access remains available until its end date.");
      } catch (error) {
        setFeedback(`Renewal could not be cancelled. ${publicErrorMessage(error, "Please try again.")}`);
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
        setFeedback("Opening secure payment checkout.");
        const recovery = await api.startListingSubscriptionPayment(subscriptionId, {
          idempotencyKey: createIdempotencyKey("listing-payment")
        });
        window.location.href = recovery.checkoutUrl;
      } catch (error) {
        const message = publicErrorMessage(error, "Unable to open secure checkout. Please try again.");
        setPayError(message);
        setFeedback(`Checkout could not be opened. ${message}`);
        setPayingSubscriptionId(null);
        payAction.release();
      }
    }, { keepLocked: true });
  };

  const handleDownloadReceipt = async (payment: PaymentIntent) => {
    try {
      setDownloadingPaymentId(payment.id);
      setFeedback("Preparing receipt download.");
      const receiptFile = await api.downloadPaymentReceipt(payment.id);
      const url = URL.createObjectURL(receiptFile.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = receiptFile.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback("Receipt downloaded.");
    } catch (error) {
      const message = publicErrorMessage(error, "Receipt could not be downloaded. Please try again.");
      setReceiptError(message);
      setFeedback(`Receipt could not be downloaded. ${message}`);
    } finally {
      setDownloadingPaymentId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAction.run(async () => {
      try {
        setDeletingId(id);
        await api.removeMyListing(id);
        onDashboardChange(await api.dashboard());
        setFeedback("Listing deletion request completed.");
      } catch (error) {
        setFeedback(`Listing could not be deleted. ${publicErrorMessage(error, "Please try again.")}`);
      } finally {
        setDeletingId(null);
        setConfirmDeleteId(null);
      }
    });
  };

  const confirmDeleteListing = confirmDeleteId ? listings.find((listing) => listing.id === confirmDeleteId) : undefined;
  const confirmDeleteSubscription = confirmDeleteListing
    ? dashboard?.listingSubscriptions.find((item) => item.listingId === confirmDeleteListing.id)
    : undefined;
  const confirmDeleteRemovesAtExpiry = isSubscriptionInPaidAccess(confirmDeleteSubscription);

  return (
    <section className="dashboard seller-listings-page" aria-labelledby="my-listings-title">
      <FeedbackRegion message={feedback} />
      <header className="seller-listings-page-header">
        <div>
          <h1 id="my-listings-title">My Listings</h1>
          <p className="seller-listings-description">
            Manage the gems you have posted.
          </p>
        </div>
      </header>

      <TrialStatusPanel trial={dashboard?.user.trial} variant="compact" />

      <div className="seller-listings-filters" aria-label="Listing filters">
        <div className="seller-listings-status-tabs" role="group" aria-label="Filter by listing status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              className={filterStatus === filter.value ? "is-active" : ""}
              aria-pressed={filterStatus === filter.value}
              onClick={() => {
                setFilterStatus(filter.value);
                setPage(1);
                setFeedback(`Filtering by ${filter.label.toLowerCase()} listings.`);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="seller-listings-filter-controls">
          <label className="seller-listings-search">
            <span className="sr-only">Search your listings</span>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by title"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery ? (
              <button type="button" className="seller-listings-search-clear" onClick={() => setSearchQuery("")} aria-label="Clear listing search">
                <X size={17} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <label className="seller-listing-select-label">
            <span>Gem type</span>
            <select
              value={filterGemType}
              onChange={(event) => { setFilterGemType(event.target.value); setPage(1); }}
              className={filterGemType ? "is-active" : ""}
            >
              <option value="">All gem types</option>
              {gemTypes.map((gemType) => <option key={gemType.id} value={gemType.id}>{gemType.name}</option>)}
            </select>
          </label>
          <button type="button" className="seller-listings-reset" onClick={resetFilters} disabled={!hasFilters}>
            <RotateCcw size={17} aria-hidden="true" /> Reset filters
          </button>
        </div>
      </div>

      <section className={`seller-listings-surface${isLoadingListings && listings.length ? " is-refreshing" : ""}`} aria-busy={isLoadingListings}>
        {loadError ? (
          <div className="seller-listings-inline-error" role="alert">
            <CircleAlert size={20} aria-hidden="true" />
            <div><strong>We couldn’t refresh your listings.</strong><span>{loadError}</span></div>
            <button type="button" onClick={() => setRetryKey((key) => key + 1)}>Try again</button>
          </div>
        ) : null}

        {isLoadingListings && listings.length === 0 ? (
          <ListingSkeleton />
        ) : listings.length === 0 ? (
          <div className="seller-listings-empty">
            <Gem size={26} aria-hidden="true" />
            <h2>{hasFilters ? "No listings match these filters" : "No listings yet"}</h2>
            <p>{hasFilters ? "Try a different search or reset your filters." : "Your posted gems will appear here."}</p>
            {hasFilters ? <button type="button" onClick={resetFilters}>Reset filters</button> : null}
          </div>
        ) : (
          <div className="seller-listings-grid">
            {listings.map((listing) => {
              const subscription = subscriptionByListingId.get(listing.id);
              const plan = subscription ? planById.get(subscription.planId) : undefined;
              const payment = findListingPayment(dashboard?.recentPayments ?? [], listing.id, subscription);
              return (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  gemTypeName={gemTypeNameById.get(listing.gemTypeId)}
                  subscription={subscription}
                  plan={plan}
                  payment={payment}
                  payBusy={payAction.busy}
                  payingSubscriptionId={payingSubscriptionId}
                  downloadingPaymentId={downloadingPaymentId}
                  deleteBusy={deleteAction.busy}
                  deletingId={deletingId}
                  cancellingSubscriptionId={cancellingSubscriptionId}
                  onPayNow={handlePayNow}
                  onDownloadReceipt={handleDownloadReceipt}
                  onCancelRenewal={setConfirmCancelSubscriptionId}
                  onDelete={setConfirmDeleteId}
                />
              );
            })}
          </div>
        )}

        {listings.length > 0 && totalListings > limit ? (
          <footer className="seller-listings-pagination" aria-label="Listings pagination">
            <p>Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{totalListings}</strong></p>
            <div className="seller-listings-page-controls">
              <button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1} aria-label="Previous page">
                <ChevronLeft size={18} aria-hidden="true" /> Previous
              </button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((value) => value + 1)} disabled={page >= totalPages} aria-label="Next page">
                Next <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <label className="seller-listings-page-size">
              <span>Per page</span>
              <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </footer>
        ) : null}
      </section>

      {confirmDeleteId ? (
        <ConfirmationDialog
          title="Delete listing"
          tone="danger"
          icon={<Trash2 size={20} aria-hidden="true" />}
          confirmLabel={confirmDeleteRemovesAtExpiry ? "Schedule deletion" : "Delete listing permanently"}
          busyLabel="Processing…"
          isBusy={deleteAction.busy || deletingId !== null}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => void handleDelete(confirmDeleteId)}
        >
          {confirmDeleteRemovesAtExpiry && confirmDeleteSubscription?.expiresAt ? (
            <>This listing has active access. Its renewal will be cancelled and the listing will be removed after access ends on <strong>{formatDate(confirmDeleteSubscription.expiresAt)}</strong>.</>
          ) : (
            <>Delete <strong>{confirmDeleteListing?.title ?? "this listing"}</strong>? This permanently removes its data and cannot be undone.</>
          )}
        </ConfirmationDialog>
      ) : null}

      {confirmCancelSubscriptionId ? (
        <ConfirmationDialog
          title="Cancel automatic renewal"
          tone="warning"
          icon={<RefreshCcw size={20} aria-hidden="true" />}
          confirmLabel="Cancel renewal"
          busyLabel="Cancelling…"
          isBusy={cancelAction.busy || cancellingSubscriptionId !== null}
          onCancel={() => setConfirmCancelSubscriptionId(null)}
          onConfirm={() => void handleCancelRenewal(confirmCancelSubscriptionId)}
        >
          The listing keeps its current paid access until the displayed end date, but the plan will not renew automatically.
        </ConfirmationDialog>
      ) : null}

      {payError ? (
        <ConfirmationDialog
          title="Payment Checkout Error"
          tone="danger"
          icon={<CircleAlert size={20} aria-hidden="true" />}
          confirmLabel="Close"
          busyLabel="Closing…"
          isBusy={false}
          onCancel={() => setPayError(null)}
          onConfirm={() => setPayError(null)}
        >
          {payError}
        </ConfirmationDialog>
      ) : null}

      {receiptError ? (
        <ConfirmationDialog
          title="Receipt Download Error"
          tone="danger"
          icon={<CircleAlert size={20} aria-hidden="true" />}
          confirmLabel="Close"
          busyLabel="Closing…"
          isBusy={false}
          onCancel={() => setReceiptError(null)}
          onConfirm={() => setReceiptError(null)}
        >
          {receiptError}
        </ConfirmationDialog>
      ) : null}
    </section>
  );
}

function ListingCard({
  listing,
  gemTypeName,
  subscription,
  plan,
  payment,
  payBusy,
  payingSubscriptionId,
  downloadingPaymentId,
  deleteBusy,
  deletingId,
  cancellingSubscriptionId,
  onPayNow,
  onDownloadReceipt,
  onCancelRenewal,
  onDelete
}: {
  listing: Listing;
  gemTypeName?: string;
  subscription?: ListingSubscription;
  plan?: ListingSubscriptionPlan;
  payment?: PaymentIntent;
  payBusy: boolean;
  payingSubscriptionId: string | null;
  downloadingPaymentId: string | null;
  deleteBusy: boolean;
  deletingId: string | null;
  cancellingSubscriptionId: string | null;
  onPayNow: (id: string) => Promise<void>;
  onDownloadReceipt: (payment: PaymentIntent) => Promise<void>;
  onCancelRenewal: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const listingStatus = deriveListingStatus(listing, subscription);
  const access = deriveAccessStatus(subscription, plan);
  const attributes = getListingAttributes(listing, gemTypeName);
  const canDownloadReceipt = Boolean(payment?.stripeInvoiceId && payment.status === "succeeded");
  const rejected = listingStatus.label === "Rejected";
  const hasPaidAccess = isSubscriptionInPaidAccess(subscription);
  const canCancelRenewal = Boolean(subscription?.source === "paid" && subscription.autoRenew && hasPaidAccess && !rejected);
  const canRecoverPayment = Boolean(
    subscription
    && !rejected
    && subscription.paymentStatus !== "paid"
    && ((subscription.source === "trial" && !hasPaidAccess) || ["pending_payment", "past_due", "cancelled", "expired"].includes(subscription.status))
  );
  const reason = listing.moderationStatus === "needs_changes" || rejected ? listing.rejectionReason : undefined;
  const media = listing.media[0];

  return (
    <article className={`seller-listing-card${reason ? " has-attention" : ""}`} aria-labelledby={`listing-${listing.id}-title`}>
      <div className="seller-listing-image-wrapper">
        {media ? (
          <img src={media.thumbnailUrl ?? media.url} alt={media.alt || listing.title} className="seller-listing-image" loading="lazy" decoding="async" />
        ) : (
          <span className="seller-listing-image-placeholder" aria-label="No listing image"><Gem size={24} aria-hidden="true" /></span>
        )}
      </div>

      <div className="seller-listing-content">
        <div className="seller-listing-identity">
          <h2 id={`listing-${listing.id}-title`}>{listing.title}</h2>
          <p>{[gemTypeName, listing.location, `${listing.attributes.carat} ct`].filter(Boolean).join(" · ")}</p>
        </div>

        <div className="seller-listing-commerce-info">
          <div className="seller-listing-price-block">
            <span className="seller-listing-price-label">Price:</span>
            <strong className="seller-listing-price">{formatLkr(listing.priceLkr)}</strong>
          </div>
          <div className="seller-listing-status-row">
            <span className="seller-listing-status-label">Status:</span>
            <StatusBadge presentation={listingStatus} />
          </div>
          <div className="seller-listing-plan-row">
            <span className="seller-listing-plan-label">Plan:</span>
            <strong className="seller-listing-plan-value">{access.planLabel}</strong>
          </div>
          <div className="seller-listing-renewal-row">
            <span className="seller-listing-renewal-label">Renewal:</span>
            <AccessSummary access={access} />
          </div>
        </div>

        {reason ? (
          <div className={`seller-listing-reason tone-${listingStatus.tone}`}>
            <CircleAlert size={16} aria-hidden="true" />
            <span><strong>{rejected ? "Rejection reason:" : "Changes requested:"}</strong> {reason}</span>
          </div>
        ) : null}

        {detailsOpen ? (
          <dl className="seller-listing-attributes">
            {listing.createdAt ? <div><dt>Posted</dt><dd>{formatDate(listing.createdAt)}</dd></div> : null}
            {attributes.map((attribute) => <div key={attribute.label}><dt>{attribute.label}</dt><dd>{attribute.value}</dd></div>)}
          </dl>
        ) : null}

        <div className="seller-listing-row-actions">
          <button type="button" onClick={() => setDetailsOpen(!detailsOpen)}>
             <ChevronDown size={17} aria-hidden="true" style={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} /> Details
          </button>
          <ActionMenu
            listingTitle={listing.title}
            canDownloadReceipt={canDownloadReceipt}
            canCancelRenewal={canCancelRenewal}
            receiptBusy={Boolean(payment && downloadingPaymentId === payment.id)}
            cancelBusy={Boolean(subscription && cancellingSubscriptionId === subscription.id)}
            deleteBusy={deleteBusy || deletingId === listing.id}
            closeSignal={detailsOpen}
            onOpen={() => setDetailsOpen(false)}
            onDownloadReceipt={payment ? () => void onDownloadReceipt(payment) : undefined}
            onCancelRenewal={subscription ? () => onCancelRenewal(subscription.id) : undefined}
            onDelete={() => onDelete(listing.id)}
          />
          {canRecoverPayment && subscription ? (
            <button
              type="button"
              onClick={() => void onPayNow(subscription.id)}
              disabled={payBusy || payingSubscriptionId === subscription.id}
              className="seller-listing-pay-button"
            >
              {payingSubscriptionId === subscription.id ? <ClassicLoader size={17} aria-hidden="true" /> : <CreditCard size={18} aria-hidden="true" />}
              {payingSubscriptionId === subscription.id ? "Opening…" : "Pay Now"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ presentation }: { presentation: StatusPresentation }) {
  const Icon = presentation.icon;
  return (
    <span className={`seller-status-badge tone-${presentation.tone}`}>
      <Icon size={15} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

function AccessSummary({ access }: { access: ReturnType<typeof deriveAccessStatus> }) {
  return (
    <span className="seller-listing-access-summary">
      <span className="seller-listing-access-copy">
        {getAccessSummaryText(access)}
      </span>
    </span>
  );
}

function getAccessSummaryText(access: ReturnType<typeof deriveAccessStatus>) {
  if (access.status.label === "Renews automatically" && access.detail) {
    const dateStr = access.detail.replace(/^Renews\s*/, "");
    return `Renews on ${dateStr}`;
  }
  if (access.status.label === "Renewal cancelled" && access.detail) {
    const dateStr = access.detail.replace(/^Access ends\s*/, "");
    return `Access ends on ${dateStr}`;
  }
  if (access.status.label === "Pending Payment" || access.status.label === "Payment required") {
    return "Pending Payment";
  }
  if (access.detail) {
    const dateStr = access.detail.replace(/^(Ends|Ended|Access ends|Renews)\s*/, "");
    return `Access ends on ${dateStr}`;
  }
  return access.status.label;
}

function ActionMenu({
  listingTitle,
  canDownloadReceipt,
  canCancelRenewal,
  receiptBusy,
  cancelBusy,
  deleteBusy,
  closeSignal,
  onOpen,
  onDownloadReceipt,
  onCancelRenewal,
  onDelete
}: {
  listingTitle: string;
  canDownloadReceipt: boolean;
  canCancelRenewal: boolean;
  receiptBusy: boolean;
  cancelBusy: boolean;
  deleteBusy: boolean;
  closeSignal: boolean;
  onOpen: () => void;
  onDownloadReceipt?: () => void;
  onCancelRenewal?: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"up" | "down">("down");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAnyBusy = receiptBusy || cancelBusy || deleteBusy;

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (isAnyBusy) return;
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, isAnyBusy]);

  const prevReceiptBusy = useRef(receiptBusy);
  useEffect(() => {
    if (prevReceiptBusy.current && !receiptBusy) {
      setOpen(false);
    }
    prevReceiptBusy.current = receiptBusy;
  }, [receiptBusy]);

  useEffect(() => {
    if (closeSignal) setOpen(false);
  }, [closeSignal]);

  const close = () => {
    if (isAnyBusy) return;
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const toggle = () => {
    if (isAnyBusy) return;
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const hasRoomBelow = window.innerHeight - rect.bottom >= 190;
      setPlacement(hasRoomBelow || rect.top < 190 ? "down" : "up");
    }
    onOpen();
    setOpen(true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" && !isAnyBusy) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + direction + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div className="seller-listing-more">
      <button ref={buttonRef} type="button" disabled={isAnyBusy} aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${listingTitle}`} onClick={toggle}>
        <MoreHorizontal size={20} aria-hidden="true" /> <span>More</span>
      </button>
      {open ? (
        <div ref={menuRef} className={`seller-listing-more-menu is-${placement}`} role="menu" onKeyDown={handleKeyDown}>
          {canDownloadReceipt ? (
            <button type="button" role="menuitem" disabled={isAnyBusy} onClick={() => { onDownloadReceipt?.(); }}>
              {receiptBusy ? <ClassicLoader size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
              {receiptBusy ? "Processing the receipt" : "Download receipt"}
            </button>
          ) : null}
          {canCancelRenewal ? (
            <button type="button" role="menuitem" disabled={isAnyBusy} onClick={() => { close(); onCancelRenewal?.(); }}>
              <RefreshCcw size={17} aria-hidden="true" /> Cancel renewal
            </button>
          ) : null}
          <div className="seller-listing-more-separator" role="separator" />
          <button type="button" role="menuitem" className="is-destructive" disabled={isAnyBusy} onClick={() => { close(); onDelete(); }}>
            {deleteBusy ? <ClassicLoader size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />} Delete listing
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConfirmationDialog({
  title,
  tone,
  icon,
  children,
  confirmLabel,
  busyLabel,
  isBusy,
  onCancel,
  onConfirm
}: {
  title: string;
  tone: "danger" | "warning";
  icon: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isBusyRef = useRef(isBusy);
  const onCancelRef = useRef(onCancel);
  const titleId = `seller-confirm-${tone}-title`;
  isBusyRef.current = isBusy;
  onCancelRef.current = onCancel;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, []);

  return createPortal(
    <div className="modal-overlay modal-overlay--priority" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) onCancel(); }}>
      <div ref={dialogRef} className="confirmation-dialog seller-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={`tone-${tone}`}>{icon}{title}</h2>
        <p>{children}</p>
        <div className="confirmation-dialog-actions">
          <button type="button" onClick={onCancel} disabled={isBusy}>Go back</button>
          <button type="button" className={`tone-${tone}`} onClick={onConfirm} disabled={isBusy}>
            {isBusy ? <ClassicLoader size={17} aria-hidden="true" /> : null}{isBusy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ListingSkeleton() {
  return (
    <div className="seller-listings-skeleton" role="status" aria-label="Loading listings">
      {[0, 1, 2].map((row) => (
        <div className="seller-listing-skeleton-row" key={row} aria-hidden="true">
          <span className="skeleton-image" /><span className="skeleton-copy" /><span className="skeleton-status" /><span className="skeleton-price" />
        </div>
      ))}
    </div>
  );
}

function FeedbackRegion({ message }: { message: string }) {
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>;
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
  return attributes.filter(isDisplayAttribute).map(([label, value]) => ({ label, value }));
}

function isDisplayAttribute(attribute: [string, string | undefined]): attribute is [string, string] {
  return Boolean(attribute[1]?.replace(/[\s\u200B-\u200D\uFEFF]/g, ""));
}

function formatTreatment(treatment: Treatment) {
  return treatment.charAt(0).toUpperCase() + treatment.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function findListingPayment(payments: PaymentIntent[], listingId: string, subscription: ListingSubscription | undefined) {
  const candidates = payments.filter((payment) => payment.listingId === listingId);
  return candidates.find((payment) => payment.id === subscription?.paymentIntentId) ?? candidates[0];
}

function isSubscriptionInPaidAccess(subscription: ListingSubscriptionSummary | undefined) {
  return Boolean(
    subscription
    && (subscription.status === "active" || subscription.status === "past_due")
    && subscription.expiresAt
    && new Date(subscription.expiresAt) > new Date()
  );
}
