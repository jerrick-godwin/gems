import {
  BadgeCheck,
  Ban,
  CalendarPlus,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock,
  CreditCard,
  Flag,
  Gem,
  LayoutDashboard,
  LogIn,
  PackageCheck,
  Search,
  ShieldCheck,
  UsersRound,
  WalletCards,
  LogOut
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GemsAdminApiClient, type AdminModerationSnapshot } from "@gems/api-client";
import { formatLkr, type Listing, type PaymentIntent, type Report, type User } from "@gems/schemas";
import { ThemeSwitcher, type ThemePreference } from "@gems/ui";
import { Metric } from "../../shared/Metric";
import { publicErrorMessage } from "../../shared/helpers";
import { ActiveListingRow } from "./ActiveListingRow";
import { ReportRow } from "./ReportRow";
import { ReviewRow } from "./ReviewRow";
import { setImpersonationInfo } from "./ImpersonationBanner";

type AdminView = "overview" | "moderation" | "listings" | "users" | "payments";

const ADMIN_VIEW_COPY: Record<AdminView, { title: string; description: string }> = {
  overview: { title: "Overview", description: "A quick view of marketplace activity and work that needs attention." },
  moderation: { title: "Moderation", description: "Review new listings and investigate reports from the marketplace." },
  listings: { title: "Listings", description: "Manage live, rejected, and archived gem listings." },
  users: { title: "Users & trials", description: "Find users, review trial status, and manage trial access." },
  payments: { title: "Payments", description: "Monitor subscription payments and gateway status." }
};

