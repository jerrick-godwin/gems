import { Gem } from "lucide-react";
import { useEffect, useState } from "react";
import { formatLkr, type CheckoutDetails } from "@gems/schemas";
import { gemFallbackImageUrl } from "./productImages";

const orderPlacedDateFormatter = new Intl.DateTimeFormat("en-LK", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

export function formatOrderPlacedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return orderPlacedDateFormatter.format(date);
}

export function OrderSummaryItem({
  title,
  imageUrl,
  summary,
  quantity,
  unitPrice
}: {
  title: string;
  imageUrl?: string;
  summary: string;
  quantity: number;
  unitPrice: number;
}) {
  const fallbackImageUrl = gemFallbackImageUrl(title, summary);
  const [displayImageUrl, setDisplayImageUrl] = useState(imageUrl ?? fallbackImageUrl);

  useEffect(() => {
    setDisplayImageUrl(imageUrl ?? fallbackImageUrl);
  }, [imageUrl, fallbackImageUrl]);

  return (
    <div className="checkout-summary-item">
      <div className="checkout-summary-image">
        {displayImageUrl ? (
          <img
            src={displayImageUrl}
            alt={title}
            onError={() => setDisplayImageUrl((current) => current === fallbackImageUrl ? undefined : fallbackImageUrl)}
          />
        ) : (
          <Gem size={24} />
        )}
      </div>
      <div className="checkout-summary-copy">
        <strong>{title}</strong>
        <span>{summary}</span>
        <em>Qty {quantity} · {formatLkr(unitPrice)} each</em>
      </div>
      <strong className="checkout-line-total">{formatLkr(unitPrice * quantity)}</strong>
    </div>
  );
}

export function AddressBlock({ title, details }: { title: string; details: CheckoutDetails }) {
  return (
    <div className="address-block">
      <strong>{title}</strong>
      <span>{details.fullName || "Name pending"}</span>
      <span>{[details.mobile, details.email].filter(Boolean).join(" · ") || "Contact pending"}</span>
      <span>{[details.addressLine1, details.addressLine2, details.city, details.district, details.postalCode, details.country].filter(Boolean).join(", ") || "Address pending"}</span>
    </div>
  );
}
