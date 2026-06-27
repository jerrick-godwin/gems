import { Camera, Check, ChevronRight, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { GemsApiClient, type MarketplaceSnapshot } from "@gems/api-client";
import { formatLkr, quoteListingSubscription, type ListingMedia, type Treatment, type UserDashboard, type ListingSubscriptionPlan } from "@gems/schemas";
import { createIdempotencyKey, useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { formatPriceInput, parsePriceInput, isUploadableUrl } from "../../shared/helpers";





export function PostGem({
  gemTypes,
  locations,
  subscriptionPlans,
  api,
  onDashboardChange
}: {
  gemTypes: MarketplaceSnapshot["gemTypes"];
  locations: string[];
  subscriptionPlans: ListingSubscriptionPlan[];
  api: GemsApiClient;
  onDashboardChange: (dashboard: UserDashboard) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [certificate, setCertificateFile] = useState<File | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>("pro");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const photosInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);
  const submitAction = useSingleFlightAction();
  const activePlan = subscriptionPlans.find(p => p.id === selectedPlan) || subscriptionPlans[0];
  const quote = quoteListingSubscription(activePlan, photos.length);
  const isSubmitting = submitAction.busy || status === "Creating listing draft..." || status === "Uploading media..." || status === "Creating payment...";

  const handlePriceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPriceInput(formatPriceInput(event.target.value));
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    
    const MAX_SIZE = 2 * 1024 * 1024;
    const newFiles = Array.from(files);
    
    for (const file of newFiles) {
      if (file.size > MAX_SIZE) {
        setStatus(`Image "${file.name}" exceeds the 2MB limit.`);
        return;
      }
    }

    setPhotos((prev) => {
      const combined = [...prev, ...newFiles];
      if (combined.length > 15) {
        setStatus("You can upload a maximum of 15 gem photos.");
        return combined.slice(0, 15);
      }
      setStatus(null);
      return combined;
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    if (photosInputRef.current) photosInputRef.current.value = "";
  };

  const removeCertificate = () => {
    setCertificateFile(null);
    if (certInputRef.current) certInputRef.current.value = "";
  };

  const handleClear = () => {
    setPhotos([]);
    setCertificateFile(null);
    setPriceInput("");
    setStatus(null);
    if (photosInputRef.current) photosInputRef.current.value = "";
    if (certInputRef.current) certInputRef.current.value = "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = (id: string) => (form.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? "";

    if (photos.length === 0) {
      setStatus("Please add at least one gem photo.");
      return;
    }
    if (!acceptedPolicies) {
      setStatus("Please accept the Terms and Conditions and Privacy Policy before payment.");
      return;
    }

    await submitAction.run(async () => {
      const submissionKey = createIdempotencyKey("post-gem");
      try {
        setStatus("Creating listing draft...");
        const listing = await api.createListing({
          title: value("post-title"),
          gemTypeId: value("post-gem-type"),
          description: value("post-description"),
          priceLkr: parsePriceInput(value("post-price")),
          location: value("post-location") || "Sri Lanka",
          attributes: {
            carat: Number(value("post-carat") || 0),
            shape: value("post-shape"),
            color: value("post-color"),
            treatment: value("post-treatment") as Treatment,
            dimensions: value("post-dimensions"),
            cut: value("post-cut"),
            clarity: value("post-clarity"),
            origin: value("post-origin"),
            certificateStatus: certificate ? "seller_provided" : "none"
          }
        }, { idempotencyKey: `${submissionKey}:listing` });

        setStatus("Uploading media...");
        const uploadedMedia: ListingMedia[] = [];
        let order = 0;
        for (const file of photos) {
          const target = await api.createStorageUpload({
            scope: "listing-media",
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            listingId: listing.id
          });
          
          if (isUploadableUrl(target.uploadUrl)) {
            await fetch(target.uploadUrl, {
              method: "PUT",
              body: file,
              headers: {
                "Content-Type": file.type || "application/octet-stream",
                "x-ms-blob-type": "BlockBlob"
              }
            });
          }
          
          uploadedMedia.push({
            id: target.blobKey,
            listingId: listing.id,
            kind: "photo",
            url: target.readUrl || target.uploadUrl,
            alt: file.name,
            order: order++,
            moderationStatus: "not_submitted"
          });
        }

        if (certificate) {
          const target = await api.createStorageUpload({
            scope: "listing-certificate",
            fileName: certificate.name,
            contentType: certificate.type || "application/pdf",
            listingId: listing.id
          });
          
          if (isUploadableUrl(target.uploadUrl)) {
            await fetch(target.uploadUrl, {
              method: "PUT",
              body: certificate,
              headers: {
                "Content-Type": certificate.type || "application/pdf",
                "x-ms-blob-type": "BlockBlob"
              }
            });
          }
          
          uploadedMedia.push({
            id: target.blobKey,
            listingId: listing.id,
            kind: "certificate",
            url: target.readUrl || target.uploadUrl,
            alt: certificate.name,
            order: 0,
            moderationStatus: "not_submitted"
          });
        }

        if (uploadedMedia.length > 0) {
          await api.updateMyListing(listing.id, { media: uploadedMedia });
        }

        setStatus("Creating payment...");
        const paymentIntent = await api.createListingPaymentIntent(listing.id, {
          planId: selectedPlan,
          photoCount: photos.length,
          acceptedPolicies
        }, { idempotencyKey: `${submissionKey}:payment` });

        onDashboardChange(await api.dashboard());
        form.reset();
        handleClear();
        if (paymentIntent.paymentUrl) {
          window.location.href = paymentIntent.paymentUrl;
          return;
        }
        setStatus("Payment intent created. Please contact support if you are not redirected to checkout.");
        submitAction.release();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to submit listing.");
        submitAction.release();
      }
    }, { keepLocked: true });
  };

  return (
    <section className="workspace-grid">
      <div className="workspace-main">
        <div className="section-heading">
          <h1>Post a Gem Listing</h1>
          <p>Build a clear listing for moderation. Complete each section for faster approval.</p>
        </div>
        <form className="post-form" id="post-gem-form" onSubmit={handleSubmit} onReset={handleClear}>
          <label>
            Listing title
            <input placeholder="Ceylon Blue Sapphire" id="post-title" required disabled={isSubmitting} />
          </label>
          <label>
            Gem type
            <select defaultValue="" id="post-gem-type" required disabled={isSubmitting}>
              <option value="" disabled>
                Select Gem Type
              </option>
              {gemTypes.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea placeholder="Color, clarity, treatment, inspection notes." id="post-description" required disabled={isSubmitting} />
          </label>

          <section className="form-section" aria-labelledby="listing-plan-heading">
            <div className="form-section-header">
              <h2 id="listing-plan-heading">Listing Subscription</h2>
            </div>
            <div className="plan-grid">
              {subscriptionPlans.map((plan) => {
                const isSelected = selectedPlan === plan.id;

                return (
                  <label className={`plan-option plan-option-${plan.id} ${isSelected ? "selected" : ""}`} key={plan.id}>
                    <input type="radio" name="listing-plan" value={plan.id} checked={isSelected} onChange={() => setSelectedPlan(plan.id)} disabled={isSubmitting} />
                    <span className="plan-option-check" aria-hidden="true">
                      <Check size={15} strokeWidth={3} />
                    </span>
                    <span className="plan-option-eyebrow">{plan.eyebrow}</span>
                    <strong>{plan.name}</strong>
                    <span className="plan-option-price">{formatLkr(plan.priceLkr)}</span>
                    <small className="plan-option-summary">{plan.summary}</small>
                    <span className="plan-feature">
                      <Check size={15} strokeWidth={2.6} />
                      {plan.includedPhotos} photos included
                    </span>
                    <span className="plan-feature">
                      <Check size={15} strokeWidth={2.6} />
                      {plan.validityMonths} month{plan.validityMonths > 1 ? "s" : ""} of advertisement validity
                    </span>
                    <span className="plan-extra">Extra photos: {formatLkr(plan.extraPhotoPriceLkr)} each</span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* ── Media uploads ── */}
          <div className="upload-section">
            <div className="upload-section-header">
              <span className="upload-section-title">Gem Photos <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span></span>
              <button
                type="button"
                className="upload-trigger"
                disabled={isSubmitting}
                onClick={() => photosInputRef.current?.click()}
              >
                <Camera size={16} strokeWidth={2} />
                Add photos
              </button>
              <input
                ref={photosInputRef}
                type="file"
                accept="image/*"
                multiple
                disabled={isSubmitting}
                onChange={(e) => addPhotos(e.target.files)}
                style={{ display: 'none' }}
              />
            </div>
            {photos.length > 0 ? (
              <div className="upload-previews">
                {photos.map((file, index) => (
                  <div className="upload-preview-item" key={`${file.name}-${index}`}>
                    <img src={URL.createObjectURL(file)} alt={file.name} />
                    <button
                      type="button"
                      className="upload-remove"
                      disabled={isSubmitting}
                      onClick={() => removePhoto(index)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                    <span className="upload-filename">{file.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="upload-dropzone"
                onClick={() => { if (!isSubmitting) photosInputRef.current?.click(); }}
              >
                <Camera size={24} strokeWidth={1.5} style={{ color: 'var(--sage)' }} />
                <span>Click to add gem photos</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>JPG, PNG — at least one required</span>
              </div>
            )}
          </div>

          <div className="upload-section">
            <div className="upload-section-header">
              <span className="upload-section-title">Certificate</span>
              {!certificate && (
                <button
                  type="button"
                  className="upload-trigger"
                  disabled={isSubmitting}
                  onClick={() => certInputRef.current?.click()}
                >
                  <Upload size={16} strokeWidth={2} />
                  Upload
                </button>
              )}
              <input
                ref={certInputRef}
                type="file"
                accept=".pdf,image/*"
                disabled={isSubmitting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size > 2 * 1024 * 1024) {
                    setStatus(`Certificate "${file.name}" exceeds the 2MB limit.`);
                    return;
                  }
                  setCertificateFile(file ?? null);
                  setStatus(null);
                }}
                style={{ display: 'none' }}
              />
            </div>
            {certificate ? (
              <div className="upload-previews">
                <div className="upload-preview-item cert">
                  {certificate.type.startsWith('image/') ? (
                    <img src={URL.createObjectURL(certificate)} alt={certificate.name} />
                  ) : (
                    <div className="cert-icon">
                      <Upload size={20} strokeWidth={1.5} />
                      <span>PDF</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="upload-remove"
                    disabled={isSubmitting}
                    onClick={removeCertificate}
                    aria-label="Remove certificate"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                  <span className="upload-filename">{certificate.name}</span>
                </div>
              </div>
            ) : (
              <div
                className="upload-dropzone"
                onClick={() => { if (!isSubmitting) certInputRef.current?.click(); }}
                style={{ minHeight: 64 }}
              >
                <Upload size={20} strokeWidth={1.5} style={{ color: 'var(--sage)' }} />
                <span style={{ fontSize: 12 }}>Optional — PDF or image</span>
              </div>
            )}
          </div>

          <section className="form-section" aria-labelledby="gem-details-heading">
            <div className="form-section-header">
              <h2 id="gem-details-heading">Gem Details</h2>
            </div>
            <div className="form-grid">
              <label>
                <span className="field-label">Price (LKR)<span className="required-marker" aria-hidden="true">*</span></span>
                <input placeholder="3,250,000" id="post-price" inputMode="numeric" value={priceInput} onChange={handlePriceChange} required disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Location<span className="required-marker" aria-hidden="true">*</span></span>
                <select defaultValue="" id="post-location" required disabled={isSubmitting}>
                  <option value="" disabled>
                    Select location
                  </option>
                  {locations.map((loc) => (
                    <option value={loc} key={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Carat<span className="required-marker" aria-hidden="true">*</span></span>
                <input placeholder="3.42" id="post-carat" required disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Dimensions</span>
                <input placeholder="9.2 x 7.1 x 4.8 mm" id="post-dimensions" disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Shape</span>
                <input placeholder="Oval" id="post-shape" disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Cut</span>
                <input placeholder="Mixed brilliant" id="post-cut" disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Color<span className="required-marker" aria-hidden="true">*</span></span>
                <input placeholder="Royal blue" id="post-color" required disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Clarity<span className="required-marker" aria-hidden="true">*</span></span>
                <input placeholder="Eye clean" id="post-clarity" required disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Origin<span className="required-marker" aria-hidden="true">*</span></span>
                <input placeholder="Ratnapura" id="post-origin" required disabled={isSubmitting} />
              </label>
              <label>
                <span className="field-label">Treatment<span className="required-marker" aria-hidden="true">*</span></span>
                <select defaultValue="" id="post-treatment" required disabled={isSubmitting}>
                  <option value="" disabled>
                    Select treatment
                  </option>
                  <option value="untreated">Untreated</option>
                  <option value="heated">Heated</option>
                </select>
              </label>
            </div>
          </section>

          <section className="form-section order-summary-section" aria-labelledby="order-summary-heading">
            <div className="form-section-header">
              <h2 id="order-summary-heading">Order Summary</h2>
            </div>
            <div className="order-summary-card">
              <table className="order-summary-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="align-right">Amount (LKR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="item-title">
                        <span className="item-badge package">Package</span>
                        <strong>{quote.plan.name} Plan</strong>
                      </div>
                      <div className="item-desc">
                        {quote.plan.validityMonths} month{quote.plan.validityMonths > 1 ? "s" : ""} of advertisement validity
                        <br />
                        Includes up to {quote.plan.includedPhotos} photos
                      </div>
                    </td>
                    <td className="align-right amount-cell">
                      {quote.basePriceLkr.toLocaleString("en-US")}
                    </td>
                  </tr>
                  
                  <tr>
                    <td>
                      <div className="item-title">
                        <span className="item-badge additional">Additional</span>
                        <strong>Extra Photos</strong>
                      </div>
                      <div className="item-desc">
                        {quote.extraPhotoCount > 0 
                          ? `${quote.extraPhotoCount} extra photo${quote.extraPhotoCount > 1 ? "s" : ""} × ${quote.plan.extraPhotoPriceLkr.toLocaleString("en-US")} each`
                          : `${photos.length} of ${quote.plan.includedPhotos} included photos used`
                        }
                      </div>
                    </td>
                    <td className="align-right amount-cell">
                      {quote.extraPhotoTotalLkr > 0 ? quote.extraPhotoTotalLkr.toLocaleString("en-US") : "0"}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>
                      <div className="total-row">
                        <span className="total-label">Total Due: </span>
                        <span className="total-amount">{quote.totalLkr.toLocaleString("en-US")}</span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ── Actions ── */}
          <label className="policy-acceptance">
            <input type="checkbox" checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)} disabled={isSubmitting} />
            <span>
              I accept the{" "}
              <a href="/terms-and-conditions" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                Terms and Conditions
              </a>
              {" "}and{" "}
              <a href="/privacy-policy" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                Privacy Policy
              </a>
            </span>
          </label>
          {status && !["Listing submitted for moderation.", "Creating listing draft...", "Uploading media...", "Creating payment..."].includes(status) && (
            <p style={{ color: "var(--danger)", fontWeight: 600, marginTop: 16, marginBottom: 16, textAlign: "center" }}>
              {status}
            </p>
          )}
          <div className="post-actions">
            <button 
              type="submit" 
              className="primary-action" 
              id="submit-listing"
              disabled={isSubmitting}
            >
              {status === "Listing submitted for moderation." ? (
                <Check size={18} strokeWidth={2.5} />
              ) : isSubmitting ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  <span>{status}</span>
                </>
              ) : (
                <>
                  Proceed to Payment
                  <ChevronRight size={17} strokeWidth={2.2} />
                </>
              )}
            </button>
            <button type="reset" className="clear-action" id="clear-listing" disabled={isSubmitting}>
              <Trash2 size={17} strokeWidth={2.2} />
              Clear
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}


