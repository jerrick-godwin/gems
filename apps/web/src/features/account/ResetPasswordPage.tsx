import { ArrowLeft, KeyRound, X } from "lucide-react";
import { useState, useEffect, type FormEvent, type MouseEvent } from "react";
import { authClient } from "../../firebase";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import type { View } from "../../shared/types";
import { authErrorMessage } from "./authValidation";

export function ResetPasswordPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);
  
  const submitAction = useSingleFlightAction();
  const loading = submitAction.busy;

  useEffect(() => {
    // Parse oobCode from the URL query params on mount
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("oobCode");
    if (code) {
      setOobCode(code);
    } else {
      setFormError("The password reset link is invalid or missing the required security code. Please request a new reset link.");
    }
  }, []);

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!oobCode) return;
    
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters long.");
      return;
    }

    await submitAction.run(async () => {
      setFormError(null);
      try {
        await authClient.confirmPasswordReset({ code: oobCode, password });
        setSuccess(true);
      } catch (error) {
        setFormError(authErrorMessage(error, "Unable to reset password. The link may have expired or already been used."));
      }
    });
  };

  const handleAuthLinkClick = (event: MouseEvent<HTMLAnchorElement>, nextView: View) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(nextView);
  };

  return (
    <section className="login-screen">
      <div className="login-visual" aria-hidden="true">
        <div className="login-visual-content">
          <h2>Secure access to your gemstone account</h2>
          <p>Choose a strong, unique password to protect your listings and reports.</p>
        </div>
      </div>
      <div className="login-panel card card--spacious">
        <div>
          <h1 className="auth-title">
            Reset Password
          </h1>
          <p>Please enter your new password below.</p>
        </div>
        
        {formError && (
          <div className="auth-error-popup" role="alert" aria-live="assertive">
            <span>{formError}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setFormError(null)}>
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
        
        {success ? (
          <div className="auth-success-popup" role="status" aria-live="polite">
            <p>Your password has been successfully reset.</p>
            <p style={{ marginTop: "1rem" }}>
              <a href="/login" className="primary-action" style={{ display: "inline-flex", textDecoration: "none" }} onClick={(event) => handleAuthLinkClick(event, "login")}>
                Sign In Now
              </a>
            </p>
          </div>
        ) : (
          <form className="login-form" onSubmit={resetPassword} noValidate>
            <label>
              <span className="auth-label-text">New password <span className="required-marker" aria-hidden="true">*</span></span>
              <input
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFormError(null);
                }}
                type="password"
                autoComplete="new-password"
                required
                disabled={!oobCode}
                placeholder="Must be at least 8 characters"
                minLength={8}
              />
            </label>
            <button className="primary-action" type="submit" disabled={loading || !oobCode}>
              {loading ? <span className="button-spinner" aria-hidden="true" /> : <KeyRound size={18} strokeWidth={2.4} />}
              {loading ? "Saving..." : "Save Password"}
            </button>
          </form>
        )}
        
        <p className="auth-switch">
          <a href="/login" onClick={(event) => handleAuthLinkClick(event, "login")}><ArrowLeft size={14} strokeWidth={2.5} /> Back to sign in</a>
        </p>
      </div>
    </section>
  );
}
