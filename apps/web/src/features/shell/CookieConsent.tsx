import { useEffect, useId, useState } from "react";
import type { View } from "../../shared/types";

const CONSENT_KEY = "gemslanka_cookie_consent";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function enablePublicAnalytics() {
  const measurementId = document.documentElement.dataset.analyticsId;
  const canonicalHref = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  if (!measurementId || !canonicalHref || document.querySelector("[data-gems-analytics]")) return;
  const publicUrl = new URL(canonicalHref);
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  if (publicUrl.pathname !== normalizedPath) return;
  const pageLocation = publicUrl.origin + publicUrl.pathname;

  window.dataLayer ??= [];
  window.gtag = function () { window.dataLayer?.push(arguments); };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted"
  });
  window.gtag("js", new Date());
  // Keep the public canonical pinned when this document opens account views.
  window.gtag("config", measurementId, { page_location: pageLocation, send_page_view: false });
  window.gtag("event", "page_view", { page_location: pageLocation });
  const script = document.createElement("script");
  script.async = true;
  script.dataset.gemsAnalytics = "";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
}

export interface CookieConsentProps {
  onNavigate?: (view: View) => void;
}

export function CookieConsent({ onNavigate }: CookieConsentProps) {
  const [visible, setVisible] = useState(false);
  const titleId = useId();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) {
        setVisible(true);
      } else {
        const { choice } = JSON.parse(stored);
        if (choice === "all") {
          const timer = window.setTimeout(enablePublicAnalytics, 1000);
          return () => window.clearTimeout(timer);
        }
      }
    } catch {
      // LocalStorage access may fail in private window mode or restricted environments
    }
  }, []);

  const handleAccept = (choice: "all" | "essential") => {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, timestamp: new Date().toISOString() }));
      
      if (choice === "all") enablePublicAnalytics();
    } catch {
      // Ignore storage errors
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section className="cookie-consent-banner" aria-labelledby={titleId}>
      <div className="cookie-consent-content">
        <div className="cookie-consent-text">
          <strong className="cookie-consent-title" id={titleId}>We value your privacy & preferences</strong>
          <p>
            Gemslanka uses essential cookies for site and account features. If you accept analytics cookies, Google Analytics helps us understand how people use the marketplace. Learn more in our{" "}
            {onNavigate ? (
              <button
                type="button"
                className="btn-link"
                onClick={() => onNavigate("privacy")}
              >
                Privacy Policy
              </button>
            ) : (
              <a href="/privacy-policy">Privacy Policy</a>
            )}.
          </p>
        </div>
        <div className="cookie-consent-actions">
          <button
            type="button"
            className="subtle-action"
            onClick={() => handleAccept("essential")}
          >
            Essential Only
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => handleAccept("all")}
          >
            Accept All
          </button>
        </div>
      </div>
    </section>
  );
}
