import { BadgeCheck, ClipboardCheck, Flag, PackageCheck } from "lucide-react";
import { GemsAdminApiClient, type AdminModerationSnapshot } from "@gems/api-client";
import { Metric } from "../../shared/Metric";
import { ActiveListingRow } from "./ActiveListingRow";
import { AdminOrderRow } from "./AdminOrderRow";
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
  const activeOrders = snapshot.orders.filter((order) => order.status !== "closed" && order.status !== "rejected");
  const pastOrders = snapshot.orders.filter((order) => order.status === "closed" || order.status === "rejected");
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
        <Metric icon={PackageCheck} label="Active orders" value={String(activeOrders.length)} accent="var(--emerald)" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 16 }}>
        <section className="data-panel admin-orders-panel" style={{ background: "var(--panel-strong)" }}>
          <h2>Active Orders</h2>
          {activeOrders.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontWeight: 500 }}>No active orders.</div>
          ) : (
            <div style={{ maxHeight: "750px", overflowY: "auto", paddingRight: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {activeOrders.map((order) => (
                <AdminOrderRow
                  key={order.id}
                  order={order}
                  api={api}
                  token={token}
                  onUpdate={(updated) => {
                    setSnapshot({
                      ...snapshot,
                      orders: snapshot.orders.map((item) => item.id === updated.id ? updated : item)
                    });
                  }}
                  setLoadError={setLoadError}
                />
              ))}
            </div>
          )}
        </section>
        {pastOrders.length > 0 && (
          <section className="data-panel admin-orders-panel" style={{ background: "var(--panel-strong)" }}>
            <h2>Past Orders</h2>
            <div style={{ maxHeight: "750px", overflowY: "auto", paddingRight: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {pastOrders.map((order) => (
                <AdminOrderRow
                  key={order.id}
                  order={order}
                  api={api}
                  token={token}
                  onUpdate={(updated) => {
                    setSnapshot({
                      ...snapshot,
                      orders: snapshot.orders.map((item) => item.id === updated.id ? updated : item)
                    });
                  }}
                  setLoadError={setLoadError}
                />
              ))}
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
