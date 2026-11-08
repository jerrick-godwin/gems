import { BadgeCheck, Check, ChevronLeft, ChevronRight, Download, Filter, Flag, MapPin, Phone, SlidersHorizontal, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MarketplaceSnapshot } from "@gems/api-client";
import { formatLkr, type CertificateStatus, type Listing, type MarketplacePageSize, type SellerProfile, type Treatment } from "@gems/schemas";
import { MultiSelectDropdown } from "../../shared/MultiSelectDropdown";
import { StatusState } from "../../shared/StatusState";
import { publicErrorMessage, formatTimeAgo, formatPostedDate } from "../../shared/helpers";
import type { SortKey } from "../../shared/types";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { ClassicLoader } from "../../shared/ClassicLoader";
import { MarketplaceSearch } from "./MarketplaceSearch";

export interface MarketplaceProps {
  gemTypes: MarketplaceSnapshot["gemTypes"];
  sellers: SellerProfile[];
  locations: string[];
  selectedLocations: string[];
  setSelectedLocations: (locations: string[]) => void;
  sourceListingCount: number;
  resultCount: number;
  onClearFilters: () => void;
  lockedGemType?: boolean;
  filteredListings: Listing[];
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  pageSize?: MarketplacePageSize;
  setPageSize?: (pageSize: MarketplacePageSize) => void;
  pageHref?: (page: number) => string;
  selectedListing?: Listing;
  query: string;
  setQuery: (value: string) => void;
  gemType: string;
  setGemType: (value: string) => void;
  treatment: Treatment | "all";
  setTreatment: (value: Treatment | "all") => void;
  certificate: CertificateStatus | "all";
  setCertificate: (value: CertificateStatus | "all") => void;
  sort: SortKey;
  setSort: (value: SortKey) => void;
  selectedId: string;
  setSelectedId: (id: string) => void;
  revealedPhone?: string;
  revealPhone: (listingId: string) => Promise<string>;
  isSignedIn: boolean;
  reportedListingIds: string[];
  onRefresh: () => void | Promise<void>;
  onReport: (listingId: string, reason: string, notes: string) => Promise<void>;
  onRecordInteraction: (listingId: string, type: "view" | "whatsapp_click") => Promise<void>;
  detailHeadingLevel?: 1 | 2;
}

