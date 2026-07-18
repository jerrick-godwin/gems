import type { CSSProperties } from "react";
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
    <div className={`metric-card card card--metric${accent ? " metric-card-accented" : ""}`} style={accent ? { "--metric-accent": accent } as CSSProperties : undefined}>
      <Icon size={accent ? 20 : 18} strokeWidth={2} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
