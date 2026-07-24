import { useEffect, useState } from "react";
import type { View } from "../../shared/types";

const CONSENT_KEY = "gemslanka_cookie_consent";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export interface CookieConsentProps {
  onNavigate?: (view: View) => void;
}

export function CookieConsent({ onNavigate }: CookieConsentProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) {
        setVisible(true);
      } else {
        const { choice } = JSON.parse(stored);
        if (choice === "all" && window.gtag) {
          window.gtag("consent", "update", {
            ad_storage: "granted",
            ad_user_data: "granted",
            ad_personalization: "granted",
            analytics_storage: "granted",
          });
        }
      }
    } catch {
      // LocalStorage access may fail in private window mode or restricted environments
    }
  }, []);

  const handleAccept = (choice: "all" | "essential") => {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, timestamp: new Date().toISOString() }));
      
      if (choice === "all" && window.gtag) {
        window.gtag("consent", "update", {
          ad_storage: "granted",
          ad_user_data: "granted",
          ad_personalization: "granted",
          analytics_storage: "granted",
        });
      }
    } catch {
      // Ignore storage errors
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="cookie-consent-banner" role="dialog" aria-label="Cookie consent banner" aria-live="polite">
      <div className="cookie-consent-content">
        <div className="cookie-consent-text">
          <strong className="cookie-consent-title">We value your privacy & preferences</strong>
          <p>
            Gemslanka uses essential cookies to ensure site functionality, session security, and account features. Third-party partners can also use advertising cookies to personalize ads based on past visits. Learn more in our{" "}
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
    </aside>
  );
}
