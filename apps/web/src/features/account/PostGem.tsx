import { Camera, ChevronRight, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { GemsApiClient, type MarketplaceSnapshot } from "@gems/api-client";
import type { ListingCheckoutMedia, ListingCheckoutMediaInput, Treatment } from "@gems/schemas";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { formatPriceInput, parsePriceInput, isUploadableUrl, publicErrorMessage } from "../../shared/helpers";





export function PostGem({
  gemTypes,
  locations,
  api,
  editCheckoutToken,
  onCheckoutCreated
}: {
  gemTypes: MarketplaceSnapshot["gemTypes"];
  locations: string[];
  api: GemsApiClient;
  editCheckoutToken?: string;
  onCheckoutCreated: (token: string, checkoutUrl: string) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [retainedMedia, setRetainedMedia] = useState<ListingCheckoutMedia[]>([]);
  const [certificate, setCertificateFile] = useState<File | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);
  const submitAction = useSingleFlightAction();
  const retainedPhotos = retainedMedia.filter((item) => item.kind === "photo");
  const retainedCertificate = retainedMedia.find((item) => item.kind === "certificate");
  const totalPhotoCount = retainedPhotos.length + photos.length;
  const isEditingCheckout = Boolean(editCheckoutToken);
  const isSubmitting = submitAction.busy || status === "Loading saved draft..." || status === "Creating secure checkout..." || status === "Updating secure checkout..." || status === "Uploading media...";

  useEffect(() => {
    let active = true;
    if (!editCheckoutToken) {
      setRetainedMedia([]);
      return;
    }

    setStatus("Loading saved draft...");
    api.listingCheckoutSession(editCheckoutToken)
      .then((session) => {
        if (!active) return;
        const form = formRef.current;
        if (form) {
          setFieldValue(form, "post-title", session.draft.title);
          setFieldValue(form, "post-gem-type", session.draft.gemTypeId);
          setFieldValue(form, "post-description", session.draft.description);
          setFieldValue(form, "post-location", session.draft.location);
          setFieldValue(form, "post-carat", String(session.draft.attributes.carat));
          setFieldValue(form, "post-dimensions", session.draft.attributes.dimensions);
          setFieldValue(form, "post-shape", session.draft.attributes.shape);
          setFieldValue(form, "post-cut", session.draft.attributes.cut);
          setFieldValue(form, "post-color", session.draft.attributes.color);
          setFieldValue(form, "post-clarity", session.draft.attributes.clarity);
          setFieldValue(form, "post-origin", session.draft.attributes.origin);
          setFieldValue(form, "post-treatment", session.draft.attributes.treatment);
        }
        setPriceInput(formatPriceInput(String(session.draft.priceLkr)));
        setPhotos([]);
        setCertificateFile(null);
        setRetainedMedia(session.media);
        setStatus(null);
      })
      .catch((error) => {
        if (active) setStatus(publicErrorMessage(error, "Unable to load saved checkout draft."));
      });

    return () => {
      active = false;
    };
  }, [api, editCheckoutToken]);

  const handlePriceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPriceInput(formatPriceInput(event.target.value));
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    
    const MAX_SIZE = 2 * 1024 * 1024;
    const newFiles = Array.from(files);
    const retainedPhotoCount = retainedMedia.filter((item) => item.kind === "photo").length;
    
    for (const file of newFiles) {
      if (file.size > MAX_SIZE) {
        setStatus(`Image "${file.name}" exceeds the 2MB limit.`);
        return;
      }
    }

    setPhotos((prev) => {
      const combined = [...prev, ...newFiles];
      if (retainedPhotoCount + combined.length > 15) {
        setStatus("You can upload a maximum of 15 gem photos.");
        return combined.slice(0, Math.max(0, 15 - retainedPhotoCount));
      }
      setStatus(null);
      return combined;
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    if (photosInputRef.current) photosInputRef.current.value = "";
  };

  const removeRetainedMedia = (id: string) => {
    setRetainedMedia((prev) => prev.filter((item) => item.id !== id));
  };

  const removeCertificate = () => {
    setCertificateFile(null);
    setRetainedMedia((prev) => prev.filter((item) => item.kind !== "certificate"));
    if (certInputRef.current) certInputRef.current.value = "";
  };

  const handleClear = () => {
    setPhotos([]);
    setRetainedMedia([]);
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

    if (totalPhotoCount === 0) {
      setStatus("Please add at least one gem photo.");
      return;
    }

    await submitAction.run(async () => {
      try {
        setStatus(isEditingCheckout ? "Updating secure checkout..." : "Creating secure checkout...");
        const media: ListingCheckoutMediaInput[] = photos.map((file) => ({
          kind: "photo",
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size
        }));
        if (certificate) {
          media.push({
            kind: "certificate",
            fileName: certificate.name,
            contentType: certificate.type || "application/pdf",
            size: certificate.size
          });
        }
        const certificateStatus = certificate || retainedCertificate ? "seller_provided" as const : "none" as const;

        const checkoutRequest = {
          draft: {
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
              certificateStatus
            }
          },
          media
        };

        const checkout = editCheckoutToken
          ? await api.updateListingCheckoutDraft(editCheckoutToken, {
              ...checkoutRequest,
              retainedMediaIds: retainedMedia.map((item) => item.id)
            })
          : await api.createListingCheckoutSession(checkoutRequest);

        setStatus("Uploading media...");
        const filesToUpload = certificate ? [...photos, certificate] : photos;
        for (const [index, target] of checkout.uploadTargets.entries()) {
          const file = filesToUpload[index];
          if (!file || !isUploadableUrl(target.uploadUrl)) continue;
          const uploadResponse = await fetch(target.uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "x-ms-blob-type": "BlockBlob"
            }
          });
          if (!uploadResponse.ok) throw new Error(`Unable to upload ${file.name}.`);
        }

        if (!editCheckoutToken) {
          form.reset();
          handleClear();
        }
        onCheckoutCreated(checkout.token, checkout.checkoutUrl);
        submitAction.release();
      } catch (error) {
        setStatus(publicErrorMessage(error, "Unable to submit listing."));
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
        <form ref={formRef} className="post-form" id="post-gem-form" onSubmit={handleSubmit} onReset={handleClear}>
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
            {totalPhotoCount > 0 ? (
              <div className="upload-previews">
                {retainedPhotos.map((item) => (
                  <div className="upload-preview-item" key={item.id}>
                    {item.readUrl ? <img src={item.readUrl} alt={item.fileName} /> : <div className="cert-icon"><Camera size={20} strokeWidth={1.5} /></div>}
                    <button
                      type="button"
                      className="upload-remove"
                      disabled={isSubmitting}
                      onClick={() => removeRetainedMedia(item.id)}
                      aria-label={`Remove ${item.fileName}`}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                    <span className="upload-filename">{item.fileName}</span>
                  </div>
                ))}
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
              {!certificate && !retainedCertificate && (
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
            {certificate || retainedCertificate ? (
              <div className="upload-previews">
                <div className="upload-preview-item cert">
                  {retainedCertificate ? (
                    retainedCertificate.contentType.startsWith("image/") && retainedCertificate.readUrl ? (
                      <img src={retainedCertificate.readUrl} alt={retainedCertificate.fileName} />
                    ) : (
                      <div className="cert-icon">
                        <Upload size={20} strokeWidth={1.5} />
                        <span>PDF</span>
                      </div>
                    )
                  ) : certificate?.type.startsWith('image/') ? (
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
                  <span className="upload-filename">{retainedCertificate?.fileName ?? certificate?.name}</span>
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

          {/* ── Actions ── */}
          <div className="post-actions">
            <button 
              type="submit" 
              className="primary-action" 
              id="submit-listing"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  <span>{status}</span>
                </>
              ) : (
                <>
                  {isEditingCheckout ? "Update Checkout" : "Continue to Checkout"}
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

function setFieldValue(form: HTMLFormElement, id: string, value: string) {
  const field = form.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (field) field.value = value;
}
