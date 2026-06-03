import { useState } from "react";

export function AdminLogin({ error, loading, onLogin }: { error: string | null; loading: boolean; onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="admin-login-screen">
      <section className="admin-login-card">
        <div className="brand-mark" style={{ width: 56, height: 56, margin: "0 auto", borderRadius: "16px", background: "var(--emerald)", boxShadow: "0 12px 24px rgba(8, 113, 92, 0.3)" }}>
          <img src="/assets/logo-mark.svg" alt="" />
        </div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ marginBottom: 6 }}>Admin Sign In</h1>
        </div>
        <form
          className="admin-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(email, password);
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
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in to console"}
          </button>
        </form>
      </section>
    </main>
  );
}


