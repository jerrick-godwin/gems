import { Eye, Flag, Trash, XCircle } from "lucide-react";
import { useState } from "react";
import type { GemsAdminApiClient, AdminModerationSnapshot } from "@gems/api-client";
import type { Report } from "@gems/schemas";

export function ReportRow({
  report,
  snapshot,
  api,
  token,
  onRemoveListing,
  onResolveReport,
  setLoadError
}: {
  report: Report;
  snapshot: AdminModerationSnapshot;
  api: GemsAdminApiClient;
  token: string;
  onRemoveListing: (listingId: string) => void;
  onResolveReport: (reportId: string) => void;
  setLoadError: (error: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"remove" | "reject" | null>(null);
  const reporter = snapshot.users.find(u => u.id === report.reporterId);
  const listing = snapshot.reportedListings.find(l => l.id === report.listingId) || snapshot.liveListings.find(l => l.id === report.listingId) || snapshot.listings.find(l => l.id === report.listingId);
  const sellerProfile = listing ? snapshot.sellers.find(s => s.id === listing.sellerId) : undefined;
  const sellerUser = sellerProfile ? snapshot.users.find(u => u.id === sellerProfile.userId) : undefined;
  const hasActiveCampaign = listing ? (listing.campaigns || []).some(c => c.status === "active" && new Date(c.endsAt) > new Date()) : false;

  const removeListing = async () => {
    if (!listing) return;
    if (!window.confirm(`Remove "${listing.title}" permanently? This deletes it from the database.`)) return;
    setBusy("remove");
    try {
      await api.removeListing(token, listing.id);
      onRemoveListing(listing.id);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to remove listing");
    } finally {
      setBusy(null);
    }
  };

  const rejectClaim = async () => {
    setBusy("reject");
    try {
      await api.resolveReport(token, report.id);
      onResolveReport(report.id);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to reject report");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="report-row"
      style={{
        borderLeft: report.status === "open" ? "3px solid var(--danger)" : "3px solid var(--gold)",
        background: "var(--panel-strong)",
        padding: 12,
        paddingLeft: 16,
        borderRadius: "var(--radius)",
        marginBottom: 12,
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-xs)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 12
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
        {listing ? (
          <img src={listing.media[0]?.url} alt={listing.title} style={{ width: 80, height: 80, borderRadius: "var(--radius-sm)", objectFit: "cover", border: "1px solid var(--line)", background: "var(--panel)" }} />
        ) : (
          <div style={{ width: 80, height: 80, borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
            <Flag size={20} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 15, fontWeight: 700, display: "block" }}>{listing?.title || "Listing details unavailable"}</strong>
          {listing && (
            <span style={{ fontSize: 13, marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {listing.attributes.carat} ct · LKR {listing.priceLkr.toLocaleString()}
              {hasActiveCampaign && (
                <span style={{ background: "var(--gold-soft)", color: "var(--gold-dark)", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                  PROMOTED
                </span>
              )}
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <Flag size={14} strokeWidth={2} style={{ color: "var(--danger)" }} />
            <span style={{ fontSize: 13, color: "var(--muted)", textTransform: "capitalize" }}>{report.reason.replace(/_/g, " ")}</span>
            <em
              style={{
                padding: "3px 7px",
                borderRadius: "4px",
                background: report.status === "open" ? "var(--danger-soft)" : "rgba(196, 147, 58, 0.1)",
                color: report.status === "open" ? "var(--danger)" : "var(--gold)",
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                fontStyle: "normal"
              }}
            >
              {report.status}
            </em>
          </div>
        </div>
        <button style={{ minHeight: 36, padding: "0 16px", background: "var(--soft)", color: "var(--ink)", fontWeight: 600, marginLeft: "auto" }} onClick={() => setExpanded(!expanded)}>
          <Eye size={16} style={{ marginRight: 6 }} /> {expanded ? "Hide" : "View"}
        </button>
      </div>

      {expanded && (
        <div style={{ background: "var(--soft)", padding: 16, borderRadius: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <strong style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)" }}>Report</strong>
              <div style={{ fontSize: 14, textTransform: "capitalize" }}>{report.reason.replace(/_/g, " ")}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>{report.notes || "No additional notes provided"}</div>
            </div>
            <div>
              <strong style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)" }}>Reporter</strong>
              <div style={{ fontSize: 14 }}>{reporter ? reporter.name : "Unknown User"}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{reporter?.email || "No email"}</div>
            </div>
            <div>
              <strong style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)" }}>Listing Owner</strong>
              <div style={{ fontSize: 14 }}>{sellerUser ? sellerUser.name : sellerProfile?.displayName || "Unknown Owner"}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{sellerUser?.email || "No email"}</div>
            </div>
          </div>

          {listing ? (
            <div className="report-listing-detail" style={{ background: "var(--panel)", padding: 14, borderRadius: 6, border: "1px solid var(--line)" }}>
              <img src={listing.media[0]?.url} alt={listing.title} style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 6, objectFit: "cover", border: "1px solid var(--line)", background: "var(--soft)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{listing.title}</strong>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>ID: {listing.id}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, fontSize: 14 }}>
                  <div><strong>Price:</strong> LKR {listing.priceLkr.toLocaleString()}</div>
                  <div><strong>Carat:</strong> {listing.attributes.carat}</div>
                  <div><strong>Location:</strong> {listing.location}</div>
                  <div><strong>Certificate:</strong> {listing.attributes.certificateStatus.replace("_", " ")}</div>
                  <div><strong>Origin:</strong> {listing.attributes.origin}</div>
                  <div><strong>Treatment:</strong> {listing.attributes.treatment}</div>
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>{listing.description}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: "auto" }}>
                  <button style={{ minHeight: 38, padding: "0 16px", background: "var(--danger-soft)", color: "var(--danger)" }} disabled={busy !== null} onClick={() => void removeListing()}>
                    <Trash size={16} style={{ marginRight: 6 }} /> {busy === "remove" ? "Removing..." : "Remove Listing"}
                  </button>
                  <button style={{ minHeight: 38, padding: "0 16px", background: "var(--soft)", color: "var(--ink)" }} disabled={busy !== null} onClick={() => void rejectClaim()}>
                    <XCircle size={16} style={{ marginRight: 6 }} /> {busy === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 12, background: "var(--panel)", borderRadius: 6, fontSize: 13, color: "var(--muted)" }}>
              Listing details no longer available.
              <div style={{ marginTop: 12 }}>
                <button style={{ minHeight: 36, padding: "0 16px", background: "var(--soft)", color: "var(--ink)" }} disabled={busy !== null} onClick={() => void rejectClaim()}>
                  <XCircle size={16} style={{ marginRight: 6 }} /> {busy === "reject" ? "Rejecting..." : "Reject"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
