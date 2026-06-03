import { Eye, MessageCircle, Phone, Wallet } from "lucide-react";
import type { Report, SellerProfile } from "@gems/schemas";

export function reportReasonLabel(reason: Report["reason"]) {
  const labels: Record<Report["reason"], string> = {
    fake_certificate: "Fake Certificate",
    misrepresented_gem: "Misrepresented Gem",
    scam_attempt: "Scam Attempt",
    duplicate: "Duplicate Listing",
    wrong_details: "Wrong Details",
    abusive_seller: "Abusive Seller"
  };
  return labels[reason] ?? String(reason).replace(/_/g, " ");
}

export function metricIcon(label: string) {
  if (label.toLowerCase().includes("chat")) return MessageCircle;
  if (label.toLowerCase().includes("phone")) return Phone;
  if (label.toLowerCase().includes("spend")) return Wallet;
  return Eye;
}

export function sellerProfileLabel(status?: SellerProfile["verificationStatus"]) {
  if (status === "business_verified") return "Business profile";
  if (status === "identity_verified") return "Seller profile";
  return "Seller profile";
}

