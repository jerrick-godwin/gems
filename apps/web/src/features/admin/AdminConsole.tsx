import { BadgeCheck, Ban, CalendarPlus, ClipboardCheck, Clock, CreditCard, Flag, PackageCheck, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GemsAdminApiClient, type AdminModerationSnapshot } from "@gems/api-client";
import type { Listing, Report, User } from "@gems/schemas";
import { Metric } from "../../shared/Metric";
import { publicErrorMessage } from "../../shared/helpers";
import { ActiveListingRow } from "./ActiveListingRow";
import { ReportRow } from "./ReportRow";
import { ReviewRow } from "./ReviewRow";

export function AdminConsole({
  api,
  token,
  snapshot,
  setSnapshot,
  setLoadError
}: {
  api: GemsAdminApiClient;
  token: string;
  snapshot: AdminModerationSnapshot;
  setSnapshot: (snapshot: AdminModerationSnapshot) => void;
  setLoadError: (error: string | null) => void;
}) {
  const pending = snapshot.listings.filter((listing) => listing.moderationStatus === "queued");
  const openReports = snapshot.reports.filter((report) => report.status !== "resolved");
  const checkedCertificates = snapshot.listings.filter((listing) => listing.attributes.certificateStatus === "admin_verified").length;
  const successfulPayments = snapshot.payments.filter((payment) => payment.status === "succeeded");
  const pendingPayments = snapshot.payments.filter((payment) => payment.status === "pending");
  const activeTrials = snapshot.users.filter((user) => user.trial?.status === "active").length;
  const expiredTrials = snapshot.users.filter((user) => user.trial?.status === "expired").length;
  const terminatedTrials = snapshot.users.filter((user) => user.trial?.status === "terminated").length;
  const [reviewSearch, setReviewSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [activeListingSearch, setActiveListingSearch] = useState("");
  const [rejectedListingSearch, setRejectedListingSearch] = useState("");
  const [archivedListingSearch, setArchivedListingSearch] = useState("");
  const allListings = Array.from(new Map([...snapshot.listings, ...snapshot.liveListings].map((listing) => [listing.id, listing])).values());
  const rejectedListings = allListings.filter((listing) => listing.status === "rejected" || listing.moderationStatus === "rejected");
  const archivedListings = allListings.filter((listing) => listing.status === "expired" || listing.status === "paused");
  const filteredPending = pending.filter((listing) => matchesListingSearch(listing, reviewSearch, snapshot));
  const filteredReports = openReports.filter((report) => matchesReportSearch(report, reportSearch, snapshot));
  const filteredActiveListings = snapshot.liveListings.filter((listing) => matchesListingSearch(listing, activeListingSearch, snapshot));
  const filteredRejectedListings = rejectedListings.filter((listing) => matchesListingSearch(listing, rejectedListingSearch, snapshot));
  const filteredArchivedListings = archivedListings.filter((listing) => matchesListingSearch(listing, archivedListingSearch, snapshot));
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

  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1>Admin moderation</h1>
        <p>Pending gems, certificate claims, and seller risk.</p>
      </div>
      <div className="metric-grid">
        <Metric icon={ClipboardCheck} label="Queued listings" value={String(pending.length)} accent="var(--gold)" />
        <Metric icon={Flag} label="Open reports" value={String(openReports.length)} accent="var(--danger)" />
        <Metric icon={BadgeCheck} label="Checked certs" value={String(checkedCertificates)} accent="var(--emerald)" />
        <Metric icon={PackageCheck} label="Paid subscriptions" value={String(successfulPayments.length)} accent="var(--emerald)" />
        <Metric icon={Clock} label="Active trials" value={String(activeTrials)} accent="var(--gold)" />
      </div>
      <div className="admin-console-stack">
        {pendingPayments.length > 0 && (
          <section className="data-panel admin-orders-panel card card--inset card--compact">
            <h2>Pending Payments</h2>
            <div className="admin-payment-status">
              <CreditCard size={18} />
              {pendingPayments.length} payment{pendingPayments.length > 1 ? "s" : ""} waiting for gateway confirmation.
            </div>
          </section>
        )}
        <UserTrialsPanel
          users={snapshot.users}
          api={api}
          token={token}
          activeTrials={activeTrials}
          expiredTrials={expiredTrials}
          terminatedTrials={terminatedTrials}
          setLoadError={setLoadError}
          onUserUpdate={(updated) => {
            setSnapshot({
              ...snapshot,
              users: snapshot.users.map((user) => user.id === updated.id ? updated : user)
            });
          }}
        />
        <AdminSection
          title="Review queue"
          totalCount={pending.length}
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
                onRemoveListing={(listingId) => {
                  setSnapshot({
                    ...snapshot,
                    listings: snapshot.listings.filter((listing) => listing.id !== listingId),
                    liveListings: snapshot.liveListings.filter((listing) => listing.id !== listingId),
                    reportedListings: snapshot.reportedListings.filter((listing) => listing.id !== listingId),
                    reports: snapshot.reports.map((item) => item.listingId === listingId ? { ...item, status: "resolved", listingId: "" } : item)
                  });
                }}
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
      <AdminSection
        title="Active Listings"
        totalCount={snapshot.liveListings.length}
        visibleCount={filteredActiveListings.length}
        searchValue={activeListingSearch}
        onSearchChange={setActiveListingSearch}
        searchPlaceholder="Search active listings"
        emptyMessage="No live listings."
        noMatchesMessage="No active listings match your search."
        className="admin-section-spaced"
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
                setSnapshot({
                  ...snapshot,
                  liveListings: snapshot.liveListings.map(l => l.id === updated.id ? updated : l)
                });
              }}
              onRemove={(id) => {
                setSnapshot({
                  ...snapshot,
                  listings: snapshot.listings.filter(l => l.id !== id),
                  liveListings: snapshot.liveListings.filter(l => l.id !== id),
                  reportedListings: snapshot.reportedListings.filter(l => l.id !== id),
                  reports: snapshot.reports.map(report => report.listingId === id ? { ...report, status: "resolved", listingId: "" } : report)
                });
              }}
            />
          ))}
      </AdminSection>
      
      <AdminSection
        title="Rejected Listings"
        totalCount={rejectedListings.length}
        visibleCount={filteredRejectedListings.length}
        searchValue={rejectedListingSearch}
        onSearchChange={setRejectedListingSearch}
        searchPlaceholder="Search rejected listings"
        emptyMessage="No rejected listings."
        noMatchesMessage="No rejected listings match your search."
        className="admin-section-spaced"
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
                setSnapshot({
                  ...snapshot,
                  listings: snapshot.listings.map(l => l.id === updated.id ? updated : l)
                });
              }}
              onRemove={(id) => {
                setSnapshot({
                  ...snapshot,
                  listings: snapshot.listings.filter(l => l.id !== id),
                  liveListings: snapshot.liveListings.filter(l => l.id !== id),
                  reportedListings: snapshot.reportedListings.filter(l => l.id !== id),
                  reports: snapshot.reports.map(report => report.listingId === id ? { ...report, status: "resolved", listingId: "" } : report)
                });
              }}
            />
          ))}
      </AdminSection>

      <AdminSection
        title="Archived Listings"
        totalCount={archivedListings.length}
        visibleCount={filteredArchivedListings.length}
        searchValue={archivedListingSearch}
        onSearchChange={setArchivedListingSearch}
        searchPlaceholder="Search archived listings"
        emptyMessage="No archived listings."
        noMatchesMessage="No archived listings match your search."
        className="admin-section-spaced"
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
                setSnapshot({
                  ...snapshot,
                  listings: snapshot.listings.map(l => l.id === updated.id ? updated : l)
                });
              }}
              onRemove={(id) => {
                setSnapshot({
                  ...snapshot,
                  listings: snapshot.listings.filter(l => l.id !== id),
                  liveListings: snapshot.liveListings.filter(l => l.id !== id),
                  reportedListings: snapshot.reportedListings.filter(l => l.id !== id),
                  reports: snapshot.reports.map(report => report.listingId === id ? { ...report, status: "resolved", listingId: "" } : report)
                });
              }}
            />
          ))}
      </AdminSection>
    </section>
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
  onUserUpdate
}: {
  users: User[];
  api: GemsAdminApiClient;
  token: string;
  activeTrials: number;
  expiredTrials: number;
  terminatedTrials: number;
  setLoadError: (error: string | null) => void;
  onUserUpdate: (user: User) => void;
}) {
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [trialEndDates, setTrialEndDates] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
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

  const handleTerminate = async (user: User) => {
    if (!window.confirm(`Terminate free trial for ${user.email}? Trial-backed listings will expire immediately.`)) return;
    setBusyUserId(user.id);
    try {
      const updated = await api.terminateUserTrial(token, user.id);
      onUserUpdate(updated);
      setLoadError(null);
    } catch (error) {
      setLoadError(publicErrorMessage(error, "Unable to terminate trial"));
    } finally {
      setBusyUserId(null);
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
                </div>
              </div>
            );
          })}
        </div>
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
