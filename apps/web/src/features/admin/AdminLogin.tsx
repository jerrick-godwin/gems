import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";

export function AdminLogin({ error, loading, onLogin }: { error: string | null; loading: boolean; onLogin: (email: string, password: string) => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginAction = useSingleFlightAction();

  return (
    <main className="admin-login-screen">
      <section className="admin-login-card card card--spacious">
        <div className="brand-mark login-logo admin-login-logo">
          <img src="/assets/gemslanka-logo.png" alt="gemslanka.lk" />
        </div>
        <div className="admin-login-heading">
          <h1>Admin Sign In</h1>
        </div>
        <form
          className="admin-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loginAction.run(async () => {
              await onLogin(email, password);
            });
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
              placeholder="admin@example.com"
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </label>
          {error && <p className="admin-error">{error}</p>}
          <button type="submit" disabled={loginAction.busy || loading} style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "center" }}>
            {(loginAction.busy || loading) && <LoaderCircle className="icon-spinner" size={18} />}
            {loginAction.busy || loading ? "Signing in..." : "Sign in to console"}
          </button>
        </form>
      </section>
    </main>
  );
}
