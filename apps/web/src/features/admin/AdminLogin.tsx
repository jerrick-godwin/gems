import { useState } from "react";

export function AdminLogin({ error, loading, onLogin }: { error: string | null; loading: boolean; onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="admin-login-screen">
      <section className="admin-login-card">
        <div className="brand-mark login-logo admin-login-logo">
          <img src="/assets/gemslanka-logo.png" alt="gemslanka.lk" />
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

