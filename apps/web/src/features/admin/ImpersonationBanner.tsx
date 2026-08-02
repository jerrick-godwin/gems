import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import type { CustomerAuthClient } from "../../firebase";

export interface ImpersonationInfo {
  uid: string;
  email: string;
}

export function ImpersonationBanner({ info, authClient }: { info: ImpersonationInfo; authClient: CustomerAuthClient }) {
  const [ending, setEnding] = useState(false);

  const handleEnd = async () => {
    setEnding(true);
    try {
      await authClient.signOut();
    } finally {
      setEnding(false);
      window.close();
      window.location.replace("/impersonate/ended");
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: "relative",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.5rem 1.25rem",
        background: "linear-gradient(90deg, #92400e, #b45309)",
        color: "#fffbeb",
        fontSize: "0.875rem",
        fontWeight: 500,
        fontFamily: "inherit",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)"
      }}
    >
      <ShieldAlert size={16} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.9 }} />
      <span style={{ flex: 1 }}>
        <strong style={{ fontWeight: 700 }}>Admin view</strong> — signed in as{" "}
        <strong style={{ fontWeight: 700 }}>{info.email}</strong>
      </span>
      <button
        type="button"
        id="end-impersonation-btn"
        onClick={() => void handleEnd()}
        disabled={ending}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.25rem 0.75rem",
          border: "1px solid rgba(255,251,235,0.5)",
          borderRadius: "0.375rem",
          background: "rgba(255,251,235,0.15)",
          color: "#fffbeb",
          fontSize: "0.8125rem",
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: ending ? "not-allowed" : "pointer",
          opacity: ending ? 0.7 : 1,
          transition: "background 0.15s",
          flexShrink: 0
        }}
      >
        <X size={13} aria-hidden="true" />
        {ending ? "Ending…" : "End Impersonation"}
      </button>
    </div>
  );
}
