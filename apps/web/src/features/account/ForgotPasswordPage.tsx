import { ArrowLeft, Mail, X } from "lucide-react";
import { useState, type FormEvent, type MouseEvent } from "react";
import { authClient } from "../../firebase";
import type { View } from "../../shared/types";
import { authErrorMessage, hasAuthErrors, validatePasswordResetFields, type AuthFieldErrors } from "./authValidation";

export function ForgotPasswordPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendResetLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const nextErrors = validatePasswordResetFields({ email: normalizedEmail });

    setFieldErrors(nextErrors);
    if (hasAuthErrors(nextErrors)) {
      setSent(false);
      setFormError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setSent(false);
    setFormError(null);
    try {
      await authClient.sendPasswordReset({ email: normalizedEmail });
      setSent(true);
    } catch (error) {
      setFormError(authErrorMessage(error, "Unable to send a reset link."));
    } finally {
      setLoading(false);
    }
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
          <p>Reset your password and get back to managing listings, renewals, and reports.</p>
        </div>
      </div>
      <div className="login-panel">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 34, letterSpacing: "-0.02em", fontWeight: 800, margin: "0 0 10px", color: "var(--ink)" }}>
            Forgot password?
          </h1>
          <p>Enter your account email and we will send a secure password reset link if an account exists.</p>
        </div>
        {formError && (
          <div className="auth-error-popup" role="alert" aria-live="assertive">
            <span>{formError}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setFormError(null)}>
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
        {sent && (
          <div className="auth-success-popup" role="status" aria-live="polite">
            Check your inbox for a password reset link. It can take a minute to arrive.
          </div>
        )}
        <form className="login-form" onSubmit={sendResetLink} noValidate>
          <label>
            <span className="auth-label-text">Email address <span className="required-marker" aria-hidden="true">*</span></span>
            <input
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
                setSent(false);
              }}
              type="email"
              autoComplete="username"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "forgot-email-error" : undefined}
              placeholder="you@example.com"
            />
            {fieldErrors.email && <span className="field-error" id="forgot-email-error">{fieldErrors.email}</span>}
          </label>
          <button className="primary-action" type="submit" id="forgot-password-submit" disabled={loading}>
            {loading ? <span className="button-spinner" aria-hidden="true" /> : <Mail size={18} strokeWidth={2.4} />}
            {loading ? "Sending link..." : "Send reset link"}
          </button>
        </form>
        <p className="auth-switch">
          <a href="/login" onClick={(event) => handleAuthLinkClick(event, "login")}><ArrowLeft size={14} strokeWidth={2.5} /> Back to sign in</a>
        </p>
      </div>
    </section>
  );
}
