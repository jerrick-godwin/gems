import { LogIn } from "lucide-react";
import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../../firebase";

export function LoginPage({ onSignedIn, initialSignUp = false }: { onSignedIn: () => void, initialSignUp?: boolean }) {
  const [status, setStatus] = useState<string | null>(null);

  const signIn = async () => {
    setStatus("Opening Google sign in...");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setStatus("Signed in.");
      onSignedIn();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign in.");
    }
  };

  return (
    <section className="login-screen">
      <div className="login-visual">
        <div className="login-visual-content">
          <h2>Discover the World's Finest Gems</h2>
          <p>Join Gems Marketplace and access a curated collection of premium sapphires, rubies, and precious stones.</p>
        </div>
      </div>
      <div className="login-panel">
        <div className="brand-mark" style={{ width: 56, height: 56, marginBottom: 16 }}>
          <img src="/assets/logo-mark.svg" alt="" />
        </div>
        <div>
          <h1>{initialSignUp ? "Create your account" : "Sign in to Gems Marketplace"}</h1>
          <p>Use your secure marketplace account to manage listings, saved gems, cart, checkout, settings, and order history.</p>
        </div>
        <div className="login-actions">
          <button className="primary-action" onClick={() => void signIn()} id="login-page-submit">
            <LogIn size={18} strokeWidth={2.4} />
            Sign in with Google
          </button>
        </div>
        {status && <p style={{ color: "var(--sage)", fontWeight: 600, margin: 0, textAlign: "center", marginTop: 16 }}>{status}</p>}
      </div>
    </section>
  );
}


