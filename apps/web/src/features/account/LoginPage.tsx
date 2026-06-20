import { LogIn } from "lucide-react";
import { useState } from "react";
import { authClient } from "../../firebase";

export function LoginPage({ onSignedIn, initialSignUp = false }: { onSignedIn: () => void, initialSignUp?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [loading, setLoading] = useState(false);

  const authenticate = async () => {
    const normalizedEmail = email.trim();
    setLoading(true);
    setStatusTone("neutral");
    setStatus(initialSignUp ? "Creating your account..." : "Signing you in...");
    try {
      await authClient.signInOrSignUp({ email: normalizedEmail, password });
      setStatus(initialSignUp ? "Account ready." : "Signed in.");
      onSignedIn();
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="login-screen">
      <div className="login-visual" aria-hidden="true" />
      <div className="login-panel">
        <div className="brand-mark" style={{ width: 56, height: 56, marginBottom: 16 }}>
          <img src="/assets/logo-mark.svg" alt="" />
        </div>
        <div>
          <h1>{initialSignUp ? "Create your account" : "Sign in to gemslanka.lk"}</h1>
          <p>Use your secure account to manage listings, subscriptions, renewal settings, and reports.</p>
        </div>
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void authenticate();
          }}
        >
          <label>
            Email address
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="username"
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={initialSignUp ? "new-password" : "current-password"}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </label>
          <button className="primary-action" type="submit" id="login-page-submit" disabled={loading}>
            <LogIn size={18} strokeWidth={2.4} />
            {loading ? "Please wait..." : "Continue"}
          </button>
        </form>
        {status && <p className={`login-status ${statusTone === "error" ? "login-status-error" : ""}`}>{status}</p>}
      </div>
    </section>
  );
}
