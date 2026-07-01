import { ArrowLeft, Check, CreditCard, Eye, EyeOff, LogIn, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { GemsApiClient } from "@gems/api-client";
import { formatLkr, quoteListingSubscription, type ListingCheckoutSession, type ListingSubscriptionPlan, type UserDashboard } from "@gems/schemas";
import { authClient } from "../../firebase";
import { publicErrorMessage } from "../../shared/helpers";
import { createIdempotencyKey, useSingleFlightAction } from "../../shared/useSingleFlightAction";
import type { View } from "../../shared/types";
import { authErrorMessage, hasAuthErrors, validateLoginFields, validateSignupFields, type AuthFieldErrors } from "./authValidation";

type AuthMode = "login" | "signup";

export function PostGemCheckout({
  token,
  api,
  subscriptionPlans,
  isSignedIn,
  authResolved,
  onDashboardChange,
  onNavigate,
  onEditListing
}: {
  token: string;
  api: GemsApiClient;
  subscriptionPlans: ListingSubscriptionPlan[];
  isSignedIn: boolean;
  authResolved: boolean;
  onDashboardChange: (dashboard: UserDashboard) => void;
  onNavigate: (view: View) => void;
  onEditListing: (token: string) => void;
}) {
  const [session, setSession] = useState<ListingCheckoutSession | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("pro");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const completeAction = useSingleFlightAction();
  const activePlan = subscriptionPlans.find((plan) => plan.id === selectedPlanId) ?? subscriptionPlans[0];
  const photoCount = session?.media.filter((item) => item.kind === "photo").length ?? 0;
  const quote = useMemo(() => activePlan ? quoteListingSubscription(activePlan, photoCount) : null, [activePlan, photoCount]);

  useEffect(() => {
    let active = true;
    setLoadingError(null);
    setSession(null);

    if (!token) {
      setLoadingError("Checkout session not found.");
      return;
    }

    api.listingCheckoutSession(token)
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setSelectedPlanId(nextSession.selectedPlanId ?? "pro");
        setAcceptedPolicies(nextSession.acceptedPolicies);
      })
      .catch((error) => {
        if (active) setLoadingError(publicErrorMessage(error, "Checkout session not found or expired."));
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  const persistCheckoutState = (nextPlanId: string, nextAcceptedPolicies: boolean) => {
    if (!token || !session) return;
    void api.updateListingCheckoutSession(token, {
      selectedPlanId: nextPlanId,
      acceptedPolicies: nextAcceptedPolicies
    }).catch((error) => {
      setStatus(publicErrorMessage(error, "Unable to save checkout changes."));
    });
  };

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    persistCheckoutState(planId, acceptedPolicies);
  };

  const handlePolicyChange = (checked: boolean) => {
    setAcceptedPolicies(checked);
    persistCheckoutState(selectedPlanId, checked);
  };

  const handlePayment = async () => {
    if (!session || !quote) return;
    if (!isSignedIn) {
      setStatus("Please sign in or create an account before payment.");
      return;
    }
    if (!acceptedPolicies) {
      setStatus("Terms and Privacy Policy acceptance is required before payment.");
      return;
    }

    await completeAction.run(async () => {
      const checkoutKey = createIdempotencyKey("listing-checkout");
      try {
        setStatus("Creating payment...");
        const paymentIntent = await api.completeListingCheckoutSession(token, {
          selectedPlanId,
          acceptedPolicies
        }, { idempotencyKey: checkoutKey });
        onDashboardChange(await api.dashboard());
        if (paymentIntent.paymentUrl) {
          window.location.href = paymentIntent.paymentUrl;
          return;
        }
        setStatus("Payment intent created. Please contact support if you are not redirected to checkout.");
        completeAction.release();
      } catch (error) {
        setStatus(publicErrorMessage(error, "Unable to start checkout."));
        completeAction.release();
      }
    }, { keepLocked: true });
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>, view: View) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(view);
  };

  const handleEditLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onEditListing(token);
  };

  if (loadingError || !token) {
    return (
      <section className="workspace-grid">
        <div className="workspace-main checkout-empty-state">
          <h1>Checkout session unavailable</h1>
          <p>{loadingError ?? "Checkout session not found."}</p>
          <button type="button" className="primary-action" onClick={() => onNavigate("post")}>
            <ArrowLeft size={17} strokeWidth={2.3} />
            Back to Post a Gem
          </button>
        </div>
      </section>
    );
  }

  if (!session || !quote) {
    return (
      <section className="workspace-grid">
        <div className="workspace-main checkout-empty-state">
          <span className="button-spinner" aria-hidden="true" />
          <p>Loading checkout...</p>
        </div>
      </section>
    );
  }

  const certificate = session.media.find((item) => item.kind === "certificate");
  const isCompleting = completeAction.busy || status === "Creating payment...";

  return (
    <section className="checkout-page listing-checkout-page">
      <div className="checkout-heading">
        <a href={`/post?checkoutToken=${encodeURIComponent(token)}`} onClick={handleEditLinkClick}>
          <ArrowLeft size={16} strokeWidth={2.4} />
          Edit listing
        </a>
        <h1>Listing Checkout</h1>
      </div>

      <div className="checkout-grid">
        <div className="checkout-form-stack">
          {!authResolved ? (
            <section className="checkout-panel">
              <h2>Account</h2>
              <p className="checkout-muted">Checking your sign-in status.</p>
            </section>
          ) : !isSignedIn ? (
            <InlineCheckoutAuth mode={authMode} setMode={setAuthMode} onDashboardChange={onDashboardChange} />
          ) : null}

          <section className="checkout-panel" aria-labelledby="checkout-plan-heading">
            <div className="checkout-panel-title">
              <h2 id="checkout-plan-heading">Choose your Subscription</h2>
            </div>
            <div className="plan-grid">
              {subscriptionPlans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                return (
                  <label className={`plan-option plan-option-${plan.id} ${isSelected ? "selected" : ""}`} key={plan.id}>
                    <input type="radio" name="checkout-plan" value={plan.id} checked={isSelected} onChange={() => handlePlanChange(plan.id)} disabled={isCompleting} />
                    <span className="plan-option-eyebrow">{plan.eyebrow}</span>
                    <strong>{plan.name}</strong>
                    <span className="plan-option-price">{formatLkr(plan.priceLkr)}</span>
                    <small className="plan-option-summary">{plan.summary}</small>
                    <span className="plan-feature">
                      <Check size={15} strokeWidth={2.6} />
                      {plan.includedPhotos} photos included
                    </span>
                    <span className="plan-feature">
                      <Check size={15} strokeWidth={2.6} />
                      {plan.validityMonths} month{plan.validityMonths > 1 ? "s" : ""} of advertisement validity
                    </span>
                    <span className="plan-extra">Extra photos: {formatLkr(plan.extraPhotoPriceLkr)} each</span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="checkout-summary-panel">
          <div className="checkout-summary-title">
            <h2>Order Summary</h2>
          </div>
          <div className="listing-checkout-preview">
            {session.media.filter((item) => item.kind === "photo").slice(0, 3).map((item) => (
              <div className="listing-checkout-thumb" key={item.id}>
                {item.readUrl ? <img src={item.readUrl} alt={item.fileName} /> : <span>{item.fileName}</span>}
              </div>
            ))}
          </div>
          <div className="checkout-summary-copy">
            <strong>{session.draft.title}</strong>
            <span>{session.draft.attributes.carat} ct · {session.draft.attributes.color} · {session.draft.location}</span>
            <em>{photoCount} photo{photoCount === 1 ? "" : "s"}{certificate ? " · Certificate included" : ""}</em>
          </div>
          <div className="listing-checkout-amount-card" aria-label="Payment breakdown">
            <div className="listing-checkout-amount-row">
              <div className="listing-checkout-amount-copy">
                <span>Listing subscription</span>
                <strong>{quote.plan.name} plan</strong>
                <small>{quote.plan.validityMonths} month{quote.plan.validityMonths === 1 ? "" : "s"} of advertisement validity</small>
              </div>
              <span className="listing-checkout-price">
                <small>LKR</small>
                {quote.basePriceLkr.toLocaleString("en-US")}
              </span>
            </div>
            {quote.extraPhotoCount > 0 && (
              <div className="listing-checkout-amount-row">
                <div className="listing-checkout-amount-copy">
                  <span>Additional media</span>
                  <strong>{quote.extraPhotoCount} extra photo{quote.extraPhotoCount === 1 ? "" : "s"}</strong>
                  <small>{quote.plan.includedPhotos} photos included in this plan</small>
                </div>
                <span className="listing-checkout-price">
                  <small>LKR</small>
                  {quote.extraPhotoTotalLkr.toLocaleString("en-US")}
                </span>
              </div>
            )}
            {quote.extraPhotoCount === 0 && (
              <div className="listing-checkout-included-note">
                <Check size={15} strokeWidth={2.6} />
                <span>All {photoCount} photo{photoCount === 1 ? "" : "s"} included in this plan</span>
              </div>
            )}
            <div className="listing-checkout-total-row">
              <div>
                <span>Total due today</span>
                <strong>Total Amount</strong>
              </div>
              <span className="listing-checkout-total-price">
                <small>LKR</small>
                {quote.totalLkr.toLocaleString("en-US")}
              </span>
            </div>
          </div>
          <label className="policy-acceptance listing-checkout-policy">
            <input type="checkbox" checked={acceptedPolicies} onChange={(event) => handlePolicyChange(event.target.checked)} disabled={isCompleting} required />
            <span>
              I accept the{" "}
              <a href="/terms-and-conditions" target="_blank" rel="noreferrer">
                Terms and Conditions
              </a>
              {" "}and{" "}
              <a href="/privacy-policy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
              <span className="required-marker" aria-hidden="true">*</span>
            </span>
          </label>
          <button className="checkout-submit" type="button" onClick={() => void handlePayment()} disabled={!isSignedIn || !acceptedPolicies || isCompleting}>
            {isCompleting ? <span className="button-spinner" aria-hidden="true" /> : <CreditCard size={18} strokeWidth={2.4} />}
            {isCompleting ? "Creating payment..." : "Proceed to Payment"}
          </button>
        </aside>
      </div>
    </section>
  );
}

function InlineCheckoutAuth({
  mode,
  setMode,
  onDashboardChange
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onDashboardChange: (dashboard: UserDashboard) => void;
}) {
  return (
    <section className="checkout-panel listing-checkout-auth">
      <div className="checkout-panel-title">
        <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
        <div className="checkout-auth-toggle">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button>
        </div>
      </div>
      {mode === "login" ? <InlineLoginForm /> : <InlineSignupForm onDashboardChange={onDashboardChange} />}
    </section>
  );
}

function InlineLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submitAction = useSingleFlightAction();

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    const nextErrors = validateLoginFields({ email: normalizedEmail, password });
    setFieldErrors(nextErrors);
    if (hasAuthErrors(nextErrors)) {
      setFormError("Please fix the highlighted fields and try again.");
      return;
    }

    await submitAction.run(async () => {
      setFormError(null);
      try {
        await authClient.signIn({ email: normalizedEmail, password });
      } catch (error) {
        setFormError(authErrorMessage(error, "Unable to sign in."));
      }
    });
  };

  return (
    <>
      {formError && <InlineAuthError message={formError} onDismiss={() => setFormError(null)} />}
      <form className="login-form checkout-auth-form" onSubmit={authenticate} noValidate>
        <label>
          <span className="auth-label-text">Email address <span className="required-marker" aria-hidden="true">*</span></span>
          <input value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => ({ ...current, email: undefined })); }} type="email" autoComplete="username" required aria-invalid={Boolean(fieldErrors.email)} placeholder="you@example.com" />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </label>
        <label>
          <span className="auth-label-text">Password <span className="required-marker" aria-hidden="true">*</span></span>
          <div className="password-field">
            <input value={password} onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => ({ ...current, password: undefined })); }} type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={6} aria-invalid={Boolean(fieldErrors.password)} placeholder="Your password" />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
            </button>
          </div>
          {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
        </label>
        <button className="primary-action" type="submit" disabled={submitAction.busy}>
          {submitAction.busy ? <span className="button-spinner" aria-hidden="true" /> : <LogIn size={18} strokeWidth={2.4} />}
          {submitAction.busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </>
  );
}

