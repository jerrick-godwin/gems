import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

export interface AdSenseUnitProps {
  client?: string;
  slot?: string;
  format?: "auto" | "fluid" | "rectangle" | "horizontal" | "vertical";
  responsive?: boolean;
  layoutKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AdSenseUnit({
  client = "ca-pub-1870465390690184",
  slot,
  format = "auto",
  responsive = true,
  layoutKey,
  className = "",
  style = { display: "block" }
}: AdSenseUnitProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (pushedRef.current) return;
    try {
      if (adRef.current && adRef.current.children.length === 0) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushedRef.current = true;
      }
    } catch {
      // Ignore adsbygoogle errors (e.g. adblocker active or missing slot)
    }
  }, []);

  return (
    <div className={`adsense-unit-container ${className}`.trim()}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={style}
        data-ad-client={client}
        {...(slot ? { "data-ad-slot": slot } : {})}
        {...(format ? { "data-ad-format": format } : {})}
        {...(responsive ? { "data-full-width-responsive": "true" } : {})}
        {...(layoutKey ? { "data-ad-layout-key": layoutKey } : {})}
      />
    </div>
  );
}
