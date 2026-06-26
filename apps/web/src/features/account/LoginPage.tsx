import { LogIn, X } from "lucide-react";
import { useState, type FormEvent, type MouseEvent } from "react";
import { authClient } from "../../firebase";
import type { View } from "../../shared/types";
import { authErrorMessage, hasAuthErrors, validateLoginFields, type AuthFieldErrors } from "./authValidation";

export function LoginPage({ onSignedIn, onNavigate }: { onSignedIn: () => void; onNavigate: (view: View) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const nextErrors = validateLoginFields({ email: normalizedEmail, password });

    setFieldErrors(nextErrors);
    if (hasAuthErrors(nextErrors)) {
      setFormError("Please fix the highlighted fields and try again.");
      return;
    }

    setLoading(true);
    setFormError(null);
    try {
      await authClient.signIn({ email: normalizedEmail, password });
      onSignedIn();
    } catch (error) {
      setFormError(authErrorMessage(error, "Unable to sign in."));
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
          <h2>Sri Lanka's Premier Gemstone Marketplace</h2>
          <p>Connecting trusted sellers with discerning buyers since 2024.</p>
        </div>
      </div>
      <div className="login-panel">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 34, letterSpacing: "-0.02em", fontWeight: 800, margin: "0 0 10px", color: "var(--ink)" }}>
            Sign in to gemslanka.lk
          </h1>
          <p>Use your secure account to manage listings, subscriptions, renewal settings, and reports.</p>
        </div>
        {formError && (
          <div className="auth-error-popup" role="alert" aria-live="assertive">
            <span>{formError}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setFormError(null)}>
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
        <form className="login-form" onSubmit={authenticate} noValidate>
          <label>
            <span className="auth-label-text">Email address <span className="required-marker" aria-hidden="true">*</span></span>
            <input
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              type="email"
              autoComplete="username"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
              placeholder="you@example.com"
            />
            {fieldErrors.email && <span className="field-error" id="login-email-error">{fieldErrors.email}</span>}
          </label>
          <label>
            <span className="auth-label-text">Password <span className="required-marker" aria-hidden="true">*</span></span>
            <input
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              placeholder="Your password"
            />
            {fieldErrors.password && <span className="field-error" id="login-password-error">{fieldErrors.password}</span>}
          </label>
          <a className="forgot-password-link" href="/forgot-password" onClick={(event) => handleAuthLinkClick(event, "forgot_password")}>Forgot password?</a>
          <button className="primary-action" type="submit" id="login-page-submit" disabled={loading}>
            {loading ? <span className="button-spinner" aria-hidden="true" /> : <LogIn size={18} strokeWidth={2.4} />}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">New to gemslanka.lk? <a href="/signup" onClick={(event) => handleAuthLinkClick(event, "signup")}>Create an account</a></p>
      </div>
    </section>
  );
}
