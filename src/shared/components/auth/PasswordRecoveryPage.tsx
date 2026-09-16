import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/shared/hooks/useAuth";

const MIN_PASSWORD_LENGTH = 6;

type ResetError = "short" | "mismatch" | "generic" | "network";

function errorKey(
  error: ResetError,
):
  | "auth.errors.passwordTooShort"
  | "auth.errors.passwordsDoNotMatch"
  | "auth.errors.generic"
  | "auth.errors.networkError" {
  if (error === "short") return "auth.errors.passwordTooShort";
  if (error === "mismatch") return "auth.errors.passwordsDoNotMatch";
  if (error === "network") return "auth.errors.networkError";
  return "auth.errors.generic";
}

export function PasswordRecoveryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    loading: authLoading,
    isPasswordRecovery,
    clearPasswordRecovery,
    updatePassword,
    resetPasswordForEmail,
  } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<ResetError | null>(null);
  const [resendMessage, setResendMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [completed, setCompleted] = useState(false);

  const continueToMeguruto = () => {
    clearPasswordRecovery();
    navigate("/", { replace: true });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResendMessage("");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError("short");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("mismatch");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await updatePassword(newPassword);
      if (updateError) {
        const message = updateError.message.toLowerCase();
        setError(
          message.includes("network") || message.includes("fetch")
            ? "network"
            : "generic",
        );
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setCompleted(true);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message.toLowerCase() : "";
      setError(
        message.includes("network") || message.includes("fetch")
          ? "network"
          : "generic",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResendMessage("");
    if (!email.trim()) {
      setResendMessage(t("auth.resetEmailRequired"));
      return;
    }
    setResending(true);
    try {
      const { error: resetError } = await resetPasswordForEmail(email.trim());
      if (resetError) {
        setResendMessage(t("auth.errors.generic"));
        return;
      }
      setResendMessage(t("auth.resetEmailSent"));
    } catch {
      setResendMessage(t("auth.errors.networkError"));
    } finally {
      setResending(false);
    }
  };

  if (authLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center justify-center px-4 py-12">
        <p className="text-sm text-slate-500">{t("actions.pleaseWait")}</p>
      </section>
    );
  }

  if (!isPasswordRecovery || !user) {
    return (
      <section className="mx-auto w-full max-w-lg px-4 py-12 sm:py-20">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-8">
          <KeyRound
            className="mb-4 h-8 w-8 text-emerald-700"
            aria-hidden="true"
          />
          <h1 className="text-xl font-bold text-slate-950 dark:text-white">
            {t("auth.resetInvalidTitle")}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t("auth.resetInvalidHelp")}
          </p>
          <label className="mt-6 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("auth.emailAddress")}
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
          {resendMessage && (
            <p
              className="mt-3 text-sm text-slate-600 dark:text-slate-300"
              role="status"
            >
              {resendMessage}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resending}
            className="mt-5 min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {resending
              ? t("actions.pleaseWait")
              : t("auth.sendAnotherResetEmail")}
          </button>
        </div>
      </section>
    );
  }

  if (completed) {
    return (
      <section className="mx-auto w-full max-w-lg px-4 py-12 sm:py-20">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-8">
          <CheckCircle2
            className="mx-auto h-10 w-10 text-emerald-700"
            aria-hidden="true"
          />
          <h1 className="mt-4 text-xl font-bold text-slate-950 dark:text-white">
            {t("auth.passwordUpdatedTitle")}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t("auth.passwordUpdatedHelp")}
          </p>
          <button
            type="button"
            onClick={continueToMeguruto}
            className="mt-6 min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"
          >
            {t("auth.continueToMeguruto")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-12 sm:py-20">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-8">
        <KeyRound
          className="mb-4 h-8 w-8 text-emerald-700"
          aria-hidden="true"
        />
        <h1 className="text-xl font-bold text-slate-950 dark:text-white">
          {t("auth.resetPasswordTitle")}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {t("auth.resetPasswordHelp")}
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && (
            <p
              className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"
              role="alert"
            >
              {t(errorKey(error))}
            </p>
          )}
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("auth.newPassword")}
            <input
              type="password"
              name="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("auth.confirmNewPassword")}
            <input
              type="password"
              name="confirm-new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-500/25 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {submitting ? t("actions.pleaseWait") : t("auth.updatePassword")}
          </button>
        </form>
      </div>
    </section>
  );
}

export default PasswordRecoveryPage;
