import { GemsApiClient } from "@gems/api-client";
import type { UserDashboard } from "@gems/schemas";
import { Eye, EyeOff, UserPlus, X } from "lucide-react";
import { useState, type FormEvent, type MouseEvent } from "react";
import { authClient } from "../../firebase";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import type { View } from "../../shared/types";
import { authErrorMessage, hasAuthErrors, validateSignupFields, type AuthFieldErrors } from "./authValidation";

export function SignupPage({ onSignedIn, onNavigate }: { onSignedIn: (dashboard: UserDashboard) => void; onNavigate: (view: View) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submitAction = useSingleFlightAction();
  const loading = submitAction.busy;

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      password
    };
    const nextErrors = validateSignupFields(values);

    setFieldErrors(nextErrors);
    if (hasAuthErrors(nextErrors)) {
      setFormError("Please fix the highlighted fields and try again.");
      return;
    }

    await submitAction.run(async () => {
      setFormError(null);
      try {
        const createdUser = await authClient.signUp({
          email: values.email,
          password: values.password,
          fullName: values.fullName
        });
        const signupApi = new GemsApiClient("/api/v1", {
          getAccessToken: () => createdUser.getIdToken()
        });
        try {
          await signupApi.updateMe({
            name: values.fullName,
            phone: values.phone,
            address: values.address
          });
        } catch (profileError) {
          const details = profileError instanceof Error ? profileError.message : "Unable to save profile details.";
          throw new Error(`Your account was created, but we could not save your phone number and address. Please sign in and update your profile. ${details}`);
        }

        try {
          onSignedIn(await signupApi.dashboard());
        } catch (dashboardError) {
          const details = dashboardError instanceof Error ? dashboardError.message : "Unable to load profile details.";
          throw new Error(`Your account and contact details were saved, but we could not load your profile right away. Please refresh or sign in again. ${details}`);
        }
      } catch (error) {
        setFormError(authErrorMessage(error, "Unable to create your account."));
      }
    });
  };

  const handleAuthLinkClick = (event: MouseEvent<HTMLAnchorElement>, nextView: View) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(nextView);
  };

  return (
    <section className="login-screen signup-screen">
      <div className="login-visual" aria-hidden="true">
        <div className="login-visual-content">
          <h2>Start selling and sourcing gemstones with confidence</h2>
          <p>Create a secure buyer or seller account with verified contact details.</p>
        </div>
      </div>
      <div className="login-panel">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 34, letterSpacing: "-0.02em", fontWeight: 800, margin: "0 0 10px", color: "var(--ink)" }}>
            Create your account
          </h1>
          <p>Add your contact details once so buyers, sellers, and your listings stay easy to manage.</p>
        </div>
        {formError && (
          <div className="auth-error-popup" role="alert" aria-live="assertive">
            <span>{formError}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setFormError(null)}>
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
        <form className="login-form signup-form" onSubmit={createAccount} noValidate>
          <label>
            <span className="auth-label-text">Full name <span className="required-marker" aria-hidden="true">*</span></span>
            <input
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setFieldErrors((current) => ({ ...current, fullName: undefined }));
              }}
              type="text"
              autoComplete="name"
              required
              aria-invalid={Boolean(fieldErrors.fullName)}
              aria-describedby={fieldErrors.fullName ? "signup-full-name-error" : undefined}
              placeholder="Your full name"
            />
            {fieldErrors.fullName && <span className="field-error" id="signup-full-name-error">{fieldErrors.fullName}</span>}
          </label>
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
              aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
              placeholder="you@example.com"
            />
            {fieldErrors.email && <span className="field-error" id="signup-email-error">{fieldErrors.email}</span>}
          </label>
          <label>
            <span className="auth-label-text">Phone number <span className="required-marker" aria-hidden="true">*</span></span>
            <input
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setFieldErrors((current) => ({ ...current, phone: undefined }));
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? "signup-phone-error" : undefined}
              placeholder="0769715227"
            />
            {fieldErrors.phone && <span className="field-error" id="signup-phone-error">{fieldErrors.phone}</span>}
          </label>
          <label>
            <span className="auth-label-text">Password <span className="required-marker" aria-hidden="true">*</span></span>
            <div className="password-field">
              <input
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "signup-password-error" : undefined}
                placeholder="At least 6 characters"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
              </button>
            </div>
            {fieldErrors.password && <span className="field-error" id="signup-password-error">{fieldErrors.password}</span>}
          </label>
          <label className="auth-field-wide">
            <span className="auth-label-text">Address <span className="required-marker" aria-hidden="true">*</span></span>
            <textarea
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setFieldErrors((current) => ({ ...current, address: undefined }));
              }}
              rows={3}
              autoComplete="street-address"
              required
              aria-invalid={Boolean(fieldErrors.address)}
              aria-describedby={fieldErrors.address ? "signup-address-error" : undefined}
              placeholder="Street address, city, district"
            />
            {fieldErrors.address && <span className="field-error" id="signup-address-error">{fieldErrors.address}</span>}
          </label>
          <button className="primary-action auth-field-wide" type="submit" id="signup-page-submit" disabled={loading}>
            {loading ? <span className="button-spinner" aria-hidden="true" /> : <UserPlus size={18} strokeWidth={2.4} />}
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="auth-switch">Already have an account? <a href="/login" onClick={(event) => handleAuthLinkClick(event, "login")}>Sign in</a></p>
      </div>
    </section>
  );
}
