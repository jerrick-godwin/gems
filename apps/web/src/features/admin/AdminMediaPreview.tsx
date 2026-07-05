import { ExternalLink, FileText, Film, ImageIcon } from "lucide-react";
import { useState } from "react";
import type { ListingMedia } from "@gems/schemas";

type AdminMediaPreviewVariant = "thumb" | "detail" | "tile";

export function AdminMediaPreview({
  media,
  alt,
  variant = "thumb"
}: {
  media?: ListingMedia;
  alt: string;
  variant?: AdminMediaPreviewVariant;
}) {
  const [failed, setFailed] = useState(false);
  const url = media?.url;
  const label = media?.kind === "certificate" ? "Certificate" : media?.alt || alt;
  const fileType = media ? mediaFileType(media) : "missing";
  const className = `admin-media-preview admin-media-preview-${variant}`;
  const canRenderImage = Boolean(url && fileType === "image" && !failed);

  const content = canRenderImage ? (
    <img src={url} alt={label} onError={() => setFailed(true)} />
  ) : fileType === "video" && url && !failed ? (
    <video src={url} muted playsInline onError={() => setFailed(true)} />
  ) : (
    <div className="admin-media-fallback">
      {fileType === "pdf" ? <FileText size={variant === "thumb" ? 20 : 26} /> : fileType === "video" ? <Film size={variant === "thumb" ? 20 : 26} /> : <ImageIcon size={variant === "thumb" ? 20 : 26} />}
      <span>{fallbackLabel(fileType, failed, Boolean(url))}</span>
    </div>
  );

  if (!url) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}>
      {content}
      {variant !== "thumb" && (
        <span className="admin-media-open">
          Open file <ExternalLink size={13} />
        </span>
      )}
    </a>
  );
}

function mediaFileType(media: ListingMedia) {
  const value = `${media.kind} ${media.alt} ${media.url.split("?")[0]}`.toLowerCase();
  if (value.includes(".pdf") || media.kind === "certificate" && value.includes("pdf")) return "pdf";
  if (media.kind === "video" || /\.(mp4|webm|ogg|mov)$/i.test(value)) return "video";
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(value) || media.kind === "photo" || media.kind === "certificate") return "image";
  return "file";
}

function fallbackLabel(fileType: string, failed: boolean, hasUrl: boolean) {
  if (!hasUrl) return "No file";
  if (failed) return "Preview unavailable";
  if (fileType === "pdf") return "PDF";
  if (fileType === "video") return "Video";
  return "File";
}
