import { ArrowLeft, Mail, X } from "lucide-react";
import { useState, type FormEvent, type MouseEvent } from "react";
import { authClient } from "../../firebase";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import type { View } from "../../shared/types";
import { authErrorMessage, hasAuthErrors, validatePasswordResetFields, type AuthFieldErrors } from "./authValidation";

export function ForgotPasswordPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submitAction = useSingleFlightAction();
  const loading = submitAction.busy;

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

    await submitAction.run(async () => {
      setSent(false);
      setFormError(null);
      try {
        await authClient.sendPasswordReset({ email: normalizedEmail });
        setSent(true);
      } catch (error) {
        setFormError(authErrorMessage(error, "Unable to send a reset link."));
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
      <div className="login-visual-animated" aria-hidden="true">
        <img src="/assets/auth-password.jpg" alt="" className="auth-image" />
      </div>
      <div className="login-panel">
        <div className="auth-header">
          <h1 className="auth-title">
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
            If an account exists for this email address, a password-reset link has been sent.
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
