import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Provider } from "@supabase/supabase-js";
import {
  X,
  User as UserIcon,
  MapPin,
  Calendar,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/shared/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  requestAccountDeletion,
  type AccountDeletionResult,
} from "@/shared/utils/accountDeletion";
import { markAccountDeletionPending } from "@/shared/utils/pendingAccountDeletion";
import {
  clearAccountDeletionPending,
  takeAccountDeletionResult,
} from "@/shared/utils/pendingAccountDeletion";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { t } = useTranslation();
  const { user, updateUserProfile, clearProfileData, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(
    null,
  );
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteReauthPassword, setDeleteReauthPassword] = useState("");

  const [username, setUsername] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [dob, setDob] = useState("");
  const [units, setUnits] = useState("metric");
  const [emailNotifications, setEmailNotifications] = useState(false);

  useEffect(() => {
    if (user?.user_metadata) {
      setUsername(user.user_metadata.username || "");
      setHomeCity(user.user_metadata.home_city || "");
      setDob(user.user_metadata.dob || "");
      setUnits(user.user_metadata.units || "metric");
      setEmailNotifications(user.user_metadata.emailNotifications || false);
    }
    setSuccess(false);
    setDeleteConfirm(false);
    setDeleteAccountConfirm(false);
    setDeleteTyped("");
    setDeleteAccountError(null);
    setDeleteReauthPassword("");
  }, [user, isOpen]);

  // KAI-44: surface a preserved OAuth-return outcome (partial failure,
  // auth failure, unknown network outcome, account mismatch) with the same
  // localized outcome model as the direct path.
  useEffect(() => {
    const pendingResult = takeAccountDeletionResult();
    if (pendingResult && !pendingResult.ok) {
      setDeleteAccountConfirm(true);
      setDeleteAccountError(deletionFailureMessage(pendingResult));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** KAI-44: provider classification for the reauthentication gate. */
  const authProvider =
    user?.app_metadata?.provider ?? user?.identities?.[0]?.provider ?? null;
  const isPasswordAccount = authProvider === "email";

  /** "google" -> "Google" for reauthentication copy. */
  const providerDisplayName = (provider: string | null): string =>
    provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "";

  /**
   * KAI-44: localized outcome model shared by the direct path and the
   * OAuth-return surface — partial failures, retry safety, session
   * expiry, account mismatch and unknown network outcomes are all
   * represented honestly.
   */
  const deletionFailureMessage = (
    result: Extract<AccountDeletionResult, { ok: false }>,
  ): string => {
    switch (result.error) {
      case "invalid_session":
        return t("settings.deleteAccountSessionExpired");
      case "reauth_required":
        return t("settings.deleteAccountReauthRequired");
      case "reauth_failed":
        return t("settings.deleteAccountPasswordInvalid");
      case "account_mismatch":
        return t("settings.deleteAccountMismatch");
      case "data_deletion_failed": {
        const anyDeleted = Object.values(result.deleted ?? {}).some(Boolean);
        return anyDeleted
          ? t("settings.deleteAccountPartialError")
          : t("settings.deleteAccountError");
      }
      case "auth_delete_failed":
        return t("settings.deleteAccountAuthFailed");
      case "network_error":
        return t("settings.deleteAccountNetworkError");
      default:
        return t("settings.deleteAccountError");
    }
  };

  /**
   * KAI-44: post-deletion outcome handling. Only a DEFINITIVE invalid
   * session (getUser 401 — the Auth user no longer exists) counts as
   * completed deletion after an ambiguous network failure; transport
   * errors / 5xx stay an unknown outcome and never claim success.
   */
  const handleDeletionResult = async (
    result: AccountDeletionResult,
  ): Promise<boolean> => {
    if (result.ok) {
      await signOut?.();
      onClose();
      return true;
    }
    if (result.error === "network_error") {
      let status: number | undefined;
      try {
        const { error } = await supabase!.auth.getUser();
        status = (error as { status?: number } | null)?.status;
      } catch {
        // Reconciliation itself failed (network/service) — unknown.
      }
      if (status === 401) {
        // The session is definitively invalid: the account is gone.
        await signOut?.();
        onClose();
        return true;
      }
    }
    setDeleteAccountError(deletionFailureMessage(result));
    return false;
  };

  /**
   * KAI-44: OAuth reauthentication — started ONLY from the single
   * destructive continuation (the typed-confirmation button). Marks an
   * identity-bound intent, then starts the provider round-trip; the
   * redirect-return handler completes the deletion (see
   * pendingAccountDeletion).
   */
  const handleOauthReauthenticate = async (): Promise<void> => {
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const provider = authProvider as Provider;
      const persisted = markAccountDeletionPending({
        userId: user!.id,
        provider,
        createdAt: Date.now(),
      });
      if (!persisted) {
        // The intent cannot be persisted — abort BEFORE the redirect so a
        // destructive continuation is never launched without its binding.
        setDeleteAccountError(t("settings.deleteAccountError"));
        return;
      }
      const { error } = await supabase!.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });
      if (error) {
        clearAccountDeletionPending();
        setDeleteAccountError(t("settings.deleteAccountOauthFailed"));
      }
      // On success the page redirects to the provider; the deletion runs
      // on return.
    } catch {
      clearAccountDeletionPending();
      setDeleteAccountError(t("settings.deleteAccountOauthFailed"));
    } finally {
      setDeletingAccount(false);
    }
  };

  /**
   * KAI-44: server-authorized account deletion via the Pages Function,
   * which enforces recent authentication server-side (password grant for
   * password accounts, fresh amr/OTP-verified session for OAuth accounts).
   */
  const handleDeleteAccount = async (): Promise<void> => {
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        setDeleteAccountError(t("settings.deleteAccountSessionExpired"));
        return;
      }

      if (isPasswordAccount) {
        if (!deleteReauthPassword) {
          setDeleteAccountError(t("settings.deleteAccountPasswordPrompt"));
          return;
        }
        const result = await requestAccountDeletion(token, {
          reauthMode: "password",
          email: user!.email ?? "",
          password: deleteReauthPassword,
        });
        await handleDeletionResult(result);
        return;
      }

      // OAuth path: the typed confirmation button is the single
      // destructive continuation — it marks the identity-bound intent and
      // starts the fresh provider sign-in. The redirect-return handler
      // (pendingAccountDeletion) enforces userId continuity and the
      // server enforces amr recency.
      await handleOauthReauthenticate();
    } catch {
      setDeleteAccountError(t("settings.deleteAccountError"));
    } finally {
      setDeletingAccount(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    try {
      const { error } = await updateUserProfile({
        username,
        home_city: homeCity,
        dob,
        units,
        emailNotifications,
      });

      if (error) {
        console.error("Failed to update profile", error);
      } else {
        setSuccess(true);
        setTimeout(() => onClose(), 1500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Edit Profile
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Username
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="How should we call you?"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Home City
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Where do you live?"
                value={homeCity}
                onChange={(e) => setHomeCity(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Date of Birth
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Unit Preference
              </label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={units === "metric"}
                    onChange={() => setUnits("metric")}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  Metric (°C, km)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={units === "imperial"}
                    onChange={() => setUnits("imperial")}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                  Imperial (°F, mi)
                </label>
              </div>
            </div>

            <div className="space-y-1.5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-emerald-500"
                />
                Receive email notifications and trip ideas
              </label>
            </div>
          </div>

          <div className="pt-4 pb-2">
            <Button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-xl font-bold shadow-md transition-all duration-300 ${
                success
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : success ? (
                "Profile Saved!"
              ) : (
                "Save Profile"
              )}
            </Button>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear Profile Data
              </button>
            ) : (
              <div className="space-y-3 p-3 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-100 dark:border-red-500/20">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium text-center">
                  This clears your saved profile data and signs you out. Your
                  account and authentication remain active.
                </p>
                {clearError && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium text-center">
                    {clearError}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteConfirm(false)}
                    disabled={loading}
                    className="flex-1 h-8 text-xs border-red-200 text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:hover:bg-red-500/20"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      setClearError(null);
                      const result = await clearProfileData();
                      setLoading(false);
                      if (result.status === "cleared_and_signed_out") {
                        onClose();
                        return;
                      }
                      setClearError(result.message);
                    }}
                    disabled={loading}
                    className="flex-1 h-8 text-xs bg-red-600 hover:bg-red-700 text-white border-0 disabled:opacity-50"
                  >
                    {loading
                      ? "Clearing…"
                      : clearError
                        ? "Retry Clear"
                        : "Yes, Clear"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* KAI-44: true account deletion — distinct from clearing profile
              data. Server-authorized: the function verifies the session and
              deletes app rows + the Auth user. */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            {!deleteAccountConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteAccountConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {t("settings.deleteAccountTitle")}
              </button>
            ) : (
              <div className="space-y-3 p-3 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-100 dark:border-red-500/20">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium text-center">
                  {t("settings.deleteAccountIrreversible")}
                </p>
                <input
                  type="text"
                  value={deleteTyped}
                  onChange={(e) => setDeleteTyped(e.target.value)}
                  placeholder={t("settings.deleteAccountConfirmPlaceholder")}
                  aria-label={t("settings.deleteAccountConfirmPrompt")}
                  className="w-full h-8 text-xs rounded-lg border border-red-200 dark:border-red-500/30 bg-white dark:bg-slate-900 px-2 text-center text-red-600 dark:text-red-400 font-semibold"
                />
                {isPasswordAccount ? (
                  <div className="space-y-1">
                    <label
                      htmlFor="delete-account-password"
                      className="block text-[11px] text-red-600 dark:text-red-400 font-medium text-center"
                    >
                      {t("settings.deleteAccountPasswordLabel")}
                    </label>
                    <input
                      id="delete-account-password"
                      type="password"
                      value={deleteReauthPassword}
                      onChange={(e) => setDeleteReauthPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full h-8 text-xs rounded-lg border border-red-200 dark:border-red-500/30 bg-white dark:bg-slate-900 px-2 text-center text-red-600 dark:text-red-400"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium text-center">
                      {t("settings.deleteAccountOauthPrompt", {
                        provider: providerDisplayName(authProvider),
                      })}
                    </p>
                  </div>
                )}
                {deleteAccountError && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium text-center">
                    {deleteAccountError}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteAccountConfirm(false)}
                    disabled={deletingAccount}
                    className="flex-1 h-8 text-xs border-red-200 text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:hover:bg-red-500/20"
                  >
                    {t("settings.deleteAccountCancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleDeleteAccount()}
                    disabled={
                      deletingAccount ||
                      deleteTyped !==
                        t("settings.deleteAccountConfirmPlaceholder")
                    }
                    className="flex-1 h-8 text-xs bg-red-700 hover:bg-red-800 text-white border-0 disabled:opacity-50"
                  >
                    {deletingAccount
                      ? "…"
                      : t("settings.deleteAccountConfirmAction")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
