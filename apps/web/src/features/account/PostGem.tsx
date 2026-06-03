import { Camera, Check, CheckCircle2, ChevronRight, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { GemsApiClient, type MarketplaceSnapshot } from "@gems/api-client";
import type { ListingMedia, Treatment } from "@gems/schemas";

export function PostGem({ gemTypes, locations, api }: { gemTypes: MarketplaceSnapshot["gemTypes"]; locations: string[]; api: GemsApiClient }) {
  const [status, setStatus] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [certificate, setCertificateFile] = useState<File | null>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

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
      if (combined.length > 5) {
        setStatus("You can upload a maximum of 5 gem photos.");
        return combined.slice(0, 5);
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

    setStatus("Submitting listing for moderation...");
    try {
      const listing = await api.createListing({
        title: value("post-title"),
        gemTypeId: value("post-gem-type"),
        description: value("post-description"),
        priceLkr: Number(value("post-price") || 0),
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
      });

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

      form.reset();
      handleClear();
      setStatus("Listing submitted for moderation.");
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to submit listing.");
    }
  };

  return (
    <section className="workspace-grid">
      <aside className="workspace-side">
        <h2>Checklist</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "-4px 0 12px", fontWeight: 500 }}>
          Complete all items for faster moderation approval.
        </p>
        {["Clear face-up photo", "Accurate carat and dimensions", "Treatment stated", "Certificate readable", "No prohibited payment claims"].map((item) => (
          <div className="check-row" key={item}>
            <CheckCircle2 size={15} strokeWidth={2} />
            {item}
          </div>
        ))}
      </aside>
      <div className="workspace-main">
        <div className="section-heading">
          <h1>Post a Gem Listing</h1>
          <p>Build a clear listing for moderation. Complete each section for faster approval.</p>
        </div>
        <form className="post-form" id="post-gem-form" onSubmit={handleSubmit} onReset={handleClear}>
          <label>
            Listing title
            <input placeholder="Ceylon Blue Sapphire" id="post-title" required />
          </label>
          <label>
            Gem type
            <select defaultValue="" id="post-gem-type" required>
              <option value="" disabled>
                Select gem type
              </option>
              {gemTypes.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Price (LKR)
              <input placeholder="3250000" id="post-price" inputMode="numeric" required />
            </label>
            <label>
              Location
              <select defaultValue="" id="post-location" required>
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
              Carat
              <input placeholder="3.42" id="post-carat" required />
            </label>
            <label>
              Dimensions
              <input placeholder="9.2 x 7.1 x 4.8 mm" id="post-dimensions" required />
            </label>
            <label>
              Shape
              <input placeholder="Oval" id="post-shape" required />
            </label>
            <label>
              Cut
              <input placeholder="Mixed brilliant" id="post-cut" required />
            </label>
            <label>
              Color
              <input placeholder="Royal blue" id="post-color" required />
            </label>
            <label>
              Clarity
              <input placeholder="Eye clean" id="post-clarity" required />
            </label>
            <label>
              Origin
              <input placeholder="Ratnapura" id="post-origin" required />
            </label>
            <label>
              Treatment
              <select defaultValue="" id="post-treatment" required>
                <option value="" disabled>
                  Select treatment
                </option>
                <option value="untreated">Untreated</option>
                <option value="heated">Heated</option>
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea placeholder="Color, clarity, treatment, inspection notes." id="post-description" required />
          </label>

          {/* ── Media uploads ── */}
          <div className="upload-section">
            <div className="upload-section-header">
              <span className="upload-section-title">Gem Photos <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span></span>
              <button
                type="button"
                className="upload-trigger"
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
                onClick={() => photosInputRef.current?.click()}
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
                onClick={() => certInputRef.current?.click()}
                style={{ minHeight: 64 }}
              >
                <Upload size={20} strokeWidth={1.5} style={{ color: 'var(--sage)' }} />
                <span style={{ fontSize: 12 }}>Optional — PDF or image</span>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          {status && status !== "Listing submitted for moderation." && status !== "Submitting listing for moderation..." && status !== "Uploading media..." && (
            <p style={{ color: "var(--danger)", fontWeight: 600, marginTop: 16, marginBottom: 16, textAlign: "center" }}>
              {status}
            </p>
          )}
          <div className="post-actions">
            <button 
              type="submit" 
              className="primary-action" 
              id="submit-listing"
              disabled={status === "Submitting listing for moderation..." || status === "Uploading media..."}
            >
              {status === "Listing submitted for moderation." ? (
                <Check size={18} strokeWidth={2.5} />
              ) : status === "Submitting listing for moderation..." || status === "Uploading media..." ? (
                status
              ) : (
                <>
                  Submit for moderation
                  <ChevronRight size={17} strokeWidth={2.2} />
                </>
              )}
            </button>
            <button type="reset" className="clear-action" id="clear-listing">
              <Trash2 size={17} strokeWidth={2.2} />
              Clear
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function isUploadableUrl(uploadUrl: string) {
  return uploadUrl.startsWith("http") || uploadUrl.startsWith("/");
}
