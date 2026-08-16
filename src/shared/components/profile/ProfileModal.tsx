import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, updateUserProfile, clearProfileData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

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
  }, [user, isOpen]);

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
        </form>
      </div>
    </div>,
    document.body,
  );
}
