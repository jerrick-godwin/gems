import { Star, Trash } from "lucide-react";
import { useState } from "react";
import type { GemsAdminApiClient } from "@gems/api-client";
import type { Listing } from "@gems/schemas";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { CampaignDialog } from "./CampaignDialog";

export function ActiveListingRow({ 
  listing, 
  api, 
  token,
  onUpdate,
  onRemove
}: { 
  listing: Listing; 
  api: GemsAdminApiClient; 
  token: string;
  onUpdate: (listing: Listing) => void;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const removeAction = useSingleFlightAction();

  const handleRemove = async () => {
    if (!window.confirm(`Are you sure you want to remove "${listing.title}"?`)) return;
    await removeAction.run(async () => {
      setBusy(true);
      try {
        await api.removeListing(token, listing.id);
        onRemove(listing.id);
      } catch (error) {
        alert("Failed to remove listing");
        setBusy(false);
      }
    });
  };

  const hasActiveCampaign = (listing.campaigns || []).some(c => c.status === "active" && new Date(c.endsAt) > new Date());

  return (
    <>
      <div className="review-row" style={{ background: "var(--panel-strong)", padding: 12, borderRadius: "var(--radius)", marginBottom: 8, border: "1px solid var(--line)", boxShadow: "var(--shadow-xs)" }}>
        <img src={listing.media[0]?.url} alt={listing.title} style={{ width: 80, height: 80, borderRadius: "var(--radius-sm)" }} />
        <div>
          <strong style={{ fontSize: 15, fontWeight: 700 }}>{listing.title}</strong>
          <span style={{ fontSize: 13, marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            {listing.attributes.carat} ct · LKR {listing.priceLkr.toLocaleString()}
            {hasActiveCampaign && (
              <span style={{ background: "var(--gold-soft)", color: "var(--gold-dark)", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                PROMOTED
              </span>
            )}
          </span>
        </div>
        <button style={{ minHeight: 36, padding: "0 16px" }} disabled={removeAction.busy || busy} onClick={() => setShowCampaigns(true)}>
          <Star size={16} style={{ marginRight: 6 }} /> Promotions
        </button>
        <button style={{ minHeight: 36, padding: "0 16px", background: "var(--danger-soft)", color: "var(--danger)" }} disabled={removeAction.busy || busy} onClick={() => void handleRemove()}>
          <Trash size={16} />
        </button>
      </div>
      {showCampaigns && (
        <CampaignDialog 
          listing={listing} 
          api={api} 
          token={token} 
          onClose={() => setShowCampaigns(false)} 
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
