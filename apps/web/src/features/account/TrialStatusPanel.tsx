import { Ban, CheckCircle2 } from "lucide-react";
import type { UserTrialSummary } from "@gems/schemas";

type TrialPanelVariant = "full" | "compact" | "checkout";

const DAY_MS = 24 * 60 * 60 * 1000;

export function TrialStatusPanel({
  trial,
  variant = "full"
}: {
  trial?: UserTrialSummary | null;
  variant?: TrialPanelVariant;
}) {
  if (!trial || trial.status === "expired") return null;

  const copy = getTrialStatusCopy(trial);
  const Icon = copy.icon;

  return (
    <section className={`data-panel trial-status-panel trial-status-panel-${trial.status} trial-status-panel-${variant}`} aria-live="polite">
      <div className="trial-status-icon" aria-hidden="true">
        <Icon size={variant === "compact" ? 18 : 20} strokeWidth={2.4} />
      </div>
      <div className="trial-status-copy">
        <div className="trial-status-head">
          <h2>{copy.title}</h2>
          <span className="trial-status-chip">{copy.statusLabel}</span>
        </div>
        <p>{copy.body}</p>
        <p className="trial-status-action">{copy.action}</p>
        <div className="trial-status-meta">
          <span>Started {formatTrialDate(trial.startsAt)}</span>
          <span>Ends {formatTrialDate(trial.endsAt)}</span>
          {trial.terminatedAt && <span>Ended {formatTrialDate(trial.terminatedAt)}</span>}
        </div>
      </div>
    </section>
  );
}

export function formatTrialDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

export function getTrialDaysRemaining(trial?: UserTrialSummary | null, now = new Date()) {
  if (!trial || trial.status !== "active") return 0;
  const endsAt = new Date(trial.endsAt).getTime();
  if (!Number.isFinite(endsAt)) return 0;
  return Math.max(0, Math.ceil((endsAt - now.getTime()) / DAY_MS));
}

export function getTrialMenuLabel(trial?: UserTrialSummary | null) {
  if (!trial) return null;
  if (trial.status === "active") {
    const days = getTrialDaysRemaining(trial);
    return days <= 0 ? "Free trial: ends today" : `Free trial: ${days} day${days === 1 ? "" : "s"} left`;
  }
  if (trial.status === "terminated") return "Trial ended";
  return null;
}

export function getTrialMenuTone(trial?: UserTrialSummary | null) {
  if (!trial) return "var(--muted)";
  if (trial.status === "active") return "var(--emerald-dark)";
  if (trial.status === "terminated") return "var(--danger)";
  return "var(--gold-dark)";
}

function getTrialStatusCopy(trial: UserTrialSummary) {
  if (trial.status === "active") {
    const days = getTrialDaysRemaining(trial);
    const daysCopy = days <= 0 ? "ends today" : `${days} day${days === 1 ? "" : "s"} left`;
    return {
      icon: CheckCircle2,
      title: `Free trial active until ${formatTrialDate(trial.endsAt)}`,
      statusLabel: `Active · ${daysCopy}`,
      body: "Listings posted during trial stay live until your trial ends.",
      action: "You can publish eligible listings with LKR 0 due today while trial access is active."
    };
  }

  return {
    icon: Ban,
    title: "Trial ended",
    statusLabel: "Terminated",
    body: "Trial access was ended by admin. Paid subscriptions are still available.",
    action: "Choose Pay Now on eligible listings to continue with paid access."
  };
}
