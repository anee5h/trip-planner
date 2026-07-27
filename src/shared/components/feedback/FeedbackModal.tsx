import { useState } from "react";
import { createPortal } from "react-dom";
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

        toast.success(
          "Feedback submitted! Thank you for helping improve TabiMap.",
        );
        setIsSubmitting(false);
        setSubmitted(true);
      }, 600);
    } catch {
      setIsSubmitting(false);
      setSubmitError("Failed to submit feedback. Please try again.");
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
                Send Feedback
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Help us improve TabiMap for travelers
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
                  Thank you for your feedback!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">
                  Your feedback has been saved locally.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <a
                  href={`mailto:kaihatsu.studio@gmail.com?subject=${encodeURIComponent(
                    `TabiMap Feedback (${feedbackType})`,
                  )}&body=${encodeURIComponent(message)}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Also Send via Email</span>
                </a>
                <Button
                  type="button"
                  onClick={handleClose}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{submitError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Feedback Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: "general",
                      label: "General",
                      Icon: MessageSquare,
                    },
                    {
                      id: "feature",
                      label: "Feature",
                      Icon: Sparkles,
                    },
                    {
                      id: "bug",
                      label: "Bug Report",
                      Icon: Bug,
                    },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFeedbackType(id as any)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                        feedbackType === id
                          ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Your Message
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  disabled={isSubmitting}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share your thoughts, suggestions, or issues..."
                  className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {isSubmitting ? "Sending..." : "Submit Feedback"}
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
