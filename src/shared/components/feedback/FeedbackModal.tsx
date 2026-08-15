import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  X,
  Send,
  CheckCircle2,
  MessageSquare,
  Sparkles,
  Bug,
  Loader2,
  AlertCircle,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { t } = useTranslation();
  const [feedbackType, setFeedbackType] = useState<
    "general" | "bug" | "feature"
  >("general");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      setTimeout(() => {
        // Persist feedback to localStorage history
        try {
          const prev = JSON.parse(
            localStorage.getItem("tabimap_feedback_history") || "[]",
          );
          const newEntry = {
            id: Date.now(),
            type: feedbackType,
            message: message.trim(),
            date: new Date().toISOString(),
          };
          localStorage.setItem(
            "tabimap_feedback_history",
            JSON.stringify([newEntry, ...prev]),
          );
        } catch (err) {
          console.warn("Failed to write feedback to localStorage", err);
        }

        toast.success(t("feedbackModal.successToast"));
        setIsSubmitting(false);
        setSubmitted(true);
      }, 600);
    } catch {
      setIsSubmitting(false);
      setSubmitError(t("feedbackModal.errorGeneric"));
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setMessage("");
    setSubmitError(null);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={handleClose}
      />

      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md max-h-[90vh] sm:max-h-[85vh] m-4 sm:m-0 overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 flex flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {t("feedbackModal.title")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("feedbackModal.subtitle")}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1 pt-4">
          {submitted ? (
            <div className="py-6 text-center space-y-4 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t("feedbackModal.successTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t("feedbackModal.successMessage")}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <a
                  href={`mailto:info@meguruto.app?subject=[${feedbackType.toUpperCase()}] Feedback&body=${encodeURIComponent(message)}`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>{t("feedbackModal.sendEmail")}</span>
                </a>

                <Button
                  onClick={handleClose}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl py-2.5 shadow-sm"
                >
                  {t("feedbackModal.done")}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {submitError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-2xl flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Feedback Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("feedbackModal.typesLabel")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedbackType("general")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-bold border transition-all ${
                      feedbackType === "general"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{t("feedbackModal.types.general")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFeedbackType("feature")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-bold border transition-all ${
                      feedbackType === "feature"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t("feedbackModal.types.feature")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFeedbackType("bug")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-bold border transition-all ${
                      feedbackType === "bug"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <Bug className="w-3.5 h-3.5" />
                    <span>{t("feedbackModal.types.bug")}</span>
                  </button>
                </div>
              </div>

              {/* Message Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t("feedbackModal.messageLabel")}
                </label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedbackModal.placeholder")}
                  className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-2xl"
                >
                  {t("feedbackModal.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={!message.trim() || isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl px-4 py-2 flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t("feedbackModal.submitting")}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{t("feedbackModal.submit")}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
