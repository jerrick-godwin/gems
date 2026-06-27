import { BadgeCheck, ClipboardCheck, CreditCard, Flag, PackageCheck } from "lucide-react";
import { GemsAdminApiClient, type AdminModerationSnapshot } from "@gems/api-client";
import { formatLkr, type PaymentIntent } from "@gems/schemas";
import { Metric } from "../../shared/Metric";
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
  const moderateListing = async (listingId: string, decision: "approve" | "reject", reason?: string) => {
    try {
      const updated = await api.moderateListing(token, listingId, decision, reason);
      setSnapshot({
        ...snapshot,
        listings: snapshot.listings.map((listing) => listing.id === updated.id ? updated : listing)
      });
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to update listing moderation");
    }
  };

  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1 style={{ background: "var(--ink)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Admin moderation
        </h1>
        <p>Pending gems, certificate claims, and seller risk.</p>
      </div>
      <div className="metric-grid">
        <Metric icon={ClipboardCheck} label="Queued listings" value={String(pending.length)} accent="var(--gold)" />
        <Metric icon={Flag} label="Open reports" value={String(openReports.length)} accent="var(--danger)" />
        <Metric icon={BadgeCheck} label="Checked certs" value={String(checkedCertificates)} accent="var(--emerald)" />
        <Metric icon={PackageCheck} label="Paid subscriptions" value={String(successfulPayments.length)} accent="var(--emerald)" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 16 }}>
        <section className="data-panel admin-orders-panel" style={{ background: "var(--panel-strong)" }}>
          <h2>Listing Subscription Payments</h2>
          {snapshot.payments.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontWeight: 500 }}>No listing subscription payments yet.</div>
          ) : (
            <div style={{ maxHeight: "750px", overflowY: "auto", paddingRight: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {snapshot.payments.map((payment) => (
                <article className="cart-item-card" key={payment.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, padding: 16, border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--panel)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <strong style={{ color: "var(--ink)" }}>{payment.quote.plan.name} listing subscription</strong>
                    <span style={{ color: "var(--muted)", fontWeight: 600 }}>{payment.listingId}</span>
                    <span style={{ color: "var(--muted)", fontWeight: 600 }}>{paymentBreakdown(payment).join(" · ")}</span>
                    <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                      Subscription: {payment.subscriptionId ?? "none"}{payment.stripeSubscriptionId ? ` · Stripe ${shortRef(payment.stripeSubscriptionId)}` : ""}
                    </span>
                    <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                      Checkout: {payment.stripeCheckoutSessionId ? shortRef(payment.stripeCheckoutSessionId) : "not started"}{payment.stripeInvoiceId ? ` · Invoice ${shortRef(payment.stripeInvoiceId)}` : ""}
                    </span>
                    <span style={{ color: "var(--muted)", fontWeight: 600 }}>Policy accepted: {formatDate(payment.policyAcceptedAt)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <strong style={{ color: "var(--emerald)", fontSize: 18 }}>{formatLkr(payment.amountLkr)}</strong>
                    <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 8px", borderRadius: 999, background: payment.status === "succeeded" ? "var(--emerald-subtle)" : "var(--soft)", color: payment.status === "succeeded" ? "var(--emerald)" : "var(--muted)" }}>{payment.status.replace("_", " ")}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        {pendingPayments.length > 0 && (
          <section className="data-panel admin-orders-panel" style={{ background: "var(--panel-strong)" }}>
            <h2>Pending Payments</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontWeight: 700 }}>
              <CreditCard size={18} />
              {pendingPayments.length} payment{pendingPayments.length > 1 ? "s" : ""} waiting for gateway confirmation.
            </div>
          </section>
        )}
        <section className="data-panel" style={{ background: "var(--panel-strong)" }}>
          <h2>Review queue</h2>
          {pending.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontWeight: 500 }}>No listings pending review.</div>
          ) : (
            pending.map((listing) => <ReviewRow listing={listing} snapshot={snapshot} onModerate={moderateListing} key={listing.id} />)
          )}
        </section>
        <section className="data-panel" style={{ background: "var(--panel-strong)" }}>
          <h2>Reports</h2>
          {openReports.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontWeight: 500 }}>No open reports.</div>
          ) : (
            openReports.map((report) => (
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
            ))
          )}
        </section>
      </div>
      <section className="data-panel" style={{ background: "var(--panel-strong)", marginTop: 24 }}>
        <h2>Active Listings</h2>
        {snapshot.liveListings.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontWeight: 500 }}>No live listings.</div>
        ) : (
          snapshot.liveListings.map((listing) => (
            <ActiveListingRow 
              listing={listing} 
              key={listing.id} 
              api={api}
              token={token}
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
          ))
        )}
      </section>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function paymentBreakdown(payment: PaymentIntent) {
  const lines = [`Base ${formatLkr(payment.quote.basePriceLkr)}`];
  if (payment.quote.extraPhotoCount > 0) {
    lines.push(`${payment.quote.extraPhotoCount} extra photo${payment.quote.extraPhotoCount === 1 ? "" : "s"} ${formatLkr(payment.quote.extraPhotoTotalLkr)}`);
  }
  return lines;
}

function shortRef(value: string) {
  return value.length > 18 ? `${value.slice(0, 14)}...` : value;
}
