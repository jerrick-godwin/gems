import type { LucideIcon } from "lucide-react";

export function Metric({
  icon: Icon,
  label,
  value,
  accent
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="metric-card" style={accent ? { borderTop: `3px solid ${accent}` } : undefined}>
      <Icon size={accent ? 20 : 18} strokeWidth={2} style={accent ? { color: accent } : undefined} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