export function AdminConsole({
  api,
  token,
  snapshot,
  setSnapshot,
  setLoadError,
  activeView,
  setActiveView,
  handleLogout,
  theme,
  setTheme
}: {
  api: GemsAdminApiClient;
  token: string;
  snapshot: AdminModerationSnapshot;
  setSnapshot: (snapshot: AdminModerationSnapshot) => void;
  setLoadError: (error: string | null) => void;
  activeView: AdminView;
  setActiveView: (view: AdminView) => void;
  handleLogout: () => void;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}) {
  const allPending = snapshot.listings.filter((listing) => listing.moderationStatus === "queued");
  const paidPending = allPending.filter((listing) => listing.subscription?.status === "active");
  const unpaidPending = allPending.filter((listing) => listing.subscription?.status !== "active");
  const pending = paidPending; // Legacy naming for backwards compatibility
  const openReports = snapshot.reports.filter((report) => report.status !== "resolved");
  const checkedCertificates = snapshot.listings.filter((listing) => listing.attributes.certificateStatus === "admin_verified").length;
  const successfulPayments = snapshot.payments.filter((payment) => payment.status === "succeeded");
  const pendingPayments = snapshot.payments.filter((payment) => payment.status === "pending");
  const activeTrials = snapshot.users.filter((user) => user.trial?.status === "active").length;
  const expiredTrials = snapshot.users.filter((user) => user.trial?.status === "expired").length;
  const terminatedTrials = snapshot.users.filter((user) => user.trial?.status === "terminated").length;
  const [reviewSearch, setReviewSearch] = useState("");
  const [pendingPaymentSearch, setPendingPaymentSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [activeListingSearch, setActiveListingSearch] = useState("");
  const [rejectedListingSearch, setRejectedListingSearch] = useState("");
  const [archivedListingSearch, setArchivedListingSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const allListings = Array.from(new Map([...snapshot.listings, ...snapshot.liveListings].map((listing) => [listing.id, listing])).values());
  const rejectedListings = allListings.filter((listing) => listing.status === "rejected" || listing.moderationStatus === "rejected");
  const archivedListings = allListings.filter((listing) => listing.status === "expired" || listing.status === "paused");
  const filteredPending = paidPending.filter((listing) => matchesListingSearch(listing, reviewSearch, snapshot));
  const filteredUnpaidPending = unpaidPending.filter((listing) => matchesListingSearch(listing, pendingPaymentSearch, snapshot));
  const filteredReports = openReports.filter((report) => matchesReportSearch(report, reportSearch, snapshot));
  const filteredActiveListings = snapshot.liveListings.filter((listing) => matchesListingSearch(listing, activeListingSearch, snapshot));
  const filteredRejectedListings = rejectedListings.filter((listing) => matchesListingSearch(listing, rejectedListingSearch, snapshot));
  const filteredArchivedListings = archivedListings.filter((listing) => matchesListingSearch(listing, archivedListingSearch, snapshot));
  const filteredPayments = snapshot.payments.filter((payment) => matchesPaymentSearch(payment, paymentSearch, snapshot));
  const moderateListing = async (listingId: string, decision: "approve" | "reject", reason?: string) => {
    try {
      const updated = await api.moderateListing(token, listingId, decision, reason);
      setSnapshot({
        ...snapshot,
        listings: snapshot.listings.map((listing) => listing.id === updated.id ? updated : listing)
      });
      setLoadError(null);
    } catch (error) {
      setLoadError(publicErrorMessage(error, "Unable to update listing moderation"));
    }
  };

  const selectView = (view: AdminView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeListing = (id: string) => {
    setSnapshot({
      ...snapshot,
      listings: snapshot.listings.filter((listing) => listing.id !== id),
      liveListings: snapshot.liveListings.filter((listing) => listing.id !== id),
      reportedListings: snapshot.reportedListings.filter((listing) => listing.id !== id),
      reports: snapshot.reports.map((report) => report.listingId === id ? { ...report, status: "resolved", listingId: "" } : report)
    });
  };

  return (
    <section className="dashboard admin-workspace">
      <AdminNavigation
        activeView={activeView}
        onSelect={selectView}
        moderationCount={allPending.length + openReports.length}
        listingCount={allListings.length}
        userCount={snapshot.users.length}
        paymentCount={pendingPayments.length}
        handleLogout={handleLogout}
        theme={theme}
        setTheme={setTheme}
      />

      <div className="admin-workspace-content">
        <div className="section-heading admin-view-heading">
          <div>
            <span className="admin-view-eyebrow">Admin workspace</span>
            <h1>{ADMIN_VIEW_COPY[activeView].title}</h1>
            <p>{ADMIN_VIEW_COPY[activeView].description}</p>
          </div>
        </div>

        {activeView === "overview" && (
          <AdminOverview
            pendingReviews={allPending.length}
            openReports={openReports.length}
            checkedCertificates={checkedCertificates}
            paidSubscriptions={successfulPayments.length}
            activeTrials={activeTrials}
            liveListings={snapshot.liveListings.length}
            totalUsers={snapshot.users.length}
            pendingPayments={pendingPayments.length}
            onNavigate={selectView}
          />
        )}

        {activeView === "moderation" && (
          <div className="admin-console-stack">
            <div className="metric-grid admin-view-metrics">
              <Metric icon={ClipboardCheck} label="Queued listings" value={String(paidPending.length)} accent="var(--gold)" />
              <Metric icon={CreditCard} label="Pending payment" value={String(unpaidPending.length)} accent="var(--muted)" />
              <Metric icon={Flag} label="Open reports" value={String(openReports.length)} accent="var(--danger)" />
              <Metric icon={BadgeCheck} label="Checked certs" value={String(checkedCertificates)} accent="var(--emerald)" />
            </div>
            <AdminSection
              title="Review Queue"
              totalCount={paidPending.length}
              visibleCount={filteredPending.length}
              searchValue={reviewSearch}
              onSearchChange={setReviewSearch}
              searchPlaceholder="Search queued listings"
              emptyMessage="No listings pending review."
              noMatchesMessage="No queued listings match your search."
            >
              {filteredPending.map((listing) => <ReviewRow api={api} token={token} listing={listing} snapshot={snapshot} onModerate={moderateListing} key={listing.id} />)}
            </AdminSection>
            <AdminSection
              title="Pending Payment"
              totalCount={unpaidPending.length}
              visibleCount={filteredUnpaidPending.length}
              searchValue={pendingPaymentSearch}
              onSearchChange={setPendingPaymentSearch}
              searchPlaceholder="Search unpaid listings"
              emptyMessage="No listings pending payment."
              noMatchesMessage="No unpaid listings match your search."
            >
              {filteredUnpaidPending.map((listing) => <ReviewRow api={api} token={token} listing={listing} snapshot={snapshot} onModerate={moderateListing} key={listing.id} />)}
            </AdminSection>
            <AdminSection
              title="Reports"
              totalCount={openReports.length}
              visibleCount={filteredReports.length}
              searchValue={reportSearch}
              onSearchChange={setReportSearch}
              searchPlaceholder="Search reports"
              emptyMessage="No open reports."
              noMatchesMessage="No reports match your search."
            >
              {filteredReports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  snapshot={snapshot}
                  api={api}
                  token={token}
                  onRemoveListing={removeListing}
                  onResolveReport={(reportId) => {
                    setSnapshot({
                      ...snapshot,
                      reports: snapshot.reports.map((item) => item.id === reportId ? { ...item, status: "resolved" } : item)
                    });
                  }}
                  setLoadError={setLoadError}
                />
              ))}
            </AdminSection>
          </div>
        )}

        {activeView === "listings" && (
          <div className="admin-console-stack">
            <div className="metric-grid admin-view-metrics">
              <Metric icon={Gem} label="Live listings" value={String(snapshot.liveListings.length)} accent="var(--emerald)" />
              <Metric icon={CircleAlert} label="Rejected" value={String(rejectedListings.length)} accent="var(--danger)" />
              <Metric icon={Clock} label="Archived" value={String(archivedListings.length)} accent="var(--muted)" />
            </div>
            <AdminSection
              title="Active listings"
              totalCount={snapshot.liveListings.length}
              visibleCount={filteredActiveListings.length}
              searchValue={activeListingSearch}
              onSearchChange={setActiveListingSearch}
              searchPlaceholder="Search active listings"
              emptyMessage="No live listings."
              noMatchesMessage="No active listings match your search."
            >
              {filteredActiveListings.map((listing) => (
                <ActiveListingRow
                  listing={listing}
                  key={listing.id}
                  api={api}
                  token={token}
                  payments={snapshot.payments}
                  sellers={snapshot.sellers}
                  users={snapshot.users}
                  onUpdate={(updated) => {
                    setSnapshot({ ...snapshot, liveListings: snapshot.liveListings.map((item) => item.id === updated.id ? updated : item) });
                  }}
                  onRemove={removeListing}
                />
              ))}
            </AdminSection>
            <AdminSection
              title="Rejected listings"
              totalCount={rejectedListings.length}
              visibleCount={filteredRejectedListings.length}
              searchValue={rejectedListingSearch}
              onSearchChange={setRejectedListingSearch}
              searchPlaceholder="Search rejected listings"
              emptyMessage="No rejected listings."
              noMatchesMessage="No rejected listings match your search."
            >
              {filteredRejectedListings.map((listing) => (
                <ActiveListingRow
                  listing={listing}
                  key={listing.id}
                  api={api}
                  token={token}
                  payments={snapshot.payments}
                  sellers={snapshot.sellers}
                  users={snapshot.users}
                  onUpdate={(updated) => {
                    setSnapshot({ ...snapshot, listings: snapshot.listings.map((item) => item.id === updated.id ? updated : item) });
                  }}
                  onRemove={removeListing}
                />
              ))}
            </AdminSection>
            <AdminSection
              title="Archived listings"
              totalCount={archivedListings.length}
              visibleCount={filteredArchivedListings.length}
              searchValue={archivedListingSearch}
              onSearchChange={setArchivedListingSearch}
              searchPlaceholder="Search archived listings"
              emptyMessage="No archived listings."
              noMatchesMessage="No archived listings match your search."
            >
              {filteredArchivedListings.map((listing) => (
                <ActiveListingRow
                  listing={listing}
                  key={listing.id}
                  api={api}
                  token={token}
                  payments={snapshot.payments}
                  sellers={snapshot.sellers}
                  users={snapshot.users}
                  onUpdate={(updated) => {
                    setSnapshot({ ...snapshot, listings: snapshot.listings.map((item) => item.id === updated.id ? updated : item) });
                  }}
                  onRemove={removeListing}
                />
              ))}
            </AdminSection>
          </div>
        )}

        {activeView === "users" && (
          <UserTrialsPanel
            users={snapshot.users}
            api={api}
            token={token}
            activeTrials={activeTrials}
            expiredTrials={expiredTrials}
            terminatedTrials={terminatedTrials}
            setLoadError={setLoadError}
            onUserUpdate={(updated) => {
              setSnapshot({ ...snapshot, users: snapshot.users.map((user) => user.id === updated.id ? updated : user) });
            }}
            refreshSnapshot={async () => {
              try {
                setLoadError(null);
                const refreshed = await api.moderationSnapshot(token);
                setSnapshot(refreshed);
              } catch (e) {
                setLoadError("Unable to refresh snapshot");
              }
            }}
          />
        )}

        {activeView === "payments" && (
          <PaymentsPanel
            payments={snapshot.payments}
            filteredPayments={filteredPayments}
            pendingCount={pendingPayments.length}
            successfulCount={successfulPayments.length}
            search={paymentSearch}
            onSearchChange={setPaymentSearch}
            snapshot={snapshot}
          />
        )}
      </div>
    </section>
  );
}

function AdminNavigation({
  activeView,
  onSelect,
  moderationCount,
  listingCount,
  userCount,
  paymentCount,
  handleLogout,
  theme,
  setTheme
}: {
  activeView: AdminView;
  onSelect: (view: AdminView) => void;
  moderationCount: number;
  listingCount: number;
  userCount: number;
  paymentCount: number;
  handleLogout: () => void;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}) {
  return (
    <aside className="admin-navigation card card--surface">
      <div className="admin-navigation-heading">
        <span>Workspace</span>
        <strong>Admin console</strong>
      </div>
      <nav className="admin-navigation-list" aria-label="Admin sections">
        <AdminNavigationItem icon={<LayoutDashboard size={18} />} label="Overview" view="overview" activeView={activeView} onSelect={onSelect} />
        <AdminNavigationItem icon={<ShieldCheck size={18} />} label="Moderation" view="moderation" activeView={activeView} onSelect={onSelect} count={moderationCount} attention={moderationCount > 0} />
        <div className="admin-navigation-divider" />
        <span className="admin-navigation-group-label">Marketplace</span>
        <AdminNavigationItem icon={<Gem size={18} />} label="Listings" view="listings" activeView={activeView} onSelect={onSelect} count={listingCount} />
        <AdminNavigationItem icon={<UsersRound size={18} />} label="Users & trials" view="users" activeView={activeView} onSelect={onSelect} count={userCount} />
        <div className="admin-navigation-divider" />
        <span className="admin-navigation-group-label">Finance</span>
        <AdminNavigationItem icon={<WalletCards size={18} />} label="Payments" view="payments" activeView={activeView} onSelect={onSelect} count={paymentCount} attention={paymentCount > 0} />
        <button type="button" className="admin-navigation-item signout-action" onClick={handleLogout}>
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </nav>
      <div style={{ marginTop: "auto", padding: "16px", display: "flex", justifyContent: "center" }}>
        <ThemeSwitcher theme={theme} setTheme={setTheme} />
      </div>
    </aside>
  );
}

function AdminNavigationItem({
  icon,
  label,
  view,
  activeView,
  onSelect,
  count,
  attention = false
}: {
  icon: ReactNode;
  label: string;
  view: AdminView;
  activeView: AdminView;
  onSelect: (view: AdminView) => void;
  count?: number;
  attention?: boolean;
}) {
  const isActive = activeView === view;
  return (
    <button type="button" className={`admin-navigation-item${isActive ? " is-active" : ""}`} onClick={() => onSelect(view)} aria-current={isActive ? "page" : undefined}>
      {icon}
      <span>{label}</span>
      {count !== undefined && <strong className={attention ? "needs-attention" : ""}>{count}</strong>}
    </button>
  );
}

function AdminOverview({
  pendingReviews,
  openReports,
  checkedCertificates,
  paidSubscriptions,
  activeTrials,
  liveListings,
  totalUsers,
  pendingPayments,
  onNavigate
}: {
  pendingReviews: number;
  openReports: number;
  checkedCertificates: number;
  paidSubscriptions: number;
  activeTrials: number;
  liveListings: number;
  totalUsers: number;
  pendingPayments: number;
  onNavigate: (view: AdminView) => void;
}) {
  return (
    <div className="admin-console-stack">
      <div className="metric-grid admin-overview-metrics">
        <Metric icon={ClipboardCheck} label="Queued listings" value={String(pendingReviews)} accent="var(--gold)" />
        <Metric icon={Flag} label="Open reports" value={String(openReports)} accent="var(--danger)" />
        <Metric icon={BadgeCheck} label="Checked certs" value={String(checkedCertificates)} accent="var(--emerald)" />
        <Metric icon={PackageCheck} label="Paid subscriptions" value={String(paidSubscriptions)} accent="var(--emerald)" />
        <Metric icon={Clock} label="Active trials" value={String(activeTrials)} accent="var(--gold)" />
      </div>

      <section className="data-panel card card--surface admin-attention-panel">
        <div className="admin-panel-title-row">
          <div>
            <span className="admin-panel-eyebrow">Priority</span>
            <h2>Needs attention</h2>
          </div>
          <span>Open a section to take action</span>
        </div>
        <div className="admin-attention-grid">
          <OverviewAction icon={<ClipboardCheck size={20} />} label="Listings to review" count={pendingReviews} tone="warning" onClick={() => onNavigate("moderation")} />
          <OverviewAction icon={<Flag size={20} />} label="Open reports" count={openReports} tone="danger" onClick={() => onNavigate("moderation")} />
          <OverviewAction icon={<CreditCard size={20} />} label="Pending payments" count={pendingPayments} tone="neutral" onClick={() => onNavigate("payments")} />
        </div>
      </section>

      <section className="data-panel card card--surface admin-snapshot-panel">
        <div className="admin-panel-title-row">
          <div>
            <span className="admin-panel-eyebrow">Marketplace</span>
            <h2>Platform snapshot</h2>
          </div>
        </div>
        <div className="admin-snapshot-grid">
          <button type="button" onClick={() => onNavigate("listings")}>
            <Gem size={20} />
            <span>Live listings</span>
            <strong>{liveListings}</strong>
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => onNavigate("users")}>
            <UsersRound size={20} />
            <span>Registered users</span>
            <strong>{totalUsers}</strong>
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => onNavigate("payments")}>
            <WalletCards size={20} />
            <span>Successful payments</span>
            <strong>{paidSubscriptions}</strong>
            <ChevronRight size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}

