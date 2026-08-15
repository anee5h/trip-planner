import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MegurutoMark } from "@/shared/components/brand/MegurutoMark";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTranslation } from "react-i18next";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPasswordForEmail,
  } = useAuth();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  if (!isOpen) return null;

  const formatAuthError = (msg?: string) => {
    if (!msg) return t("auth.errors.generic");
    const lower = msg.toLowerCase();
    if (
      lower.includes("invalid login credentials") ||
      lower.includes("invalid credentials")
    ) {
      return t("auth.errors.invalidCredentials");
    }
    if (lower.includes("email not confirmed")) {
      return t("auth.errors.emailNotConfirmed");
    }
    if (
      lower.includes("user already registered") ||
      lower.includes("already registered")
    ) {
      return t("auth.errors.userAlreadyRegistered");
    }
    if (
      lower.includes("at least 6 characters") ||
      lower.includes("password should be at least")
    ) {
      return t("auth.errors.passwordTooShort");
    }
    if (lower.includes("rate limit") || lower.includes("too many requests")) {
      return t("auth.errors.rateLimitExceeded");
    }
    if (lower.includes("network") || lower.includes("fetch")) {
      return t("auth.errors.networkError");
    }
    return msg;
  };

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
        setSuccess(t("auth.confirmEmailSent"));
      }
    } catch (err: any) {
      setError(formatAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setSuccess("");
    if (!email) {
      setError(t("auth.resetEmailRequired"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await resetPasswordForEmail(email);
      if (error) throw error;
      setSuccess(t("auth.resetEmailSent"));
    } catch (err: any) {
      setError(formatAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] p-4 flex items-center justify-center bg-slate-950/50 dark:bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        data-testid="auth-modal-card"
        className="relative w-full max-w-md max-h-[90vh] sm:max-h-[85vh] rounded-2xl p-6 sm:p-8 flex flex-col overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label={t("actions.close")}
          className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <svg
            width="18"
            height="18"
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
            <div className="mb-4 flex items-center justify-center gap-2 text-[21px] font-bold leading-none">
              <span
                data-testid="auth-brand-mark-frame"
                className="inline-flex rounded-[10px] bg-slate-50 p-[2px] ring-1 ring-slate-200 shadow-sm dark:bg-white dark:ring-white/70"
              >
                <MegurutoMark className="size-7" />
              </span>
              <span className="text-[21px] font-bold leading-none tracking-tight">
                <span className="text-emerald-600 dark:text-emerald-300">
                  Meguru
                </span>
                <span className="text-slate-950 dark:text-white">to</span>
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
              {mode === "signin"
                ? t("auth.signInTitle")
                : t("auth.signUpTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {mode === "signin"
                ? t("auth.signInPrompt")
                : t("auth.signUpPrompt")}
            </p>
          </div>

          {/* Social buttons */}
          <div className="flex flex-col gap-3 mb-6">
            {/* Google */}
            <button
              onClick={() => signInWithGoogle()}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white dark:bg-white text-gray-800 font-medium text-sm border border-slate-200 dark:border-transparent hover:bg-slate-50 dark:hover:bg-gray-100 transition-all duration-200 hover:scale-[1.01]"
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
              {t("auth.continueWithGoogle")}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
            <span className="text-slate-500 dark:text-slate-500 text-xs">
              {t("auth.orContinueWithEmail")}
            </span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            {error && (
              <div className="text-red-700 dark:text-red-400 text-sm bg-red-50 dark:bg-red-400/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {success && (
              <div className="text-emerald-700 dark:text-emerald-400 text-sm bg-emerald-50 dark:bg-emerald-400/10 rounded-lg px-3 py-2">
                {success}
              </div>
            )}
            <input
              type="email"
              placeholder={t("auth.emailAddress")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:placeholder:text-slate-400"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border px-4 py-3 pr-14 text-sm outline-none border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 flex h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {showPassword ? t("actions.hide") : t("actions.show")}
              </button>
            </div>
            {mode === "signin" && (
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={loading}
                className="self-start text-sm font-medium text-emerald-700 hover:text-emerald-600 disabled:opacity-50 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                {t("auth.forgotPassword")}
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all duration-200 hover:scale-[1.01] disabled:opacity-50"
            >
              {loading
                ? t("actions.pleaseWait")
                : mode === "signin"
                  ? t("actions.signIn")
                  : t("actions.createAccount")}
            </button>
            {mode === "signup" && (
              <p className="text-center text-xs leading-relaxed text-slate-500">
                {t("auth.legalPrefix")}{" "}
                <Link
                  to="/terms"
                  onClick={onClose}
                  className="text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                >
                  {t("legal.terms")}
                </Link>{" "}
                {t("auth.legalAnd")}{" "}
                <Link
                  to="/privacy"
                  onClick={onClose}
                  className="text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                >
                  {t("legal.privacy")}
                </Link>
                {t("auth.legalSuffix")}
              </p>
            )}
          </form>

          {/* Toggle */}
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-4">
            {mode === "signin" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
                setSuccess("");
              }}
              className="text-emerald-700 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
            >
              {mode === "signin" ? t("actions.signUp") : t("actions.signIn")}
            </button>
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
