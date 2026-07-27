import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/shared/hooks/useAuth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  if (!isOpen) return null;

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = (await signInWithEmail(email, password)) ?? {};
        if (error) throw error;
        onClose();
      } else {
        const { error } = (await signUpWithEmail(email, password)) ?? {};
        if (error) throw error;
        setSuccess("Check your email to confirm your account!");
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] p-4 flex items-center justify-center bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md max-h-[90vh] sm:max-h-[85vh] rounded-2xl p-6 sm:p-8 flex flex-col overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 z-10"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="overflow-y-auto min-h-0 flex-1 pt-2">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-2xl font-bold mb-1">
              <span className="text-emerald-400">Tabi</span>
              <span className="text-white">Map</span>
            </div>
            <p className="text-slate-400 text-sm">
              {mode === "signin"
                ? "Welcome back! Sign in to sync your trips."
                : "Create an account to save your trips."}
            </p>
          </div>

          {/* Social buttons */}
          <div className="flex flex-col gap-3 mb-6">
            {/* Google */}
            <button
              onClick={() => signInWithGoogle()}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-all duration-200 hover:scale-[1.01]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-slate-500 text-xs">
              or continue with email
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {success && (
              <div className="text-emerald-400 text-sm bg-emerald-400/10 rounded-lg px-3 py-2">
                {success}
              </div>
            )}
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all duration-200 hover:scale-[1.01] disabled:opacity-50"
            >
              {loading
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          {/* Toggle */}
          <p className="text-center text-slate-400 text-sm mt-4">
            {mode === "signin"
              ? "Don't have an account? "
              : "Already have an account? "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
                setSuccess("");
              }}
              className="text-emerald-400 hover:text-emerald-300 font-medium"
            >
              {mode === "signin" ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
