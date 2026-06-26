import { BadgeCheck, ChevronDown, Gem } from "lucide-react";
import { useState } from "react";
import type { MarketplaceSnapshot } from "@gems/api-client";
import { formatLkr, type Listing, type Report, type SellerProfile } from "@gems/schemas";
import { StatusState } from "../../shared/StatusState";
import { reportReasonLabel, sellerProfileLabel } from "./helpers";

export function MyReportsView({
  reports,
  listings,
  gemTypes,
  sellers
}: {
  reports: Report[];
  listings: Listing[];
  gemTypes: MarketplaceSnapshot["gemTypes"];
  sellers: SellerProfile[];
}) {
  const [expandedReportId, setExpandedReportId] = useState<string | null>(reports[0]?.id ?? null);
  const getStatusLabel = (status: string, hasListing: boolean) => {
    if (status === "resolved") {
      if (hasListing) {
        return { label: "Rejected", color: "var(--danger)", bg: "var(--danger-soft)" };
      }
      return { label: "Resolved", color: "var(--emerald)", bg: "var(--emerald-soft)" };
    }
    if (status === "investigating") {
      return { label: "Investigating", color: "var(--gold)", bg: "rgba(251,191,36,0.15)" };
    }
    return { label: "Open", color: "var(--ink)", bg: "var(--line-subtle)" };
  };
  const listingForReport = (report: Report) => report.listing ?? listings.find((listing) => listing.id === report.listingId);

  if (reports.length === 0) {
    return <StatusState title="No reports found" message="You haven't reported any listings yet." showAction={false} />;
  }

  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1>My Reports</h1>
        <p>View the status of listings you have reported.</p>
      </div>
      <section className="data-panel">
        <div className="reports-stack">
          {reports.map((report) => {
            const listing = listingForReport(report);
            const statusInfo = getStatusLabel(report.status, !!listing);
            const isExpanded = expandedReportId === report.id;
            const gemType = listing ? gemTypes.find((item) => item.id === listing.gemTypeId) : undefined;
            const seller = listing ? sellers.find((item) => item.id === listing.sellerId) : undefined;
            const facts = listing
              ? [
                  ["Carat", String(listing.attributes.carat)],
                  ["Color", listing.attributes.color],
                  ["Shape", listing.attributes.shape],
                  ["Cut", listing.attributes.cut],
                  ["Clarity", listing.attributes.clarity],
                  ["Origin", listing.attributes.origin],
                  ["Treatment", listing.attributes.treatment],
                  ["Location", listing.location]
                ]
              : [];
            return (
              <article key={report.id} className={`report-card ${isExpanded ? "expanded" : ""}`}>
                <div className="report-card-header">
                  <div className="report-summary">
                    {listing?.media[0] ? (
                      <img className="report-thumb" src={listing.media[0].url} alt={listing.title} />
                    ) : (
                      <div className="report-thumb report-thumb-empty">
                        <Gem size={22} strokeWidth={1.8} />
                      </div>
                    )}
                    <div className="report-title-block">
                      <span className="report-kicker">Reported listing</span>
                      <h3>{listing?.title ?? report.listingId}</h3>
                      {listing && (
                        <div className="report-meta">
                          <span>{gemType?.name ?? "Gemstone"}</span>
                          <span>{formatLkr(listing.priceLkr)}</span>
                          <span>{listing.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="report-actions">
                    <span className="report-status" style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                      className="report-toggle"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "Hide details" : "View details"}
                      <ChevronDown size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>

                <div className="report-reason-strip">
                  <div>
                    <span>Reason</span>
                    <strong>{reportReasonLabel(report.reason)}</strong>
                  </div>
                  {report.notes && (
                    <div>
                      <span>Notes</span>
                      <strong>{report.notes}</strong>
                    </div>
                  )}
                </div>

                {isExpanded && listing && (
                  <div className="report-listing-detail">
                    <div className="report-detail-media">
                      {listing.media[0] && <img src={listing.media[0].url} alt={listing.title} />}
                    </div>
                    <div className="report-detail-body">
                      <div className="report-description">
                        <h4>{listing.description}</h4>
                        <p>{listing.negotiable ? "Price negotiable" : "Fixed price"} · Published listing details shown as reported.</p>
                      </div>

                      <dl className="report-facts">
                        {facts.map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{label === "Treatment" ? value.charAt(0).toUpperCase() + value.slice(1) : value}</dd>
                          </div>
                        ))}
                      </dl>

                      <div className="report-supporting-row">
                        <div className="report-support-pill">
                          <BadgeCheck size={17} strokeWidth={2} />
                          <span>{listing.media.some((m) => m.kind === "certificate") ? "Certificate provided" : "No certificate provided"}</span>
                        </div>
                        <div className="report-seller-pill">
                          <div className="avatar">{seller?.displayName.slice(0, 1) ?? "S"}</div>
                          <div>
                            <strong>{seller?.displayName ?? "Seller"}</strong>
                            <span>{sellerProfileLabel(seller?.verificationStatus)} · {listing.location}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {isExpanded && !listing && (
                  <div className="report-missing-listing">
                    This listing is no longer available in the marketplace snapshot.
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
