import { Calendar, XCircle, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { GemsAdminApiClient } from "@gems/api-client";
import type { Listing, PromotionCampaign } from "@gems/schemas";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";

export function CampaignDialog({ 
  listing, 
  api, 
  token,
  onClose,
  onUpdate
}: { 
  listing: Listing; 
  api: GemsAdminApiClient;
  token: string;
  onClose: () => void;
  onUpdate: (listing: Listing) => void;
}) {
  const [busy, setBusy] = useState<string | false>(false);
  const [type, setType] = useState<PromotionCampaign["type"]>("featured");
  const defaultStartsAt = new Date().toISOString().split("T")[0];
  const defaultEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [startsAtInput, setStartsAtInput] = useState(defaultStartsAt);
  const [endsAtInput, setEndsAtInput] = useState(defaultEndsAt);
  const campaignAction = useSingleFlightAction();

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await campaignAction.run(async () => {
      setBusy("create");
      const startsAt = new Date(startsAtInput);
      const endsAt = new Date(endsAtInput);
      endsAt.setHours(23, 59, 59, 999);
      try {
        const updated = await api.createCampaign(token, listing.id, {
          type,
          status: "active",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString()
        });
        onUpdate(updated);
      } catch {
        alert("Failed to create campaign");
      } finally {
        setBusy(false);
      }
    });
  };

  const handleAction = async (campaignId: string, action: "pause" | "resume" | "stop" | "extend") => {
    await campaignAction.run(async () => {
      setBusy(campaignId);
      try {
        let updates: Partial<PromotionCampaign> = {};
        if (action === "pause") updates.status = "paused";
        if (action === "resume") updates.status = "active";
        if (action === "stop") updates.status = "stopped";
        if (action === "extend") {
          const campaign = (listing.campaigns || []).find(c => c.id === campaignId);
          if (campaign) {
            const endsAt = new Date(campaign.endsAt);
            updates.endsAt = new Date(endsAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          }
        }
        const updated = await api.updateCampaign(token, listing.id, campaignId, updates);
        onUpdate(updated);
      } catch {
        alert("Failed to update campaign");
      } finally {
        setBusy(false);
      }
    });
  };

  return createPortal(
    <div className="modal-overlay modal-overlay--priority" role="presentation">
      <div className="campaign-dialog modal-content card card--surface" role="dialog" aria-modal="true" aria-labelledby="campaign-dialog-title">
        <div className="campaign-dialog-header">
          <h2 id="campaign-dialog-title">Manage Promotions</h2>
          <button type="button" className="campaign-dialog-close" onClick={onClose} aria-label="Close promotions dialog"><XCircle size={24} /></button>
        </div>

        <div className="campaign-dialog-create">
          <h3>New Campaign</h3>
          <form className="campaign-dialog-form" onSubmit={(e) => void handleCreate(e)}>
            <label>
              <span>Type</span>
              <select value={type} onChange={e => setType(e.target.value as PromotionCampaign["type"])}>
                <option value="featured">Featured</option>
                <option value="top">Top Ad</option>
                <option value="urgent">Urgent</option>
                <option value="bump">Bump</option>
              </select>
            </label>
            <label>
              <span>Start Date</span>
              <input type="date" value={startsAtInput} onChange={e => setStartsAtInput(e.target.value)} required min={defaultStartsAt} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endsAtInput} onChange={e => setEndsAtInput(e.target.value)} required min={startsAtInput} />
            </label>
            <button type="submit" className="campaign-dialog-create-button" disabled={campaignAction.busy || Boolean(busy)} style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "center" }}>
              {(campaignAction.busy || busy) ? <LoaderCircle className="icon-spinner" size={16} /> : null}
              Create
            </button>
          </form>
        </div>

        <div className="campaign-dialog-existing">
          <h3>Existing Campaigns</h3>
          {(listing.campaigns || []).length === 0 ? (
            <p className="campaign-dialog-empty">No campaigns for this listing.</p>
          ) : (
            <div className="campaign-dialog-list">
              {(listing.campaigns || []).map(campaign => (
                <div key={campaign.id} className="campaign-dialog-item card card--inset card--compact">
                  <div className="campaign-dialog-item-header">
                    <strong>{campaign.type}</strong>
                    <span className={`campaign-dialog-status ${campaign.status === "active" ? "is-active" : ""}`}>
                      {campaign.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="campaign-dialog-dates">
                    <Calendar size={14} /> {new Date(campaign.startsAt).toLocaleDateString()} - {new Date(campaign.endsAt).toLocaleDateString()}
                  </div>
                  <div className="campaign-dialog-actions">
                    {campaign.status === "active" && (
                      <button onClick={() => void handleAction(campaign.id, "pause")} disabled={campaignAction.busy || Boolean(busy)} style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                        {busy === campaign.id ? <LoaderCircle className="icon-spinner" size={14} /> : null} Pause
                      </button>
                    )}
                    {campaign.status === "paused" && (
                      <button onClick={() => void handleAction(campaign.id, "resume")} disabled={campaignAction.busy || Boolean(busy)} style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                        {busy === campaign.id ? <LoaderCircle className="icon-spinner" size={14} /> : null} Resume
                      </button>
                    )}
                    {(campaign.status === "active" || campaign.status === "paused") && (
                      <>
                        <button onClick={() => void handleAction(campaign.id, "extend")} disabled={campaignAction.busy || Boolean(busy)} style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                          {busy === campaign.id ? <LoaderCircle className="icon-spinner" size={14} /> : null} +7 Days
                        </button>
                        <button className="tone-danger" onClick={() => void handleAction(campaign.id, "stop")} disabled={campaignAction.busy || Boolean(busy)} style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                          {busy === campaign.id ? <LoaderCircle className="icon-spinner" size={14} /> : null} Stop
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
