import { BadgeCheck, Check, ChevronLeft, ChevronRight, Download, EyeOff, Filter, Flag, Heart, MapPin, Minus, Phone, Plus, Search, ShoppingCart, SlidersHorizontal, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MarketplaceSnapshot } from "@gems/api-client";
import { formatLkr, type CertificateStatus, type Listing, type SellerProfile, type Treatment } from "@gems/schemas";
import { MultiSelectDropdown } from "../../shared/MultiSelectDropdown";
import { StatusState } from "../../shared/StatusState";
import type { SortKey } from "../../shared/types";

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
  revealPhone: (listingId: string) => void;
  savedIds: string[];
  toggleSaved: (id: string) => void;
  addToCart: (id: string, quantity: number) => void;
  isSignedIn: boolean;
  reportedListingIds: string[];
  onReport: (listingId: string, reason: string, notes: string) => Promise<void>;
}

export function Marketplace(props: MarketplaceProps) {
  if (!props.selectedListing && props.sourceListingCount === 0) {
    return <StatusState title="No listings available" message="Try refreshing once marketplace data has been published." />;
  }

  return (
    <section className="market-grid">
      <section className="feed">
        <div className="feed-header">
          <div>
            <h1>Explore Gems</h1>
            <p>{props.filteredListings.length} active listings with seller and lab details.</p>
          </div>
          <label className="sort-control">
            <SlidersHorizontal size={16} strokeWidth={2} />
            <select value={props.sort} onChange={(event) => props.setSort(event.target.value as SortKey)} id="sort-control">
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="price-low">Price Low to High</option>
              <option value="price-high">Price High to Low</option>
            </select>
          </label>
        </div>

        {props.filteredListings.length === 0 ? (
          <div className="empty-results">
            <h2>No matches found</h2>
            <p>Adjust your search or filters to browse the available listings.</p>
          </div>
        ) : (
          <>
            <div className="listing-list">
              {props.filteredListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  gemTypes={props.gemTypes}
                  sellers={props.sellers}
                  selected={props.selectedId === listing.id}
                  saved={props.savedIds.includes(listing.id)}
                  onSelect={() => props.setSelectedId(listing.id)}
                  onSave={() => props.toggleSaved(listing.id)}
                />
              ))}
            </div>
            {props.totalPages > 1 && (
              <div className="pagination" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 32 }}>
                <button disabled={props.page <= 1} onClick={() => props.setPage(props.page - 1)} style={{ padding: "8px 16px", borderRadius: "var(--radius)", background: props.page <= 1 ? "var(--line-subtle)" : "var(--ink)", color: props.page <= 1 ? "var(--sage)" : "#fff", border: "none", cursor: props.page <= 1 ? "not-allowed" : "pointer" }}>Previous</button>
                <div style={{ display: "flex", alignItems: "center", fontWeight: 600 }}>Page {props.page} of {props.totalPages}</div>
                <button disabled={props.page >= props.totalPages} onClick={() => props.setPage(props.page + 1)} style={{ padding: "8px 16px", borderRadius: "var(--radius)", background: props.page >= props.totalPages ? "var(--line-subtle)" : "var(--ink)", color: props.page >= props.totalPages ? "var(--sage)" : "#fff", border: "none", cursor: props.page >= props.totalPages ? "not-allowed" : "pointer" }}>Next</button>
              </div>
            )}
          </>
        )}
      </section>

      <aside className="filters" aria-label="Gem filters">
        <div className="global-search" style={{ gridColumn: "1 / -1", marginBottom: 12 }}>
          <Search size={17} strokeWidth={2} />
          <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search Gems" id="global-search-input" />
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
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
          <MultiSelectDropdown options={props.locations} selected={props.selectedLocations} onChange={props.setSelectedLocations} placeholder="Worldwide" />
        </label>
      </aside>

      {props.selectedListing && (
        <div className="modal-overlay" onClick={() => props.setSelectedId("")}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => props.setSelectedId("")}>
              <X size={18} strokeWidth={2.5} />
            </button>
            <ListingDetail
              listing={props.selectedListing}
              gemTypes={props.gemTypes}
              sellers={props.sellers}
              revealedPhone={props.revealedPhone}
              onReveal={() => props.revealPhone(props.selectedListing!.id)}
              onAddCart={(quantity) => props.addToCart(props.selectedListing!.id, quantity)}
              isSignedIn={props.isSignedIn}
              isReported={props.reportedListingIds.includes(props.selectedListing.id)}
              onReport={props.onReport}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ListingCard({ listing, gemTypes, sellers, selected, saved, onSelect, onSave }: { listing: Listing; gemTypes: MarketplaceSnapshot["gemTypes"]; sellers: SellerProfile[]; selected: boolean; saved: boolean; onSelect: () => void; onSave: () => void; }) {
  const seller = sellers.find((item) => item.id === listing.sellerId);
  const gemType = gemTypes.find((item) => item.id === listing.gemTypeId);
  const sellerRating = seller?.rating ?? 0;

  return (
    <article className={`listing-card ${selected ? "selected" : ""}`} onClick={onSelect} id={`listing-${listing.id}`}>
      <div className="listing-media">
        <img src={listing.media[0]?.url} alt={listing.media[0]?.alt ?? listing.title} style={gemImageStyle(listing.gemTypeId)} />
        <div className="listing-badges">
          {listing.promoted.includes("top") && <span className="listing-badge listing-badge-top"><Star size={11} />Top</span>}
          {listing.promoted.includes("urgent") && <span className="listing-badge listing-badge-urgent">Urgent</span>}
        </div>
        {sellerRating > 0 && <div className="listing-rating">★ {sellerRating}</div>}
        <button type="button" className={`save-button ${saved ? "saved" : ""}`} onClick={(event) => { event.stopPropagation(); onSave(); }} aria-label={saved ? "Remove saved listing" : "Save listing"} id={`save-${listing.id}`}>
          <Heart size={17} fill={saved ? "currentColor" : "none"} strokeWidth={2} />
        </button>
      </div>
      <div className="listing-content">
        <div className="listing-type">{gemType?.name ?? "Gemstone"}</div>
        <h2>{listing.title}</h2>
        <strong>{formatLkr(listing.priceLkr)}</strong>
        <div className="spec-row">
          <span>{listing.attributes.carat} ct</span>
          <span>{listing.attributes.color}</span>
          <span>{listing.attributes.shape}</span>
          <span>{formatTreatment(listing.attributes.treatment)}</span>
        </div>
        <div className="seller-line"><MapPin size={14} strokeWidth={2} />Country: {listing.location}</div>
      </div>
    </article>
  );
}

function ListingDetail({ listing, gemTypes, sellers, revealedPhone, onReveal, onAddCart, isSignedIn, isReported, onReport }: { listing: Listing; gemTypes: MarketplaceSnapshot["gemTypes"]; sellers: SellerProfile[]; revealedPhone?: string; onReveal: () => void; onAddCart: (qty: number) => void; isSignedIn: boolean; isReported: boolean; onReport: (listingId: string, reason: string, notes: string) => Promise<void>; }) {
  const seller = sellers.find((item) => item.id === listing.sellerId);
  const gemType = gemTypes.find((item) => item.id === listing.gemTypeId);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [phoneHidden, setPhoneHidden] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const images = useMemo(() => listing.media.filter((media) => media.kind !== "certificate"), [listing.media]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const attributes = getListingAttributes(listing, gemType?.name);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => setCurrentImageIndex((prev) => (prev + 1) % images.length), 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  const handleAddCart = () => {
    onAddCart(qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  };

  const handleReportClick = () => {
    if (!isSignedIn) {
      alert("Please sign in to report a listing.");
      return;
    }
    setReportModalOpen(true);
  };

  const handleReportSubmit = async (reason: string, notes: string) => {
    try {
      setIsReporting(true);
      await onReport(listing.id, reason, notes);
      setReportModalOpen(false);
      setReported(true);
    } catch (error) {
      alert("Failed to report listing: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <article className="detail-card" id="listing-detail">
      <div className="detail-image-container" style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: "var(--radius-lg) var(--radius-lg) 0 0" }}>
        <img className="detail-image" src={images[currentImageIndex]?.url} alt={images[currentImageIndex]?.alt ?? listing.title} style={gemImageStyle(listing.gemTypeId)} />
        {images.length > 1 && <>
          <button onClick={(event) => { event.stopPropagation(); setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1)); }} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 10 }}><ChevronLeft size={20} /></button>
          <button onClick={(event) => { event.stopPropagation(); setCurrentImageIndex((prev) => (prev + 1) % images.length); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 10 }}><ChevronRight size={20} /></button>
        </>}
      </div>
      <div className="detail-body">
        <div className="detail-title-row"><h2>{listing.title}</h2><span>{formatLkr(listing.priceLkr)}</span></div>
        <p style={{ fontSize: 14, lineHeight: 1.6, fontWeight: 500 }}>{listing.description}</p>
        <dl className="spec-grid">
          {attributes.map((attribute) => (
            <div key={attribute.label}>
              <dt>{attribute.label}</dt>
              <dd>{attribute.value}</dd>
            </div>
          ))}
        </dl>
        <div className="certificate-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><BadgeCheck size={17} strokeWidth={2} /><span>{listing.media.some((media) => media.kind === "certificate") ? "Gem Certificate is Provided" : "Certificate not Provided"}</span></div>
          {listing.media.some((media) => media.kind === "certificate") && <a href={listing.media.find((media) => media.kind === "certificate")?.url} target="_blank" rel="noreferrer" className="primary-action btn-blue" style={{ padding: "4px 12px", fontSize: 13, height: "auto", minHeight: 32, borderRadius: 6, textDecoration: "none" }}><Download size={14} style={{ marginRight: 4 }} />Download</a>}
        </div>
        <div className="seller-card"><div className="avatar">{seller?.displayName.slice(0, 1)}</div><div><strong style={{ fontWeight: 700 }}>{seller?.displayName}</strong><span style={{ display: "flex", alignItems: "center", gap: 4 }}>{sellerProfileLabel(seller?.verificationStatus)} · <MapPin size={12} /> {listing.location}</span></div></div>
        <div className="cart-action-row">
          <div className="qty-stepper"><button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={16} strokeWidth={2.5} /></button><span>{qty}</span><button type="button" onClick={() => setQty(qty + 1)} aria-label="Increase quantity"><Plus size={16} strokeWidth={2.5} /></button></div>
          <button className="primary-action btn-add-cart" onClick={handleAddCart} style={{ flex: "1 1 180px" }}>{added ? <Check size={18} /> : <ShoppingCart size={18} />}{added ? "" : "Add to Cart"}</button>
          {revealedPhone && !phoneHidden ? <div className="phone-action-group"><button className="primary-action btn-blue phone-number-action" style={{ cursor: "default" }}><Phone size={18} />{revealedPhone}</button><button className="primary-action btn-blue phone-hide-action" onClick={() => setPhoneHidden(true)} aria-label="Hide phone number"><EyeOff size={18} /></button></div> : <button className="primary-action btn-blue" onClick={() => { if (revealedPhone) setPhoneHidden(false); else onReveal(); }} style={{ flex: "1 1 180px" }}><Phone size={18} />{isSignedIn ? "Show Phone Number" : "Sign in to view"}</button>}
          {isReported || reported ? <div className="primary-action" aria-label="Listing already reported" style={{ flex: "1 1 120px", background: "var(--line-subtle)", color: "var(--sage)", cursor: "default" }}><Check size={16} strokeWidth={2.5} />Reported</div> : <button className="primary-action btn-red" id="report-listing" onClick={handleReportClick} aria-label="Report listing" style={{ flex: "1 1 120px" }}><Flag size={16} strokeWidth={2} />Report</button>}
        </div>
      </div>
      {reportModalOpen && createPortal(
        <div className="modal-overlay" onClick={() => setReportModalOpen(false)} style={{ zIndex: 10000 }}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 420, width: "100%", padding: 24, borderRadius: "var(--radius-lg)" }}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: 22, fontWeight: 800 }}>Report Listing</h3>
            <form className="post-form" style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void handleReportSubmit(data.get("reason") as string, data.get("notes") as string); }}>
              <label>Reason for reporting *<select name="reason" required value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="">Select a reason...</option><option value="fake_certificate">Fake Certificate</option><option value="misrepresented_gem">Misrepresented Gem</option><option value="scam_attempt">Scam Attempt</option><option value="duplicate">Duplicate Listing</option><option value="wrong_details">Wrong Details</option><option value="abusive_seller">Abusive Seller</option><option value="other">Other</option></select></label>
              <label>{reportReason === "other" ? "Additional Notes *" : "Additional Notes (optional)"}<textarea name="notes" rows={4} placeholder="Please provide any additional details..." required={reportReason === "other"} /></label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}><button type="button" onClick={() => setReportModalOpen(false)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 40, padding: "0 16px", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "transparent", color: "var(--ink)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button><button type="submit" disabled={isReporting} className="primary-action btn-red" style={{ flex: "none", width: "auto", padding: "0 16px", cursor: "pointer" }}>{isReporting ? "Submitting..." : "Submit Report"}</button></div>
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
  if (status === "identity_verified") return "Seller profile";
  return "Seller profile";
}

function getListingAttributes(listing: Listing, gemTypeName?: string) {
  const attributes = [
    gemTypeName ? ["Gem type", gemTypeName] : undefined,
    ["Location", listing.location],
    ["Carat", `${listing.attributes.carat} ct`],
    ["Dimensions", listing.attributes.dimensions],
    ["Shape", listing.attributes.shape],
    ["Cut", listing.attributes.cut],
    ["Color", listing.attributes.color],
    ["Clarity", listing.attributes.clarity],
    ["Origin", listing.attributes.origin],
    ["Treatment", formatTreatment(listing.attributes.treatment)]
  ].filter(Boolean) as [string, string][];

  return attributes.map(([label, value]) => ({
    label,
    value
  }));
}

function formatTreatment(treatment: Treatment) {
  return treatment.charAt(0).toUpperCase() + treatment.slice(1);
}

function gemImageStyle(gemTypeId: string) {
  const objectPosition = gemTypeId ? "center" : "center";
  return { objectPosition };
}