function InlineSignupForm({ onDashboardChange }: { onDashboardChange: (dashboard: UserDashboard) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submitAction = useSingleFlightAction();

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
        await signupApi.updateMe({
          name: values.fullName,
          phone: values.phone,
          address: values.address
        });
        onDashboardChange(await signupApi.dashboard());
      } catch (error) {
        setFormError(authErrorMessage(error, "Unable to create your account."));
      }
    });
  };

  return (
    <>
      {formError && <InlineAuthError message={formError} onDismiss={() => setFormError(null)} />}
      <form className="login-form signup-form checkout-auth-form" onSubmit={createAccount} noValidate>
        <label>
          <span className="auth-label-text">Full name <span className="required-marker" aria-hidden="true">*</span></span>
          <input value={fullName} onChange={(event) => { setFullName(event.target.value); setFieldErrors((current) => ({ ...current, fullName: undefined })); }} type="text" autoComplete="name" required aria-invalid={Boolean(fieldErrors.fullName)} placeholder="Your full name" />
          {fieldErrors.fullName && <span className="field-error">{fieldErrors.fullName}</span>}
        </label>
        <label>
          <span className="auth-label-text">Email address <span className="required-marker" aria-hidden="true">*</span></span>
          <input value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => ({ ...current, email: undefined })); }} type="email" autoComplete="username" required aria-invalid={Boolean(fieldErrors.email)} placeholder="you@example.com" />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </label>
        <label>
          <span className="auth-label-text">Phone number <span className="required-marker" aria-hidden="true">*</span></span>
          <input value={phone} onChange={(event) => { setPhone(event.target.value); setFieldErrors((current) => ({ ...current, phone: undefined })); }} type="tel" inputMode="tel" autoComplete="tel" required aria-invalid={Boolean(fieldErrors.phone)} placeholder="0769715227" />
          {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
        </label>
        <label>
          <span className="auth-label-text">Password <span className="required-marker" aria-hidden="true">*</span></span>
          <div className="password-field">
            <input value={password} onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => ({ ...current, password: undefined })); }} type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} aria-invalid={Boolean(fieldErrors.password)} placeholder="At least 6 characters" />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
            </button>
          </div>
          {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
        </label>
        <label className="auth-field-wide">
          <span className="auth-label-text">Address <span className="required-marker" aria-hidden="true">*</span></span>
          <textarea value={address} onChange={(event) => { setAddress(event.target.value); setFieldErrors((current) => ({ ...current, address: undefined })); }} rows={3} autoComplete="street-address" required aria-invalid={Boolean(fieldErrors.address)} placeholder="Street address, city, district" />
          {fieldErrors.address && <span className="field-error">{fieldErrors.address}</span>}
        </label>
        <button className="primary-action auth-field-wide" type="submit" disabled={submitAction.busy}>
          {submitAction.busy ? <span className="button-spinner" aria-hidden="true" /> : <UserPlus size={18} strokeWidth={2.4} />}
          {submitAction.busy ? "Creating account..." : "Create account"}
        </button>
      </form>
    </>
  );
}

function InlineAuthError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="auth-error-popup" role="alert" aria-live="assertive">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss error" onClick={onDismiss}>
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
