import { BadgeCheck, Check, ChevronLeft, ChevronRight, Download, Eye, EyeOff, Filter, Flag, MapPin, Phone, SlidersHorizontal, Star, X, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { createPortal } from "react-dom";
import type { MarketplaceSnapshot } from "@gems/api-client";
import { formatLkr, type CertificateStatus, type Listing, type MarketplacePageSize, type SellerProfile, type Treatment } from "@gems/schemas";
import { MultiSelectDropdown } from "../../shared/MultiSelectDropdown";
import { StatusState } from "../../shared/StatusState";
import { AdSenseUnit } from "../../shared/AdSenseUnit";
import { publicErrorMessage, formatTimeAgo, formatPostedDate } from "../../shared/helpers";
import type { SortKey } from "../../shared/types";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { MarketplaceSearch } from "./MarketplaceSearch";

export interface MarketplaceProps {
  gemTypes: MarketplaceSnapshot["gemTypes"];
  sellers: SellerProfile[];
  locations: string[];
  selectedLocations: string[];
  setSelectedLocations: (locations: string[]) => void;
  sourceListingCount: number;
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
  previewPhone?: string;
  revealedPhone?: string;
  previewPhoneNumber: (listingId: string) => Promise<string>;
  revealPhone: (listingId: string) => Promise<string>;
  isSignedIn: boolean;
  reportedListingIds: string[];
  onRefresh: () => void | Promise<void>;
  onReport: (listingId: string, reason: string, notes: string) => Promise<void>;
  onRecordInteraction: (listingId: string, type: "view" | "whatsapp_click") => Promise<void>;
  detailHeadingLevel?: 1 | 2;
}

export function Marketplace(props: MarketplaceProps) {
  const hasActiveDiscovery = Boolean(
    props.query.trim()
    || props.gemType !== "all"
    || props.treatment !== "all"
    || props.certificate !== "all"
    || props.selectedLocations.length
  );
  if (!props.selectedListing && props.sourceListingCount === 0 && !hasActiveDiscovery) {
    return <StatusState title="No listings available" message="Try refreshing once gemstone listings have been published." onRetry={props.onRefresh} headingLevel={2} />;
  }

  return (
    <section className="market-grid">
      <section className="feed marketplace-results-card card card--surface" aria-label="Gemstone listings">
        <header className="marketplace-results-header" role="search" aria-label="Search gemstone listings">
          <MarketplaceSearch id="marketplace-results-search-input" value={props.query} onChange={props.setQuery} className="marketplace-results-search" />
        </header>
        {props.filteredListings.length === 0 ? (
          <div className="empty-results">
            <h2>No matches found</h2>
            <p>Adjust your search or filters to browse the available listings.</p>
          </div>
        ) : (
          <div className="listing-list">
            {props.filteredListings.map((listing, index) => {
              const card = (
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
                    props.onRecordInteraction(listing.id, "view");
                  }}
                />
              );

              if (index > 0 && (index + 4) % 8 === 0) {
                return (
                  <Fragment key={`ad-${listing.id}`}>
                    {card}
                    <div className="feed-ad-container" style={{ gridColumn: "1 / -1", padding: "16px 0" }}>
                      <AdSenseUnit format="fluid" layoutKey="-gw-1+2a-9x+5y" slot="TODO_IN_FEED_SLOT_ID" />
                    </div>
                  </Fragment>
                );
              }
              return card;
            })}
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
              <button className="modal-close" onClick={() => props.setSelectedId("")}>
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <ListingDetail
              listing={props.selectedListing}
              gemTypes={props.gemTypes}
              sellers={props.sellers}
              previewPhone={props.previewPhone}
              revealedPhone={props.revealedPhone}
              onPreviewPhone={() => props.previewPhoneNumber(props.selectedListing!.id)}
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
  const hasImage = Boolean(listing.media[0]?.thumbnailUrl ?? listing.media[0]?.url);
  const [imageLoading, setImageLoading] = useState(hasImage);
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
        {imageLoading && (
          <div className="image-loading-overlay">
            <LoaderCircle className="icon-spinner" size={24} strokeWidth={2} />
          </div>
        )}
        <img className={imageLoading ? "loading" : ""} src={listing.media[0]?.thumbnailUrl ?? listing.media[0]?.url} alt={listing.media[0]?.alt ?? listing.title} style={gemImageStyle(listing.gemTypeId)} width={listing.media[0]?.width ?? 800} height={listing.media[0]?.height ?? 600} loading={eager ? "eager" : "lazy"} {...(priority ? { fetchpriority: "high" } : {})} onLoad={() => setImageLoading(false)} onError={() => setImageLoading(false)} ref={img => { if (img?.complete) setImageLoading(false); }} />
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

function maskPhoneNumber(phone?: string) {
  if (!phone) return phone;
  let visibleDigits = 0;
  return phone.replace(/\d/g, (digit) => {
    visibleDigits += 1;
    return visibleDigits <= 3 ? digit : "•";
  });
}

export type PhonePreviewState = "idle" | "loading" | "available" | "unavailable" | "error";

export function phonePreviewLabel(state: PhonePreviewState, phoneText: string, isLoading = false) {
  if (phoneText) return phoneText;
  if (state === "unavailable") return "Phone number not available";
  if (state === "error") return "Unable to load phone number";
  if (isLoading || state === "loading") return "Loading...";
  return "Phone number";
}

function ListingDetail({ listing, gemTypes, sellers, previewPhone, revealedPhone, onPreviewPhone, onReveal, isSignedIn, isReported, onReport, headingLevel }: { listing: Listing; gemTypes: MarketplaceSnapshot["gemTypes"]; sellers: SellerProfile[]; previewPhone?: string; revealedPhone?: string; onPreviewPhone: () => Promise<string>; onReveal: () => Promise<string>; isSignedIn: boolean; isReported: boolean; onReport: (listingId: string, reason: string, notes: string) => Promise<void>; headingLevel: 1 | 2; }) {
  const seller = sellers.find((item) => item.id === listing.sellerId);
  const gemType = gemTypes.find((item) => item.id === listing.gemTypeId);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isFullRevealLoading, setIsFullRevealLoading] = useState(false);
  const [fullPhoneVisible, setFullPhoneVisible] = useState(false);
  const [phonePreviewState, setPhonePreviewState] = useState<PhonePreviewState>(previewPhone ? "available" : "idle");
  const [reportReason, setReportReason] = useState("");
  const reportAction = useSingleFlightAction();
  const images = useMemo(() => listing.media.filter((media) => media.kind !== "certificate"), [listing.media]);
  const certificate = listing.media.find((media) => media.kind === "certificate");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const hasImage = Boolean(listing.media.filter((media) => media.kind !== "certificate")[0]?.url);
  const [imageLoading, setImageLoading] = useState(hasImage);
  const requestedPhoneListingId = useRef<string>();
  const attributes = getListingAttributes(listing, gemType?.name);

  useEffect(() => {
    setImageLoading(Boolean(images[currentImageIndex]?.url));
  }, [currentImageIndex, images]);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => setCurrentImageIndex((prev) => (prev + 1) % images.length), 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  const previewPhoneText = maskPhoneNumber(previewPhone);
  const phoneText = fullPhoneVisible && revealedPhone ? revealedPhone : previewPhoneText ?? "";

  useEffect(() => {
    requestedPhoneListingId.current = undefined;
    setFullPhoneVisible(false);
    setPhonePreviewState("idle");
  }, [listing.id]);

  useEffect(() => {
    if (revealedPhone) {
      setFullPhoneVisible(true);
      return;
    }
  }, [revealedPhone]);

  useEffect(() => {
    if (previewPhone || requestedPhoneListingId.current === listing.id) return;
    let active = true;
    requestedPhoneListingId.current = listing.id;
    setIsPreviewLoading(true);
    setPhonePreviewState("loading");
    Promise.resolve(onPreviewPhone())
      .then((phone) => {
        if (!active) return;
        setPhonePreviewState(phone.trim() ? "available" : "unavailable");
      })
      .catch((error) => {
        if (!active) return;
        requestedPhoneListingId.current = undefined;
        setPhonePreviewState("error");
        console.error("Unable to load phone number", error);
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listing.id, onPreviewPhone, previewPhone]);

  const handlePhoneToggle = async () => {
    if (revealedPhone) {
      setFullPhoneVisible((current) => !current);
      return;
    }
    if (isFullRevealLoading) return;
    try {
      setIsFullRevealLoading(true);
      const phone = await onReveal();
      setPhonePreviewState(phone.trim() ? "available" : "unavailable");
    } catch (error) {
      setPhonePreviewState("error");
      alert(`Unable to load phone number: ${publicErrorMessage(error, "Unknown error")}`);
    } finally {
      setIsFullRevealLoading(false);
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
        {imageLoading && (
          <div className="image-loading-overlay">
            <LoaderCircle className="icon-spinner" size={32} strokeWidth={2} />
          </div>
        )}
        <img className={`detail-image ${imageLoading ? "loading" : ""}`} src={images[currentImageIndex]?.url} alt={images[currentImageIndex]?.alt ?? listing.title} style={gemImageStyle(listing.gemTypeId)} onLoad={() => setImageLoading(false)} onError={() => setImageLoading(false)} ref={img => { if (img?.complete) setImageLoading(false); }} />
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
        <p className="listing-description">{listing.description}</p>
        <div className="spec-sections">
          {attributes.map((section) => (
            <div key={section.title} className="spec-section">
              <h3 className="spec-section-title">{section.title}</h3>
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
              <h3 className="spec-section-title">Certificate</h3>
              <div className="certificate-box certificate-row">
                <div className="certificate-label"><BadgeCheck size={17} strokeWidth={2} /><span>Gem Certificate is Provided</span></div>
                <a href={certificate.url} target="_blank" rel="noreferrer" className="primary-action btn-blue certificate-download"><Download size={14} />Download</a>
              </div>
            </div>
          )}
        </div>
        <div className="detail-ad-container" style={{ margin: "16px 0", minHeight: "100px" }}>
          <AdSenseUnit format="auto" slot="TODO_DISPLAY_SLOT_ID" />
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
            <div className={`phone-reveal${phoneText ? " has-number" : ""}`}>
              <Phone size={18} />
              <span className="phone-reveal-text" aria-live="polite">
                <span>{phonePreviewLabel(phonePreviewState, phoneText, isPreviewLoading)}</span>
              </span>
              {phonePreviewState !== "unavailable" && (
                <button
                  type="button"
                  className="phone-eye-action"
                  onClick={handlePhoneToggle}
                  disabled={isFullRevealLoading || (!phoneText && isPreviewLoading)}
                  aria-label={phonePreviewState === "error" ? "Retry loading phone number" : fullPhoneVisible && revealedPhone ? "Hide phone number" : "Show full phone number"}
                >
                  {isFullRevealLoading ? <LoaderCircle className="icon-spinner" size={18} /> : fullPhoneVisible && revealedPhone ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              )}
            </div>
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
              <div className="report-modal-actions"><button className="report-modal-cancel" type="button" onClick={() => setReportModalOpen(false)} disabled={reportAction.busy || isReporting}>Cancel</button><button type="submit" disabled={reportAction.busy || isReporting} className="primary-action btn-red report-modal-submit">{isReporting ? <LoaderCircle className="icon-spinner" size={16} /> : null} {isReporting ? "Submitting..." : "Submit Report"}</button></div>
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
    },
    {
      title: "Origin & Treatment",
      items: processGroup([
        ["Origin", listing.attributes.origin],
        ["Treatment", formatTreatment(listing.attributes.treatment)]
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
