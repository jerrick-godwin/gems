import { Gem, ShieldCheck } from "lucide-react";

type StatusStateProps = {
  title: string;
  message: string;
  loading?: boolean;
  variant?: "marketplace" | "admin";
};

export function StatusState({ title, message, loading, variant = "marketplace" }: StatusStateProps) {
  const Icon = variant === "admin" ? ShieldCheck : Gem;
  return (
    <section className="status-state">
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: variant === "admin" ? 16 : 12 }}>
          <Icon
            size={48}
            strokeWidth={1.5}
            style={{
              color: "var(--emerald)",
              animation: "float 2s ease-in-out infinite",
              opacity: 0.7
            }}
          />
        </div>
      )}
      <h1 style={variant === "admin" ? { fontFamily: "Playfair Display, serif", fontWeight: 700 } : undefined}>{title}</h1>
      <p>{message}</p>
      {loading && variant === "marketplace" && (
        <div style={{ display: "grid", gap: 12, maxWidth: 500, margin: "24px auto 0", width: "100%" }}>
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" style={{ opacity: 0.6 }} />
        </div>
      )}
    </section>
  );
}