function OverviewAction({
  icon,
  label,
  count,
  tone,
  onClick
}: {
  icon: ReactNode;
  label: string;
  count: number;
  tone: "warning" | "danger" | "neutral";
  onClick: () => void;
}) {
  return (
    <button type="button" className={`admin-attention-card tone-${tone}`} onClick={onClick}>
      <span className="admin-attention-icon">{icon}</span>
      <span>{label}</span>
      <strong>{count}</strong>
      <ChevronRight size={18} />
    </button>
  );
}

function PaymentsPanel({
  payments,
  filteredPayments,
  pendingCount,
  successfulCount,
  search,
  onSearchChange,
  snapshot
}: {
  payments: PaymentIntent[];
  filteredPayments: PaymentIntent[];
  pendingCount: number;
  successfulCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  snapshot: AdminModerationSnapshot;
}) {
  const failedCount = payments.filter((payment) => payment.status === "failed").length;
  const otherCount = payments.length - pendingCount - successfulCount - failedCount;
  return (
    <div className="admin-console-stack">
      <div className="metric-grid admin-view-metrics admin-payment-metrics">
        <Metric icon={PackageCheck} label="Succeeded" value={String(successfulCount)} accent="var(--emerald)" />
        <Metric icon={Clock} label="Pending" value={String(pendingCount)} accent="var(--gold)" />
        <Metric icon={CircleAlert} label="Failed" value={String(failedCount)} accent="var(--danger)" />
        <Metric icon={CreditCard} label="Other" value={String(otherCount)} accent="var(--muted)" />
      </div>
      {pendingCount > 0 && (
        <section className="data-panel admin-orders-panel card card--inset card--compact">
          <h2>Gateway confirmations</h2>
          <div className="admin-payment-status">
            <CreditCard size={18} />
            {pendingCount} payment{pendingCount === 1 ? " is" : "s are"} waiting for gateway confirmation.
          </div>
        </section>
      )}
      <AdminSection
        title="Payment history"
        totalCount={payments.length}
        visibleCount={filteredPayments.length}
        searchValue={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search payments, users, or listings"
        emptyMessage="No payments found."
        noMatchesMessage="No payments match your search."
      >
        <div className="admin-payment-list">
          {filteredPayments.map((payment) => {
            const user = snapshot.users.find((item) => item.id === payment.userId);
            const listing = snapshot.listings.find((item) => item.id === payment.listingId)
              ?? snapshot.liveListings.find((item) => item.id === payment.listingId);
            return (
              <div className="admin-payment-row card card--inset card--compact" key={payment.id}>
                <div className="admin-payment-identity">
                  <strong>{listing?.title ?? "Unavailable listing"}</strong>
                  <span>{user?.email ?? payment.userId}</span>
                </div>
                <div className="admin-payment-reference">
                  <span>{payment.quote.plan.name}</span>
                  <small>{payment.id}</small>
                  {payment.stripeInvoiceId && (
                    <a href={`https://dashboard.stripe.com/invoices/${payment.stripeInvoiceId}`} target="_blank" rel="noopener noreferrer" className="admin-payment-stripe-link">
                      {payment.stripeInvoiceId}
                    </a>
                  )}
                </div>
                <div className="admin-payment-amount">
                  <strong>{formatLkr(payment.amountLkr)}</strong>
                  <span>{formatDate(payment.createdAt)}</span>
                </div>
                <span className={`admin-payment-pill status-${payment.status}`}>{payment.status}</span>
              </div>
            );
          })}
        </div>
      </AdminSection>
    </div>
  );
}

function UserTrialsPanel({
  users,
  api,
  token,
  activeTrials,
  expiredTrials,
  terminatedTrials,
  setLoadError,
  onUserUpdate,
  refreshSnapshot
}: {
  users: User[];
  api: GemsAdminApiClient;
  token: string;
  activeTrials: number;
  expiredTrials: number;
  terminatedTrials: number;
  setLoadError: (error: string | null) => void;
  onUserUpdate: (user: User) => void;
  refreshSnapshot: () => Promise<void>;
}) {
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [isSitewideBusy, setIsSitewideBusy] = useState(false);
  const [sitewideEndDate, setSitewideEndDate] = useState<string>("");
  const [trialEndDates, setTrialEndDates] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showTerminateUserPrompt, setShowTerminateUserPrompt] = useState<User | null>(null);
  const [showExtendSitewidePrompt, setShowExtendSitewidePrompt] = useState(false);
  const [showTerminateSitewidePrompt, setShowTerminateSitewidePrompt] = useState(false);
  const [showImpersonatePrompt, setShowImpersonatePrompt] = useState<User | null>(null);
  const [impersonateBusy, setImpersonateBusy] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  const filteredUsers = users.filter((user) => matchesUserSearch(user, search));

  const handleExtend = async (user: User) => {
    const nextDate = trialEndDates[user.id];
    if (!nextDate) return;
    setBusyUserId(user.id);
    try {
      const updated = await api.extendUserTrial(token, user.id, new Date(`${nextDate}T23:59:59`).toISOString());
      onUserUpdate(updated);
      setLoadError(null);
    } catch (error) {
      setLoadError(publicErrorMessage(error, "Unable to extend trial"));
    } finally {
      setBusyUserId(null);
    }
  };

  const confirmTerminate = async (user: User) => {
    setBusyUserId(user.id);
    try {
      const updated = await api.terminateUserTrial(token, user.id);
      onUserUpdate(updated);
      setLoadError(null);
      setShowTerminateUserPrompt(null);
    } catch (error) {
      setLoadError(publicErrorMessage(error, "Unable to terminate trial"));
    } finally {
      setBusyUserId(null);
    }
  };

  const handleTerminate = (user: User) => {
    setShowTerminateUserPrompt(user);
  };

  const handleImpersonate = (user: User) => {
    setShowImpersonatePrompt(user);
    setImpersonateError(null);
  };

  const confirmImpersonate = async (user: User) => {
    setImpersonateBusy(true);
    setImpersonateError(null);
    try {
      const { customToken } = await api.impersonateUser(token, user.id);
      setImpersonationInfo({ uid: user.id, email: user.email });
      // Sign in with the custom token in the new tab via localStorage to avoid
      // cross-tab sessionStorage cloning issues. The new tab picks up the key
      // and signs in, immediately removing it from localStorage.
      try {
        window.localStorage.setItem("gems-pending-impersonation-token", customToken);
      } catch {
        // localStorage write failure shouldn't block the flow
      }
      window.open("/", "_blank");
      setShowImpersonatePrompt(null);
    } catch (error) {
      setImpersonateError(error instanceof Error ? error.message : "Unable to start impersonation");
    } finally {
      setImpersonateBusy(false);
    }
  };

  const handleExtendSitewide = () => {
    if (!sitewideEndDate) return;
    setShowExtendSitewidePrompt(true);
  };

  const confirmExtendSitewide = async () => {
    setIsSitewideBusy(true);
    try {
      await api.extendSitewideTrial(token, new Date(`${sitewideEndDate}T23:59:59`).toISOString());
      await refreshSnapshot();
      setSitewideEndDate("");
      setLoadError(null);
      setShowExtendSitewidePrompt(false);
    } catch (error) {
      setLoadError(publicErrorMessage(error, "Unable to extend sitewide trial"));
    } finally {
      setIsSitewideBusy(false);
    }
  };

  const handleTerminateSitewide = () => {
    setShowTerminateSitewidePrompt(true);
  };

  const confirmTerminateSitewide = async () => {
    setIsSitewideBusy(true);
    try {
      await api.terminateSitewideTrial(token);
      await refreshSnapshot();
      setLoadError(null);
      setShowTerminateSitewidePrompt(false);
    } catch (error) {
      setLoadError(publicErrorMessage(error, "Unable to terminate sitewide trial"));
    } finally {
      setIsSitewideBusy(false);
    }
  };

  return (
    <AdminSection
      title="Users / Trials"
      totalCount={users.length}
      visibleCount={filteredUsers.length}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search users and trials"
      emptyMessage="No users found."
      noMatchesMessage="No users match your search."
      summary={(
        <div className="metric-grid admin-section-metrics">
          <Metric icon={Clock} label="Active" value={String(activeTrials)} accent="var(--gold)" />
          <Metric icon={CalendarPlus} label="Expired" value={String(expiredTrials)} accent="var(--muted)" />
          <Metric icon={Ban} label="Terminated" value={String(terminatedTrials)} accent="var(--danger)" />
        </div>
      )}
    >
      <div className="admin-sitewide-actions card card--compact" style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem", alignItems: "center", background: "var(--background-secondary)" }}>
        <strong>Sitewide Trial:</strong>
        <input
          type="date"
          value={sitewideEndDate}
          min={dateInputValue(new Date().toISOString())}
          onChange={(event) => setSitewideEndDate(event.target.value)}
          disabled={isSitewideBusy}
          style={{ padding: "0.25rem 0.5rem" }}
        />
        <button type="button" className="active-listing-action" disabled={isSitewideBusy || !sitewideEndDate} onClick={() => void handleExtendSitewide()}>
          <CalendarPlus size={16} /> Extend All
        </button>
        <button type="button" className="active-listing-action danger" disabled={isSitewideBusy} onClick={() => void handleTerminateSitewide()}>
          <Ban size={16} /> Terminate All
        </button>
      </div>

      <div className="admin-trial-list">
          {filteredUsers.map((user) => {
            const trial = user.trial;
            const busy = busyUserId === user.id;
            return (
              <div key={user.id} className="admin-trial-row card card--inset card--compact">
                <div className="admin-trial-identity">
                  <strong>{user.name || user.email}</strong>
                  <span>{user.email}</span>
                </div>
                <div className="admin-trial-status">
                  <strong className={`status-${trial?.status ?? "unknown"}`}>{trial?.status ?? "unknown"}</strong>
                  {trial?.endsAt && <span>Ends {formatDate(trial.endsAt)}</span>}
                  {trial?.terminatedAt && <span>Terminated {formatDate(trial.terminatedAt)}</span>}
                </div>
                <div className="admin-trial-actions">
                  <input
                    type="date"
                    value={trialEndDates[user.id] ?? dateInputValue(trial?.endsAt)}
                    min={dateInputValue(trial?.endsAt)}
                    onChange={(event) => setTrialEndDates((current) => ({ ...current, [user.id]: event.target.value }))}
                    disabled={busy}
                  />
                  <button type="button" className="active-listing-action" disabled={busy || !trialEndDates[user.id]} onClick={() => void handleExtend(user)}>
                    <CalendarPlus size={16} /> Extend
                  </button>
                  <button type="button" className="active-listing-action danger" disabled={busy || trial?.status === "terminated"} onClick={() => void handleTerminate(user)}>
                    <Ban size={16} /> Terminate
                  </button>
                  <button type="button" className="active-listing-action" disabled={busy} onClick={() => handleImpersonate(user)} title="Sign in as this user in a new tab">
                    <LogIn size={16} /> Login as User
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {showTerminateUserPrompt && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="terminate-user-title">
            <h3 id="terminate-user-title" className="confirmation-dialog-title tone-danger">
              <Ban size={20} /> Terminate Trial
            </h3>
            <p className="confirmation-dialog-copy">
              Terminate free trial for {showTerminateUserPrompt.email}? Trial-backed listings will expire immediately.
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setShowTerminateUserPrompt(null)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmTerminate(showTerminateUserPrompt)}
                disabled={busyUserId === showTerminateUserPrompt.id}
                className="confirmation-dialog-button tone-danger"
              >
                {busyUserId === showTerminateUserPrompt.id ? "Terminating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showExtendSitewidePrompt && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="extend-sitewide-title">
            <h3 id="extend-sitewide-title" className="confirmation-dialog-title tone-warning">
              <CalendarPlus size={20} /> Extend Sitewide Trial
            </h3>
            <p className="confirmation-dialog-copy">
              Are you sure you want to extend the free trial for ALL users to {sitewideEndDate}?
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setShowExtendSitewidePrompt(false)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmExtendSitewide()}
                disabled={isSitewideBusy}
                className="confirmation-dialog-button tone-warning"
              >
                {isSitewideBusy ? "Extending..." : "Confirm Extension"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showTerminateSitewidePrompt && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="terminate-sitewide-title">
            <h3 id="terminate-sitewide-title" className="confirmation-dialog-title tone-danger">
              <Ban size={20} /> Terminate All Trials
            </h3>
            <p className="confirmation-dialog-copy">
              Terminate free trial for ALL users immediately? Trial-backed listings will expire.
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setShowTerminateSitewidePrompt(false)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmTerminateSitewide()}
                disabled={isSitewideBusy}
                className="confirmation-dialog-button tone-danger"
              >
                {isSitewideBusy ? "Terminating..." : "Confirm Termination"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showImpersonatePrompt && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="impersonate-title">
            <h3 id="impersonate-title" className="confirmation-dialog-title" style={{ color: "var(--gold)" }}>
              <LogIn size={20} /> Sign in as User
            </h3>
            <p className="confirmation-dialog-copy">
              You will be signed in as <strong>{showImpersonatePrompt.name || showImpersonatePrompt.email}</strong> ({showImpersonatePrompt.email}) in a new tab.
              The marketplace will open with full access as this user. An audit log entry will be recorded.
            </p>
            {impersonateError && (
              <p style={{ color: "var(--danger)", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>{impersonateError}</p>
            )}
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => { setShowImpersonatePrompt(null); setImpersonateError(null); }}
                className="confirmation-dialog-button"
                disabled={impersonateBusy}
              >
                Cancel
              </button>
              <button
                id="confirm-impersonate-btn"
                onClick={() => void confirmImpersonate(showImpersonatePrompt)}
                disabled={impersonateBusy}
                className="confirmation-dialog-button tone-warning"
              >
                {impersonateBusy ? "Opening..." : "Open as User"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </AdminSection>
  );
}

function AdminSection({
  title,
  totalCount,
  visibleCount,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  emptyMessage,
  noMatchesMessage,
  className = "",
  summary,
  children
}: {
  title: string;
  totalCount: number;
  visibleCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  noMatchesMessage: string;
  className?: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const hasSearch = normalizeSearch(searchValue).length > 0;
  const countLabel = hasSearch ? `${visibleCount} of ${totalCount}` : String(totalCount);
  const pluralCount = hasSearch ? visibleCount : totalCount;

  return (
    <section className={`data-panel admin-data-section card card--surface ${className}`}>
      <div className="admin-section-header">
        <div>
          <h2>{title}</h2>
          <span>{countLabel} item{pluralCount === 1 ? "" : "s"}</span>
        </div>
        <label className="admin-section-search">
          <Search size={16} aria-hidden="true" />
          <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
        </label>
      </div>
      {summary}
      <div className="admin-section-scroll">
        {totalCount === 0 ? (
          <AdminSectionEmpty message={emptyMessage} />
        ) : visibleCount === 0 ? (
          <AdminSectionEmpty message={noMatchesMessage} />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function AdminSectionEmpty({ message }: { message: string }) {
  return <div className="admin-section-empty">{message}</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function dateInputValue(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function matchesListingSearch(listing: Listing, query: string, snapshot: AdminModerationSnapshot) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const seller = snapshot.sellers.find((item) => item.id === listing.sellerId);
  const sellerUser = seller ? snapshot.users.find((item) => item.id === seller.userId) : undefined;
  const payment = snapshot.payments.find((item) => item.listingId === listing.id);
  return searchableText([
    listing.id,
    listing.title,
    listing.description,
    listing.location,
    listing.status,
    listing.moderationStatus,
    listing.rejectionReason,
    listing.attributes.carat,
    listing.attributes.color,
    listing.attributes.origin,
    listing.attributes.treatment,
    listing.attributes.certificateStatus,
    listing.attributes.labName,
    listing.attributes.reportNumber,
    seller?.displayName,
    seller?.businessName,
    sellerUser?.name,
    sellerUser?.email,
    sellerUser?.phone,
    listing.subscription?.source,
    listing.subscription?.status,
    listing.subscription?.planId,
    payment?.status,
    payment?.quote.plan.name,
    payment?.stripeInvoiceId
  ]).includes(normalizedQuery);
}

function matchesReportSearch(report: Report, query: string, snapshot: AdminModerationSnapshot) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const reporter = report.reporterId ? snapshot.users.find((user) => user.id === report.reporterId) : undefined;
  const listing = snapshot.reportedListings.find((item) => item.id === report.listingId)
    ?? snapshot.liveListings.find((item) => item.id === report.listingId)
    ?? snapshot.listings.find((item) => item.id === report.listingId);
  const listingText = listing ? listingSearchParts(listing, snapshot) : [];
  return searchableText([
    report.id,
    report.reason,
    report.status,
    report.notes,
    reporter?.name,
    reporter?.email,
    ...listingText
  ]).includes(normalizedQuery);
}

function matchesUserSearch(user: User, query: string) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return searchableText([
    user.id,
    user.name,
    user.email,
    user.phone,
    user.address,
    user.role,
    user.status,
    user.trial?.status,
    user.trial?.startsAt,
    user.trial?.endsAt,
    user.trial?.terminatedAt
  ]).includes(normalizedQuery);
}

function matchesPaymentSearch(payment: PaymentIntent, query: string, snapshot: AdminModerationSnapshot) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const user = snapshot.users.find((item) => item.id === payment.userId);
  const listing = snapshot.listings.find((item) => item.id === payment.listingId)
    ?? snapshot.liveListings.find((item) => item.id === payment.listingId);
  return searchableText([
    payment.id,
    payment.status,
    payment.purpose,
    payment.amountLkr,
    payment.gateway,
    payment.gatewayReference,
    payment.stripeInvoiceId,
    payment.quote.plan.name,
    user?.name,
    user?.email,
    listing?.title,
    listing?.id
  ]).includes(normalizedQuery);
}

function listingSearchParts(listing: Listing, snapshot: AdminModerationSnapshot) {
  const seller = snapshot.sellers.find((item) => item.id === listing.sellerId);
  const sellerUser = seller ? snapshot.users.find((item) => item.id === seller.userId) : undefined;
  return [
    listing.id,
    listing.title,
    listing.description,
    listing.location,
    listing.status,
    listing.moderationStatus,
    listing.attributes.carat,
    listing.attributes.color,
    listing.attributes.origin,
    listing.attributes.treatment,
    listing.attributes.certificateStatus,
    seller?.displayName,
    sellerUser?.name,
    sellerUser?.email
  ];
}

function searchableText(values: Array<string | number | undefined | null>) {
  return normalizeSearch(values.filter((value) => value !== undefined && value !== null).join(" "));
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}


