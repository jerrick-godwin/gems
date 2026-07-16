import { Eye, Flag, Trash, XCircle } from "lucide-react";
import { useState } from "react";
import type { GemsAdminApiClient, AdminModerationSnapshot } from "@gems/api-client";
import type { Report } from "@gems/schemas";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { publicErrorMessage } from "../../shared/helpers";
import { AdminMediaPreview } from "./AdminMediaPreview";

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
  const rowAction = useSingleFlightAction();
  const reporter = snapshot.users.find(u => u.id === report.reporterId);
  const listing = snapshot.reportedListings.find(l => l.id === report.listingId) || snapshot.liveListings.find(l => l.id === report.listingId) || snapshot.listings.find(l => l.id === report.listingId);
  const sellerProfile = listing ? snapshot.sellers.find(s => s.id === listing.sellerId) : undefined;
  const sellerUser = sellerProfile ? snapshot.users.find(u => u.id === sellerProfile.userId) : undefined;
  const hasActiveCampaign = listing ? (listing.campaigns || []).some(c => c.status === "active" && new Date(c.endsAt) > new Date()) : false;

  const removeListing = async () => {
    if (!listing) return;
    if (!window.confirm(`Remove "${listing.title}" permanently? This deletes it from the database.`)) return;
    await rowAction.run(async () => {
      setBusy("remove");
      try {
        await api.removeListing(token, listing.id);
        onRemoveListing(listing.id);
        setLoadError(null);
      } catch (error) {
        setLoadError(publicErrorMessage(error, "Unable to remove listing"));
      } finally {
        setBusy(null);
      }
    });
  };

  const rejectClaim = async () => {
    await rowAction.run(async () => {
      setBusy("reject");
      try {
        await api.resolveReport(token, report.id);
        onResolveReport(report.id);
        setLoadError(null);
      } catch (error) {
        setLoadError(publicErrorMessage(error, "Unable to reject report"));
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <article className={`report-row card card--surface card--compact status-${report.status}`}>
      <div className="report-row-summary">
        {listing ? (
          <AdminMediaPreview media={listing.media.find((item) => item.kind !== "certificate") ?? listing.media[0]} alt={listing.title} />
        ) : (
          <div className="report-row-media-placeholder">
            <Flag size={20} />
          </div>
        )}
        <div className="report-row-identity">
          <strong>{listing?.title || "Listing details unavailable"}</strong>
          {listing && (
            <span className="report-row-listing-meta">
              {listing.attributes.carat} ct · LKR {listing.priceLkr.toLocaleString()}
              {hasActiveCampaign && (
                <span className="report-row-promoted">
                  PROMOTED
                </span>
              )}
            </span>
          )}
          <div className="report-row-reason">
            <Flag size={14} strokeWidth={2} />
            <span>{report.reason.replace(/_/g, " ")}</span>
            <em className="report-row-status">
              {report.status}
            </em>
          </div>
        </div>
        <button className="report-row-action report-row-view" onClick={() => setExpanded(!expanded)}>
          <Eye size={16} /> {expanded ? "Hide" : "View"}
        </button>
      </div>

      {expanded && (
        <div className="report-row-details card card--inset card--compact">
          <div className="report-row-facts">
            <div className="report-row-fact">
              <strong>Report</strong>
              <div className="is-capitalized">{report.reason.replace(/_/g, " ")}</div>
              <div className="report-row-fact-note">{report.notes || "No additional notes provided"}</div>
            </div>
            <div className="report-row-fact">
              <strong>Reporter</strong>
              <div>{reporter ? reporter.name : "Unknown User"}</div>
              <div className="report-row-fact-note">{reporter?.email || "No email"}</div>
            </div>
            <div className="report-row-fact">
              <strong>Listing Owner</strong>
              <div>{sellerUser ? sellerUser.name : sellerProfile?.displayName || "Unknown Owner"}</div>
              <div className="report-row-fact-note">{sellerUser?.email || "No email"}</div>
            </div>
          </div>

          {listing ? (
            <div className="report-listing-detail card card--inset card--compact">
              <AdminMediaPreview media={listing.media.find((item) => item.kind !== "certificate") ?? listing.media[0]} alt={listing.title} variant="detail" />
              <div className="report-listing-copy">
                <div>
                  <strong className="report-listing-title">{listing.title}</strong>
                  <div className="report-listing-id">ID: {listing.id}</div>
                </div>
                <div className="report-listing-facts">
                  <div><strong>Price:</strong> LKR {listing.priceLkr.toLocaleString()}</div>
                  <div><strong>Carat:</strong> {listing.attributes.carat}</div>
                  <div><strong>Location:</strong> {listing.location}</div>
                  <div><strong>Certificate:</strong> {listing.attributes.certificateStatus.replace("_", " ")}</div>
                  <div><strong>Origin:</strong> {listing.attributes.origin}</div>
                  <div><strong>Treatment:</strong> {listing.attributes.treatment}</div>
                </div>
                <div className="report-listing-description">{listing.description}</div>
                <div className="report-listing-actions">
                  <button className="report-row-action tone-danger" disabled={rowAction.busy || busy !== null} onClick={() => void removeListing()}>
                    <Trash size={16} /> {busy === "remove" ? "Removing..." : "Remove Listing"}
                  </button>
                  <button className="report-row-action" disabled={rowAction.busy || busy !== null} onClick={() => void rejectClaim()}>
                    <XCircle size={16} /> {busy === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="report-row-unavailable card card--inset card--compact">
              Listing details no longer available.
              <div className="report-row-unavailable-action">
                <button className="report-row-action" disabled={rowAction.busy || busy !== null} onClick={() => void rejectClaim()}>
                  <XCircle size={16} /> {busy === "reject" ? "Rejecting..." : "Reject"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
