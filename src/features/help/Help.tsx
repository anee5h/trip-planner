import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Icons } from "@/shared/icons";
import {
  SectionTitle,
  CardTitle,
  BodyText,
  Caption,
} from "@/shared/components/ui/Typography";
import { FeedbackModal } from "@/shared/components/feedback/FeedbackModal";
import { PageHeader } from "@/shared/components/ui/PageHeader";

type HelpSection = "getting-started" | "faq" | "shortcuts" | "changelog";

export default function Help() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] =
    useState<HelpSection>("getting-started");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const GettingStartedIcon = Icons.gettingStarted;
  const FaqIcon = Icons.help;
  const ShortcutsIcon = Icons.shortcuts;
  const ChangelogIcon = Icons.timeline;
  const FeedbackIcon = Icons.feedback;
  const ChevronIcon = Icons.chevronDown;

  const faqs = [
    {
      question: t("help.faq.items.visited.question"),
      answer: t("help.faq.items.visited.answer"),
    },
    {
      question: t("help.faq.items.baseLocation.question"),
      answer: t("help.faq.items.baseLocation.answer"),
    },
    {
      question: t("help.faq.items.achievements.question"),
      answer: t("help.faq.items.achievements.answer"),
    },
    {
      question: t("help.faq.items.calendar.question"),
      answer: t("help.faq.items.calendar.answer"),
    },
  ];

  const shortcuts = [
    {
      key: "⌘ + K / Ctrl + K",
      description: t("help.shortcuts.globalSearch"),
    },
    {
      key: "ESC",
      description: t("help.shortcuts.closeDialog"),
    },
    {
      key: "↑ / ↓",
      description: t("help.shortcuts.navigateItems"),
    },
    {
      key: "Enter",
      description: t("help.shortcuts.selectItem"),
    },
  ];

  const filteredFaqs = faqs.filter(
    (f) =>
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredShortcuts = shortcuts.filter(
    (s) =>
      s.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl space-y-8 animate-in fade-in duration-200">
      <PageHeader
        title={t("help.title")}
        subtitle={t("help.subtitle")}
        description={t("help.description")}
        actions={
          <button
            onClick={() => setFeedbackOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-md transition-all active:scale-95 flex items-center gap-2"
          >
            <FeedbackIcon className="w-4 h-4" />
            <span>{t("help.sendFeedback")}</span>
          </button>
        }
      />

      {/* Live Search Input */}
      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder={t("help.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-base sm:text-sm placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium px-2 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {t("help.clearSearch")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="md:col-span-1 space-y-1.5">
          <button
            onClick={() => setActiveSection("getting-started")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left ${
              activeSection === "getting-started"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <GettingStartedIcon className="w-4 h-4 shrink-0" />
            <span>{t("help.sections.gettingStarted")}</span>
          </button>

          <button
            onClick={() => setActiveSection("faq")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left ${
              activeSection === "faq"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <FaqIcon className="w-4 h-4 shrink-0" />
            <span>{t("help.sections.faq")}</span>
          </button>

          <button
            onClick={() => setActiveSection("shortcuts")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left ${
              activeSection === "shortcuts"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <ShortcutsIcon className="w-4 h-4 shrink-0" />
            <span>{t("help.sections.shortcuts")}</span>
          </button>

          <button
            onClick={() => setActiveSection("changelog")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left ${
              activeSection === "changelog"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <ChangelogIcon className="w-4 h-4 shrink-0" />
            <span>{t("help.sections.changelog")}</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          {activeSection === "getting-started" && (
            <div className="space-y-6">
              <div>
                <SectionTitle>{t("help.gettingStarted.title")}</SectionTitle>
                <Caption>{t("help.gettingStarted.subtitle")}</Caption>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm">
                    1
                  </div>
                  <CardTitle>{t("help.gettingStarted.step1Title")}</CardTitle>
                  <BodyText className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t("help.gettingStarted.step1Description")}
                  </BodyText>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm">
                    2
                  </div>
                  <CardTitle>{t("help.gettingStarted.step2Title")}</CardTitle>
                  <BodyText className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t("help.gettingStarted.step2Description")}
                  </BodyText>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm">
                    3
                  </div>
                  <CardTitle>{t("help.gettingStarted.step3Title")}</CardTitle>
                  <BodyText className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t("help.gettingStarted.step3Description")}
                  </BodyText>
                </div>
              </div>
            </div>
          )}

          {activeSection === "faq" && (
            <div className="space-y-6">
              <div>
                <SectionTitle>{t("help.faq.title")}</SectionTitle>
                <Caption>{t("help.faq.subtitle")}</Caption>
              </div>

              <div className="space-y-3">
                {filteredFaqs.map((faq, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs transition-all"
                    >
                      <button
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full flex items-center justify-between p-4 text-left font-bold text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <span>{faq.question}</span>
                        <ChevronIcon
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                            isOpen ? "rotate-180 text-emerald-500" : ""
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-600 dark:text-slate-300 leading-relaxed animate-in fade-in duration-150">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === "shortcuts" && (
            <div className="space-y-6">
              <div>
                <SectionTitle>{t("help.shortcuts.title")}</SectionTitle>
                <Caption>{t("help.shortcuts.subtitle")}</Caption>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
                {filteredShortcuts.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      {s.description}
                    </span>
                    <kbd className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 shadow-2xs">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === "changelog" && (
            <div className="space-y-6">
              <div>
                <SectionTitle>{t("help.changelog.title")}</SectionTitle>
                <Caption>{t("help.changelog.subtitle")}</Caption>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {t("help.changelog.version152Title")}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60">
                      {t("help.changelog.version152Date")}
                    </span>
                  </div>
                  <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-disc list-inside">
                    <li>{t("help.changelog.item1")}</li>
                    <li>{t("help.changelog.item2")}</li>
                    <li>{t("help.changelog.item3")}</li>
                    <li>{t("help.changelog.item4")}</li>
                    <li>{t("help.changelog.item5")}</li>
                    <li>{t("help.changelog.item6")}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </div>
  );
}
