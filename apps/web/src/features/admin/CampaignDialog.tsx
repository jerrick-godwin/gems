import { Calendar, XCircle } from "lucide-react";
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
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<PromotionCampaign["type"]>("featured");
  const defaultStartsAt = new Date().toISOString().split("T")[0];
  const defaultEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [startsAtInput, setStartsAtInput] = useState(defaultStartsAt);
  const [endsAtInput, setEndsAtInput] = useState(defaultEndsAt);
  const campaignAction = useSingleFlightAction();

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await campaignAction.run(async () => {
      setBusy(true);
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
      setBusy(true);
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100000, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "var(--bg)", padding: 24, borderRadius: "var(--radius)", width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", boxShadow: "var(--shadow-xl)", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Manage Promotions</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink)" }}><XCircle size={24} /></button>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>New Campaign</h3>
          <form onSubmit={(e) => void handleCreate(e)} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Type</span>
              <select value={type} onChange={e => setType(e.target.value as PromotionCampaign["type"])} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--line)" }}>
                <option value="featured">Featured</option>
                <option value="top">Top Ad</option>
                <option value="urgent">Urgent</option>
                <option value="bump">Bump</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Start Date</span>
              <input type="date" value={startsAtInput} onChange={e => setStartsAtInput(e.target.value)} required min={defaultStartsAt} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--line)", boxSizing: "border-box" }} />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, display: "block", marginBottom: 4 }}>End Date</span>
              <input type="date" value={endsAtInput} onChange={e => setEndsAtInput(e.target.value)} required min={startsAtInput} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--line)", boxSizing: "border-box" }} />
            </label>
            <button type="submit" disabled={campaignAction.busy || busy} style={{ minHeight: 38, padding: "0 16px" }}>Create</button>
          </form>
        </div>

        <div>
          <h3 style={{ fontSize: 14, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>Existing Campaigns</h3>
          {(listing.campaigns || []).length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>No campaigns for this listing.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(listing.campaigns || []).map(campaign => (
                <div key={campaign.id} style={{ border: "1px solid var(--line)", padding: 12, borderRadius: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <strong style={{ textTransform: "capitalize" }}>{campaign.type}</strong>
                    <span style={{ 
                      padding: "2px 6px", 
                      borderRadius: 4, 
                      fontSize: 11, 
                      fontWeight: 700, 
                      background: campaign.status === "active" ? "var(--mint)" : "var(--soft)",
                      color: campaign.status === "active" ? "var(--emerald-dark)" : "var(--muted)" 
                    }}>
                      {campaign.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
                    <Calendar size={14} /> {new Date(campaign.startsAt).toLocaleDateString()} - {new Date(campaign.endsAt).toLocaleDateString()}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {campaign.status === "active" && (
                      <button onClick={() => void handleAction(campaign.id, "pause")} disabled={campaignAction.busy || busy} style={{ flex: 1, padding: "6px 0", fontSize: 13, background: "var(--soft)", color: "var(--ink)" }}>Pause</button>
                    )}
                    {campaign.status === "paused" && (
                      <button onClick={() => void handleAction(campaign.id, "resume")} disabled={campaignAction.busy || busy} style={{ flex: 1, padding: "6px 0", fontSize: 13, background: "var(--soft)", color: "var(--ink)" }}>Resume</button>
                    )}
                    {(campaign.status === "active" || campaign.status === "paused") && (
                      <>
                        <button onClick={() => void handleAction(campaign.id, "extend")} disabled={campaignAction.busy || busy} style={{ flex: 1, padding: "6px 0", fontSize: 13, background: "var(--soft)", color: "var(--ink)" }}>+7 Days</button>
                        <button onClick={() => void handleAction(campaign.id, "stop")} disabled={campaignAction.busy || busy} style={{ flex: 1, padding: "6px 0", fontSize: 13, background: "var(--danger-soft)", color: "var(--danger)" }}>Stop</button>
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