export function Marketplace(props: MarketplaceProps) {
  const filters = [
    ...(!props.lockedGemType && props.gemType !== "all" ? [{
      label: props.gemTypes.find((gem) => gem.id === props.gemType)?.name ?? "Gem type",
      remove: () => props.setGemType("all")
    }] : []),
    ...(props.treatment !== "all" ? [{ label: formatTreatment(props.treatment), remove: () => props.setTreatment("all") }] : []),
    ...(props.certificate !== "all" ? [{ label: certificateLabel(props.certificate), remove: () => props.setCertificate("all") }] : []),
    ...props.selectedLocations.map((location) => ({
      label: location,
      remove: () => props.setSelectedLocations(props.selectedLocations.filter((item) => item !== location))
    }))
  ];
  const hasActiveDiscovery = Boolean(props.query.trim() || filters.length);
  if (!props.selectedListing && props.sourceListingCount === 0 && !hasActiveDiscovery) {
    return <StatusState title="No listings available" message="Try refreshing once gemstone listings have been published." onRetry={props.onRefresh} headingLevel={2} />;
  }

  return (
    <section className="market-grid">
      <section className="feed marketplace-results-card card card--surface" aria-label="Gemstone listings">
        <div className="marketplace-results-header" role="search" aria-label="Search gemstone listings">
          <MarketplaceSearch id="marketplace-results-search-input" value={props.query} onChange={props.setQuery} className="marketplace-results-search" />
        </div>
        <div className="marketplace-result-tools">
          <p role="status">{props.resultCount} {props.resultCount === 1 ? "listing" : "listings"}</p>
          {filters.length > 0 && <div className="marketplace-active-filters" role="group" aria-label="Applied filters">
            {filters.map(({ label, remove }, index) => (
              <button key={`${index}-${label}`} className="subtle-action" type="button" onClick={remove} aria-label={`Remove ${label} filter`}>
                {label}<X size={14} aria-hidden="true" />
              </button>
            ))}
            {props.resultCount > 0 && <button className="subtle-action" type="button" onClick={props.onClearFilters}>Clear filters</button>}
          </div>}
        </div>
        {props.filteredListings.length === 0 ? (
          <div className="empty-results">
            <h2>No matches found</h2>
            <p>Adjust your search or filters to browse the available listings.</p>
            {filters.length > 0 && <button className="subtle-action" type="button" onClick={props.onClearFilters}>Clear filters</button>}
          </div>
        ) : (
          <div className="listing-list">
            {props.filteredListings.map((listing, index) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                gemTypes={props.gemTypes}
                sellers={props.sellers}
                selected={props.selectedId === listing.id}
                eager={index < 4}
                priority={index === 0}
                onSelect={() => {
                  props.setSelectedId(listing.id);
                  void props.onRecordInteraction(listing.id, "view");
                }}
              />
            ))}
          </div>
        )}
        {(props.totalPages > 1 || (props.pageSize && props.setPageSize)) && (
          <footer className="listing-results-footer">
            {props.totalPages > 1 && (
              <div className="pagination">
                <a
                  className="pagination-btn"
                  aria-disabled={props.page <= 1}
                  href={props.pageHref?.(props.page - 1) ?? "#"}
                  onClick={(event) => { event.preventDefault(); if (props.page > 1) props.setPage(props.page - 1); }}
                >
                  Previous
                </a>
                <span className="pagination-info">Page {props.page} of {props.totalPages}</span>
                <a
                  className="pagination-btn"
                  aria-disabled={props.page >= props.totalPages}
                  href={props.pageHref?.(props.page + 1) ?? "#"}
                  onClick={(event) => { event.preventDefault(); if (props.page < props.totalPages) props.setPage(props.page + 1); }}
                >
                  Next
                </a>
              </div>
            )}
            {props.pageSize && props.setPageSize && (
              <label className="listing-page-size">
                Items per page
                <select value={props.pageSize} onChange={(event) => props.setPageSize?.(Number(event.target.value) as MarketplacePageSize)} id="items-per-page">
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </label>
            )}
          </footer>
        )}
      </section>

      <aside className="filters card card--surface" aria-label="Gem filters">
        <label className="sort-control">
          <SlidersHorizontal size={16} strokeWidth={2} />
          Sort
          <select value={props.sort} onChange={(event) => props.setSort(event.target.value as SortKey)} id="sort-control">
            <option value="featured">Featured</option>
            <option value="newest">Latest to Oldest</option>
            <option value="oldest">Oldest to Latest</option>
            <option value="price-low">Price Low to High</option>
            <option value="price-high">Price High to Low</option>
          </select>
        </label>
        <div className="filter-section-title">
          <Filter size={17} strokeWidth={2} />
          Filters
        </div>
        <label>
          Gem type
          <select value={props.gemType} onChange={(event) => props.setGemType(event.target.value)} id="filter-gem-type">
            <option value="all">All gem types</option>
            {props.gemTypes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Treatment
          <select value={props.treatment} onChange={(event) => props.setTreatment(event.target.value as Treatment | "all")} id="filter-treatment">
            <option value="all">Any treatment</option>
            <option value="untreated">Untreated</option>
            <option value="heated">Heated</option>
            <option value="diffused">Diffused</option>
            <option value="filled">Filled</option>
          </select>
        </label>
        <label>
          Certification
          <select value={props.certificate} onChange={(event) => props.setCertificate(event.target.value as CertificateStatus | "all")} id="filter-certificate">
            <option value="all">Any certificate</option>
            <option value="admin_verified">Lab report on file</option>
            <option value="seller_provided">Seller lab report</option>
            <option value="none">No certificate</option>
          </select>
        </label>
        <label>
          Origin Country
          <MultiSelectDropdown id="marketplace-origin-options" options={props.locations} selected={props.selectedLocations} onChange={props.setSelectedLocations} placeholder="Worldwide" />
        </label>
      </aside>

      {props.selectedListing && (
        <div className="modal-overlay" onClick={() => props.setSelectedId("")}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-close-container">
              <button className="modal-close" aria-label="Close listing details" onClick={() => props.setSelectedId("")}>
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <ListingDetail
              key={props.selectedListing.id}
              listing={props.selectedListing}
              gemTypes={props.gemTypes}
              sellers={props.sellers}
              revealedPhone={props.revealedPhone}
              onReveal={() => props.revealPhone(props.selectedListing!.id)}
              isSignedIn={props.isSignedIn}
              isReported={props.reportedListingIds.includes(props.selectedListing.id)}
              onReport={props.onReport}
              headingLevel={props.detailHeadingLevel ?? 2}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ListingCard({ listing, gemTypes, sellers, selected, eager, priority, onSelect }: { listing: Listing; gemTypes: MarketplaceSnapshot["gemTypes"]; sellers: SellerProfile[]; selected: boolean; eager: boolean; priority: boolean; onSelect: () => void; }) {
  const image = listing.media.find((media) => media.kind === "photo");
  const seller = sellers.find((item) => item.id === listing.sellerId);
  const gemType = gemTypes.find((item) => item.id === listing.gemTypeId);
  const sellerRating = seller?.rating ?? 0;
  const summarySpecs = compactValues([
    `${listing.attributes.carat} ct`,
    listing.attributes.color,
    listing.attributes.shape,
    formatTreatment(listing.attributes.treatment)
  ]);

  return (
    <article className={`listing-card card card--media card--interactive${selected ? " selected" : ""}`} id={`listing-${listing.id}`}>
      <a className="listing-card-link" href={`/listings/${encodeURIComponent(listing.id)}`} onClick={(event) => { event.preventDefault(); onSelect(); }}>
      <div className="listing-media">
        {image && <img src={image.thumbnailUrl ?? image.url} alt={image.alt ?? listing.title} style={gemImageStyle(listing.gemTypeId)} width={image.width ?? 800} height={image.height ?? 600} loading={eager ? "eager" : "lazy"} {...(priority ? { fetchpriority: "high" } : {})} />}
        <div className="listing-badges">
          {listing.promoted.includes("top") && <span className="listing-badge listing-badge-top"><Star size={11} />Top</span>}
          {listing.promoted.includes("urgent") && <span className="listing-badge listing-badge-urgent">Urgent</span>}
        </div>
        {sellerRating > 0 && <div className="listing-rating">★ {sellerRating}</div>}
      </div>
      <div className="listing-content">
        <div className="listing-type">{gemType?.name ?? "Gemstone"}</div>
        <h2>{listing.title}</h2>
        <strong>{formatLkr(listing.priceLkr)}</strong>
        <div className="spec-row">
          {summarySpecs.map((spec) => (
            <span key={spec}>{spec}</span>
          ))}
        </div>
        <div className="seller-line">
          <span className="seller-location"><MapPin size={14} strokeWidth={2} />{listing.location}</span>
          {formatTimeAgo(listing.publishedAt || listing.createdAt) ? <span className="time-ago">{formatTimeAgo(listing.publishedAt || listing.createdAt)}</span> : null}
        </div>
      </div>
      </a>
    </article>
  );
}

function certificateLabel(status: CertificateStatus) {
  if (status === "admin_verified") return "Lab report on file";
  if (status === "seller_provided") return "Seller-provided lab report";
  return "No lab report";
}

export type PhonePreviewState = "idle" | "loading" | "available" | "unavailable" | "error";

export function phonePreviewLabel(state: PhonePreviewState, phoneText: string, isLoading = false) {
  if (phoneText) return phoneText;
  if (state === "unavailable") return "Phone number not available";
  if (state === "error") return "Unable to load phone number";
  if (isLoading || state === "loading") return "Loading...";
  return "Phone number";
}

function ListingDetail({ listing, gemTypes, sellers, revealedPhone, onReveal, isSignedIn, isReported, onReport, headingLevel }: { listing: Listing; gemTypes: MarketplaceSnapshot["gemTypes"]; sellers: SellerProfile[]; revealedPhone?: string; onReveal: () => Promise<string>; isSignedIn: boolean; isReported: boolean; onReport: (listingId: string, reason: string, notes: string) => Promise<void>; headingLevel: 1 | 2; }) {
  const seller = sellers.find((item) => item.id === listing.sellerId);
  const gemType = gemTypes.find((item) => item.id === listing.gemTypeId);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [phoneState, setPhoneState] = useState<PhonePreviewState>("idle");
  const [copyMessage, setCopyMessage] = useState("");
  const [reportReason, setReportReason] = useState("");
  const reportAction = useSingleFlightAction();
  const images = useMemo(() => listing.media.filter((media) => media.kind === "photo"), [listing.media]);
  const certificate = listing.media.find((media) => media.kind === "certificate");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const image = images[currentImageIndex];
  const attributes = getListingAttributes(listing, gemType?.name);
  const SpecHeading = headingLevel === 1 ? "h2" : "h3";
  const dialNumber = revealedPhone?.replace(/[^+0-9]/g, "");

  const revealSellerPhone = async () => {
    if (phoneState === "loading") return;
    setPhoneState("loading");
    try {
      setPhoneState((await onReveal()).trim() ? "available" : "unavailable");
    } catch {
      setPhoneState("error");
    }
  };

  const copySellerPhone = async () => {
    if (!revealedPhone) return;
    try {
      await navigator.clipboard.writeText(revealedPhone);
      setCopyMessage("Number copied.");
    } catch {
      setCopyMessage("Could not copy the number. You can select and copy it manually.");
    }
  };

  const handleReportClick = () => {
    if (!isSignedIn) {
      alert("Please sign in to report a listing.");
      return;
    }
    setReportModalOpen(true);
  };

  const handleReportSubmit = async (reason: string, notes: string) => {
    await reportAction.run(async () => {
      try {
        setIsReporting(true);
        await onReport(listing.id, reason, notes);
        setReportModalOpen(false);
        setReported(true);
      } catch (error) {
        alert(`Failed to report listing: ${publicErrorMessage(error, "Unknown error")}`);
      } finally {
        setIsReporting(false);
      }
    });
  };

  return (
    <article className="detail-card card card--media" id="listing-detail">
      <div className="detail-image-container">
        {image && <img className="detail-image" src={image.url} alt={image.alt ?? listing.title} style={gemImageStyle(listing.gemTypeId)} width={image.width ?? 800} height={image.height ?? 500} loading="eager" {...(currentImageIndex === 0 ? { fetchpriority: "high" } : {})} />}
        {images.length > 1 && <>
          <button
            className="carousel-nav prev"
            onClick={(event) => { event.stopPropagation(); setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1)); }}
            aria-label="Previous image"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="carousel-nav next"
            onClick={(event) => { event.stopPropagation(); setCurrentImageIndex((prev) => (prev + 1) % images.length); }}
            aria-label="Next image"
          >
            <ChevronRight size={20} />
          </button>
        </>}
      </div>
      <div className="detail-body">
        <div className="detail-title-row">{headingLevel === 1 ? <h1>{listing.title}</h1> : <h2>{listing.title}</h2>}<span>{formatLkr(listing.priceLkr)}</span></div>
        <dl className="listing-key-facts">
          <div><dt>Origin</dt><dd>{listing.attributes.origin || "Not disclosed"}</dd></div>
          <div><dt>Treatment</dt><dd>{formatTreatment(listing.attributes.treatment)}</dd></div>
          <div><dt>Lab report</dt><dd>{certificateLabel(listing.attributes.certificateStatus)}</dd></div>
        </dl>
        <div className="seller-contact-actions">
          {revealedPhone ? <>
            <span dir="ltr">{revealedPhone}</span>
            {dialNumber && <a className="primary-action" href={`tel:${dialNumber}`}><Phone size={16} aria-hidden="true" /> Call seller</a>}
            <button type="button" className="subtle-action" onClick={() => void copySellerPhone()}>Copy number</button>
          </> : phoneState !== "unavailable" && (
            <button type="button" className="primary-action" onClick={() => void revealSellerPhone()} disabled={phoneState === "loading"}>
              <Phone size={16} aria-hidden="true" /> {phoneState === "loading" ? "Loading phone number…" : phoneState === "error" ? "Retry seller phone number" : "Show seller phone number"}
            </button>
          )}
          <span role="status">{phoneState === "unavailable" || phoneState === "error" ? phonePreviewLabel(phoneState, "") : copyMessage}</span>
        </div>
        <p className="listing-description">{listing.description}</p>
        <div className="spec-sections">
          {attributes.map((section) => (
            <div key={section.title} className="spec-section">
              <SpecHeading className="spec-section-title">{section.title}</SpecHeading>
              <dl className="spec-grid">
                {section.items.map((attribute) => (
                  <div key={attribute.label}>
                    <dt>{attribute.label}</dt>
                    <dd>{attribute.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {certificate && (
            <div className="spec-section">
              <SpecHeading className="spec-section-title">Certificate</SpecHeading>
              <div className="certificate-box certificate-row">
                <div className="certificate-label"><BadgeCheck size={17} strokeWidth={2} /><span>{certificateLabel(listing.attributes.certificateStatus)}</span></div>
                <a href={certificate.url} target="_blank" rel="noreferrer" className="primary-action btn-blue certificate-download"><Download size={14} />Download</a>
              </div>
            </div>
          )}
        </div>
        <div className="listing-footer">
          <div className="seller-card sleek-seller">
            <div className="seller-badge-title">{sellerProfileLabel(seller?.verificationStatus)}</div>
            <div className="seller-card-content">
              <div className="avatar">{seller?.displayName.slice(0, 1)}</div>
              <div className="seller-info">
                <strong>{seller?.displayName}</strong>
                <span>
                  <MapPin size={12} /> {listing.location}
                </span>
              </div>
            </div>
          </div>
          <div className="sleek-actions">
            {isReported || reported ? (
              <button className="subtle-action reported-subtle" aria-label="Listing already reported"><Check size={14} strokeWidth={2.5} /> Listing Reported</button>
            ) : (
              <button className="subtle-action" id="report-listing" onClick={handleReportClick} aria-label="Report listing"><Flag size={14} strokeWidth={2} /> Report Listing</button>
            )}
          </div>
        </div>
      </div>
      {reportModalOpen && createPortal(
        <div className="modal-overlay report-modal-overlay" onClick={() => setReportModalOpen(false)}>
          <div className="modal-content report-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Report Listing</h3>
            <form className="post-form report-modal-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void handleReportSubmit(data.get("reason") as string, data.get("notes") as string); }}>
              <label>Reason for reporting *<select name="reason" required value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="">Select a reason...</option><option value="fake_certificate">Fake Certificate</option><option value="misrepresented_gem">Misrepresented Gem</option><option value="scam_attempt">Scam Attempt</option><option value="duplicate">Duplicate Listing</option><option value="wrong_details">Wrong Details</option><option value="abusive_seller">Abusive Seller</option><option value="other">Other</option></select></label>
              <label>{reportReason === "other" ? "Additional Notes *" : "Additional Notes (optional)"}<textarea name="notes" rows={4} placeholder="Please provide any additional details..." required={reportReason === "other"} /></label>
              <div className="report-modal-actions"><button className="report-modal-cancel" type="button" onClick={() => setReportModalOpen(false)} disabled={reportAction.busy || isReporting}>Cancel</button><button type="submit" disabled={reportAction.busy || isReporting} className="primary-action btn-red report-modal-submit">{isReporting ? <ClassicLoader className="icon-spinner" size={16} /> : null} {isReporting ? "Submitting..." : "Submit Report"}</button></div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </article>
  );
}

function sellerProfileLabel(status?: SellerProfile["verificationStatus"]) {
  if (status === "business_verified") return "Business profile";
  return "Seller profile";
}

type AttributeGroup = { title: string; items: { label: string; value: string }[] };

function getListingAttributes(listing: Listing, gemTypeName?: string): AttributeGroup[] {
  const processGroup = (group: Array<[string, string | undefined] | undefined>) =>
    group.filter(isDisplayAttribute).map(([label, value]) => ({ label, value }));

  return [
    {
      title: "General Information",
      items: processGroup([
        gemTypeName ? ["Gem type", gemTypeName] : undefined,
        ["Location", listing.location],
        ["Posted", formatPostedDate(listing.publishedAt || listing.createdAt) ?? undefined]
      ])
    },
    {
      title: "Gem Specifications",
      items: processGroup([
        ["Carat", `${listing.attributes.carat} ct`],
        ["Color", listing.attributes.color],
        ["Clarity", listing.attributes.clarity],
        ["Shape", listing.attributes.shape],
        ["Cut", listing.attributes.cut],
        ["Dimensions", listing.attributes.dimensions]
      ])
    }
  ].filter(group => group.items.length > 0);
}

function isDisplayAttribute(attribute: [string, string | undefined] | undefined): attribute is [string, string] {
  return Boolean(attribute && hasDisplayValue(attribute[1]));
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

function gemImageStyle(gemTypeId: string) {
  const objectPosition = gemTypeId ? "center" : "center";
  return { objectPosition };
}
