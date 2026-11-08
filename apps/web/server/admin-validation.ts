import type { PromotionCampaign } from "@gems/schemas";

export function validateCampaign(campaign: PromotionCampaign, previous?: PromotionCampaign) {
  if (!["featured", "top", "urgent", "bump"].includes(campaign.type)) throw new Error("Invalid promotion type");
  if (!["active", "paused", "stopped"].includes(campaign.status)) throw new Error("Invalid promotion status");
  const start = new Date(campaign.startsAt), end = new Date(campaign.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("Campaign end must be after its start");
  if (previous && (campaign.id !== previous.id || campaign.type !== previous.type || campaign.startsAt !== previous.startsAt)) throw new Error("Campaign identity and start cannot be changed");
  if (previous?.status === "stopped") throw new Error("Stopped campaigns cannot be changed");
  if (previous && end < new Date(previous.endsAt)) throw new Error("Campaign expiry cannot be shortened");
  return { id: campaign.id, type: campaign.type, status: campaign.status, startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function validateModeration(decision: string, reason?: string) {
  if (!["approve", "reject"].includes(decision)) throw new Error("Invalid moderation decision");
  if (decision === "reject" && !reason?.trim()) throw new Error("A rejection reason is required");
}
