import { useState } from "react";
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

const FAQS = [
  {
    question: "How do I mark a destination or sight as visited?",
    answer:
      "Browse to any destination page or sight card and click the 'Mark as Visited' checkmark button. Your visit history will automatically sync to your Travel Passport and prefecture map.",
  },
  {
    question: "How does the Base Location setting work?",
    answer:
      "Configure your Base Location (e.g., Tokyo Station, Osaka) in Settings > General. TabiMap uses this as your default home starting point when calculating travel times and daily route plans.",
  },
  {
    question: "What is the difference between Achievements and Badges?",
    answer:
      "Achievements represent official heritage benchmarks (like UNESCO World Heritage Sites or 12 Existing Castles). Badges represent gamified exploration rewards unlocked by visiting regions and reaching travel milestones.",
  },
  {
    question: "How do I export my trip itinerary to Google Calendar?",
    answer:
      "Open any itinerary in My Trips and click the 'Export to Calendar' button. You can download an .ics file or add it directly to Google Calendar.",
  },
];

const SHORTCUTS = [
  {
    key: "⌘ + K / Ctrl + K",
    description: "Open Global Search & Command Palette",
  },
  { key: "ESC", description: "Close Command Palette or any open dialog/menu" },
  {
    key: "↑ / ↓",
    description: "Navigate items in search results or command lists",
  },
  { key: "Enter", description: "Select highlighted search result or action" },
];

export default function Help() {
  const [activeSection, setActiveSection] =
    useState<HelpSection>("getting-started");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const GettingStartedIcon = Icons.gettingStarted;
  const FaqIcon = Icons.help;
  const ShortcutsIcon = Icons.shortcuts;
  const ChangelogIcon = Icons.timeline;
  const FeedbackIcon = Icons.feedback;
  const ChevronIcon = Icons.chevronDown;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl space-y-8 animate-in fade-in duration-200">
      <PageHeader
        title="Help Center"
        subtitle="Documentation & Support"
        description="Learn feature workflows, view keyboard shortcuts, check release notes, or send feedback."
        actions={
          <button
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all"
          >
            <FeedbackIcon className="w-4 h-4" />
            Send Feedback
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-1">
          {[
            {
              id: "getting-started",
              label: "Getting Started",
              icon: GettingStartedIcon,
            },
            { id: "faq", label: "Frequently Asked Questions", icon: FaqIcon },
            {
              id: "shortcuts",
              label: "Keyboard Shortcuts",
              icon: ShortcutsIcon,
            },
            {
              id: "changelog",
              label: "Release Changelog",
              icon: ChangelogIcon,
            },
          ].map((sec) => {
            const isActive = activeSection === sec.id;
            const IconComp = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id as HelpSection)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <IconComp className="w-4 h-4 shrink-0" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9">
          <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
            {/* Section 1: Getting Started */}
            {activeSection === "getting-started" && (
              <div className="space-y-6">
                <div>
                  <SectionTitle>Getting Started with TabiMap</SectionTitle>
                  <Caption className="mt-1">
                    3 simple steps to master your travel exploration in Japan.
                  </Caption>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center">
                      1
                    </div>
                    <CardTitle>Discover & Bookmark</CardTitle>
                    <BodyText>
                      Explore Japan sights and curated UNESCO collections.
                      Bookmark places to your Bucket List.
                    </BodyText>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center">
                      2
                    </div>
                    <CardTitle>Plan Itineraries</CardTitle>
                    <BodyText>
                      Build daily travel plans in My Trips. Configure your Base
                      Location in Settings for accurate transit times.
                    </BodyText>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center">
                      3
                    </div>
                    <CardTitle>Track Progression</CardTitle>
                    <BodyText>
                      Log visited spots in Passport. Watch your Japan map light
                      up and earn milestone badges.
                    </BodyText>
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: FAQ */}
            {activeSection === "faq" && (
              <div className="space-y-6">
                <div>
                  <SectionTitle>Frequently Asked Questions</SectionTitle>
                  <Caption className="mt-1">
                    Find quick answers to common questions about TabiMap.
                  </Caption>
                </div>

                <div className="space-y-3 pt-2">
                  {FAQS.map((faq, idx) => {
                    const isOpen = openFaqIndex === idx;
                    return (
                      <div
                        key={idx}
                        className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
                      >
                        <button
                          onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                          className="w-full flex items-center justify-between p-4 text-left font-bold text-xs md:text-sm text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <span>{faq.question}</span>
                          <ChevronIcon
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isOpen
                                ? "rotate-180 text-emerald-500"
                                : "text-slate-400"
                            }`}
                          />
                        </button>
                        {isOpen && (
                          <div className="p-4 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section 3: Keyboard Shortcuts */}
            {activeSection === "shortcuts" && (
              <div className="space-y-6">
                <div>
                  <SectionTitle>Keyboard Shortcuts Cheat Sheet</SectionTitle>
                  <Caption className="mt-1">
                    Speed up your navigation across TabiMap with global hotkeys.
                  </Caption>
                </div>

                <div className="space-y-2 pt-2">
                  {SHORTCUTS.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60"
                    >
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {s.description}
                      </span>
                      <kbd className="px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        {s.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 4: Changelog */}
            {activeSection === "changelog" && (
              <div className="space-y-6">
                <div>
                  <SectionTitle>Release History & Changelog</SectionTitle>
                  <Caption className="mt-1">
                    Latest features and improvements added to TabiMap.
                  </Caption>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-emerald-200/80 dark:border-emerald-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <CardTitle>
                        Version 1.5.2 — Design System & Product Polish
                      </CardTitle>
                      <Caption>July 2026</Caption>
                    </div>
                    <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                      <li>
                        Centralized Lucide icon registry & zero unicode emojis.
                      </li>
                      <li>ThemeProvider service with live theme switching.</li>
                      <li>
                        Single source of truth for Base Location with reusable
                        StationInput.
                      </li>
                      <li>Safe return navigation flow (`?return=`).</li>
                      <li>
                        Functional JSON data export with `schemaVersion: 1`.
                      </li>
                      <li>Redesigned Profile Explorer Hub hero header.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </div>
  );
}
