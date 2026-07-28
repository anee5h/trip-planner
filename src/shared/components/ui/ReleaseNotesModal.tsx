import { Sparkles, X, CheckCircle2 } from "lucide-react";

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
}

const RELEASES = [
  {
    version: "v1.8.2",
    tag: "Current",
    date: "July 2026",
    title: "Complete Hub Coverage & Japanese Wikipedia",
    highlights: [
      "Added 18 reviewed municipal hubs, including Fukushima, Koriyama, and Iwakuni, and linked their in-city destinations",
      "Classified every record as a hub, verified child, or deliberate regional standalone root so no destination is unclassified",
      "Ran the data pipeline and synchronized all 345 public destination detail files with complete images and coordinates",
      "Japanese locale now retrieves Japanese Wikipedia summaries; pilot source links are also Japanese Wikipedia pages",
    ],
  },
  {
    version: "v1.8.1",
    date: "July 2026",
    title: "Verified City Hubs & Stronger Japanese Pilot",
    highlights: [
      "Removed city-hub assignments that crossed a municipal boundary or represented a regional place, and added only reviewed municipal links",
      "Nearby Places & Hubs now always shows an assigned hub and uses curated relationships instead of coordinate or prefecture guesses",
      "Removed nearby-place distance and walking-time labels",
      "Expanded the Japanese pilot for 20 hubs with fuller descriptions and three practical highlights each",
      "Added relationship validation that prevents non-hub and cross-prefecture parent assignments",
    ],
  },
  {
    version: "v1.8.0",
    date: "July 2026",
    title: "v2 Foundation: Trusted Places & Bilingual Content",
    highlights: [
      "Introduced canonical hub and destination records with an editorial lifecycle, source tracking, and review history",
      "Added Japanese content support with an in-app language switch and safe English fallback",
      "Reviewed the first 20 national travel hubs with bilingual summaries and traceable sources",
      "Rebuilt recommendations behind an explicit pipeline for eligibility, costs, weather, scoring, diversification, and explanations",
    ],
  },
  {
    version: "v1.7.62",
    date: "July 2026",
    title: "Complete Destination Detail Catalog",
    highlights: [
      "Added the 67 missing lazy-loaded destination detail files, bringing the public catalog to all 327 destinations",
      "Synchronized every public destination detail with the catalog index so destination pages show current data",
      "Aligned budget breakdown totals with their recommended trip budgets and corrected the distinct Historic Nara map location",
      "Added repeatable sync and validation commands to prevent destination detail files from drifting again",
    ],
  },
  {
    version: "v1.7.61",
    date: "July 2026",
    title: "Icon Polish, 30-min Walk Gate & Data Cleanup",
    highlights: [
      "Replaced all remaining emoji characters (☀️ ☔ 🚶 🍜 🎟 📅 💰 📍 ⏱ 🗼 🏙️ and transport icons) with Lucide icon components consistent with the rest of the app",
      "Nearby Destinations section now only appears when at least one place is reachable on foot within 30 minutes — longer-distance graph neighbours are no longer shown as 'nearby'",
      "Sidebar Suggested Visit icons replaced: Timer, CalendarDays, DollarSign, MapPin icons replace emoji spans; Highlights list uses CheckCircle2 instead of a text checkmark",
      "Comfort Metrics labels now use inline Sun, Umbrella, and Footprints icons alongside each score",
      "Budget breakdown transport row now renders the matching Lucide transport icon (Train / TrainFront / Car / Bus / Plane) next to the label",
      "Data fix: linked 6 destinations to their correct hubs — Disneyland & DisneySea → urayasu-city, Matsumoto Castle → matsumoto-city, Kinosaki Onsen & Arima Onsen → kobe-city, Mount Fuji → fujinomiya-city",
    ],
  },
  {
    version: "v1.7.60",
    date: "July 2026",
    title: "Suggested Visit, Ratings Overhaul & Data Audit",
    highlights: [
      "Replaced Sample Itinerary with a Suggested Visit card showing recommended duration, best season, typical budget, and nearby attraction count",
      "Detailed Ratings split into Experience Ratings (Couple, Family, Photography, Food, Value, Walkability, Accessibility, Nature, History & Culture, Relaxation) and Seasonal Ratings (Spring, Summer, Autumn, Winter, Rainy Day)",
      "Walk Intensity renamed to Walkability and now displays a numeric score instead of High/Medium/Low labels",
      "Nearby Destinations now show distance and estimated walking time above each card using the icon pack",
      "Data audit: fixed hub/featured/nearby relationships across 40+ cities — Yokohama now correctly shows Zoorasia and Hakkeijima, Fujisawa correctly features Enoshima only",
      "Removed all itinerary data from destination JSON (152 destinations cleaned)",
    ],
  },
  {
    version: "v1.7.59",
    date: "July 2026",
    title: "Preferred Travel Times & Persistent Destination Search",
    highlights: [
      "Destination cards now show the shortest trip time among your enabled travel methods, including flight when available",
      "Travel-time cards pair each duration with the estimated cost for that same transport method",
      "Destination Explorer filters, search, sorting, view, and page now persist in the URL when you explore a destination and return",
    ],
  },
  {
    version: "v1.7.58",
    date: "July 2026",
    title: "Mobile Overflow & Expandable Content Polish",
    highlights: [
      "Added clearer edge affordance and end padding to the Travel Passport tab bar so additional tabs are easier to discover",
      "Made the mobile command palette keyboard-aware, keeping search results visible and scrollable above the on-screen keyboard",
      "Smoothed the Destination Wikipedia disclosure with a compact loading state and animated expansion",
    ],
  },
  {
    version: "v1.7.57",
    date: "July 2026",
    title: "Categorical Walking Intensity — Filter, Compare & Ratings",
    highlights: [
      "Replaced step-count walking metrics with Low / Moderate / High intensity badges across the entire app",
      "Walking Intensity filter in Destination Filters upgraded from a slider to clean pill buttons (Any / 🟢 Low / 🟡 Moderate / 🔴 High)",
      "Removed '👣 Walk ~X.Xk steps' row from Travel Time card — walking is now a filter-level signal, not a logistics metric",
      "Walk Intensity badge shown in Comfort Metrics card and added as a dedicated item in Detailed Ratings grid",
      "Compare page (table & mobile cards) and Compare Modal now display Walk Intensity badges instead of raw step counts",
    ],
  },
  {
    version: "v1.7.56",
    tag: "",
    date: "July 2026",
    title: "Party Size Round-Trip Cost Scaling for Flight Travel Time Cards",
    highlights: [
      "Scaled Flight cost estimates in Travel Time card by party size and round-trip journey",
      "Unified cost formatting across Train, Shinkansen, Bus, Car, and Flight as 'est. ¥...k'",
    ],
  },
  {
    version: "v1.7.55",
    date: "July 2026",
    title:
      "Always-On Flight Estimates & Domestic Flight Preference Settings Fix",
    highlights: [
      "Guaranteed Domestic Flight (✈️) visibility on destination logistics cards whenever a valid flight estimate exists",
      "Added Domestic Flight option button and default selection to Settings & Preferences (/settings) page",
      "Fixed Shinkansen mode key mapping bug in Settings page preferences form",
      "Preserved flight estimates across custom saved user profiles with legacy transport modes",
    ],
  },
  {
    version: "v1.7.54",
    date: "July 2026",
    title:
      "Flight Budget Inclusion, Xh Ym Time Formatting & Default Flight Preferences",
    highlights: [
      "Included Flight (✈️) in Budget calculations and added a Flight selector pill to destination budget cards",
      "Formatted all regular travel times over 60 minutes as clean human-readable 'Xh Ym' strings (e.g. 39h 12m instead of 2352m)",
      "Enabled Flight in public transport preferences by default across search, catalog, and recommendation contexts",
      "Added Flight toggle buttons to Destination Filters and User Preference settings modals",
    ],
  },
  {
    version: "v1.7.53",
    date: "July 2026",
    title: "Normalized Transport Estimation System & Flight Mode",
    highlights: [
      "Introduced Flight (✈️) as a native transportation mode for long-distance travel in Japan (e.g. Tokyo -> Sapporo, Tokyo -> Kumamoto, Osaka -> Okinawa)",
      "Built a normalized Transport Estimation System (`src/shared/services/transport/`) with mode-agnostic ground access orchestration",
      "Dynamic coordinate-based departure airport selection using home station coordinates with zero manual region mapping required",
      "Door-to-door journey time optimization comparing total travel time across candidate airports",
      "Clean separation of pure data models and human-readable time/cost formatters",
    ],
  },
  {
    version: "v1.7.52",
    date: "July 2026",
    title: "Netflix-Style Thumbs Up / Thumbs Down Recommendation Ratings",
    highlights: [
      "Added Netflix-style Thumbs Up (👍) and Thumbs Down (👎) rating controls to destination cards in recommendation views",
      "Thumbs Down (👎) applies a -1000 score penalty so demoted destinations sink to the bottom of recommended lists",
      "Thumbs Up (👍) applies a +25 score boost to elevate your preferred places",
      "Persisted ratings in local storage and Cloud Sync across devices",
      "Suppressed Match Confidence panel on detail pages for thumbs-downed places",
    ],
  },
  {
    version: "v1.7.51",
    date: "July 2026",
    title: "Manual QA Image Corrections for 28 Destinations",
    highlights: [
      "Replaced incorrect and low-quality landmark images across 28 catalog destinations with high-definition Wikimedia and Unsplash assets",
      "Corrected imagery for Kintai Bridge, Ashikaga Flower Park, Dewa Sanzan, Teshima, Abukuma Cave, Kakunodate, Akiyoshido, Ryugado, Kouri Island, and 19 others",
      "Upscaled Wikimedia thumbnails to high-res 1920px crisp displays",
    ],
  },
  {
    version: "v1.7.50",
    date: "July 2026",
    title: "Zoorasia, teamLab Borderless, Tama Zoo & Ueno Zoo Expansion",
    highlights: [
      "Added Yokohama Zoorasia, Japan's premier 100-acre naturalistic zoological garden",
      "Added teamLab Borderless at Azabudai Hills, featuring world-famous boundaryless digital art installations",
      "Added Tama Zoological Park near Tachikawa, featuring open-range enclosures and Lion Bus safari",
      "Added Ueno Zoo, Japan's historic 1882 zoo inside Ueno Park famous for giant pandas",
      "Expanded catalog to 309 destinations across Japan",
    ],
  },
  {
    version: "v1.7.49",
    date: "July 2026",
    title: "Okinawa Region Filter & Regional Audit",
    highlights: [
      "Added Okinawa to the Region & Prefecture filter dropdown in Destinations Explorer",
      "Audited all 305 catalog destinations and 127 hubs for region integrity and mapping compliance",
      "Added dedicated automated unit testing suite for region schema validation",
    ],
  },
  {
    version: "v1.7.48",
    date: "July 2026",
    title: "Top 20 Destinations & 8 Curated Collections Expansion",
    highlights: [
      "Added 20 top requested landmark destinations (Tottori Sand Dunes, Sakurajima, Ginzan Onsen, Motonosumi Shrine, etc.)",
      "Created 8 new thematic collections (Caves, Coastal Drives, Scenic Bridges, Flower Parks, Waterfalls & Gorges, Islands, Art Islands, Pilgrimage Routes)",
      "Audited dataset to prevent duplication, expanding catalog to 305 destinations",
      "Enforced strict collection size boundary ensuring zero collections exceed 30 places",
    ],
  },
  {
    version: "v1.7.47",
    date: "July 2026",
    title: "Lazy Wikipedia Fetching & Skeleton Loader",
    highlights: [
      "Deferred Wikipedia API network calls until the user clicks 'Read More (Wikipedia)'",
      "Eliminated automatic network latency and rates on initial destination page mount",
      "Rendered an animated inline skeleton loader during Wikipedia summary fetching",
      "Cached fetched Wikipedia summaries in state for instant re-opening without re-fetching",
    ],
  },
  {
    version: "v1.7.46",
    date: "July 2026",
    title: "Mobile UI, Modal Audit & Wikipedia Collapsible Trigger",
    highlights: [
      "Placed 'Read More (Wikipedia)' button directly below custom overview text, rendering Wikipedia summary ONLY when clicked",
      "Fixed hero back button overlap on mobile with top action bar and font sizing",
      "Redesigned settings sidebar tabs with Lucide icons, clean pill highlights, and mobile horizontal scrolling",
      "Clarified base location auto-save behavior and hid redundant Save button on General tab",
      "Persisted feedback submissions to localStorage with toast notification and direct email fallback",
      "Fixed horizontal cropping of Base Location selector on mobile destinations page",
      "Audited and standardized mobile modal responsiveness across AuthModal, FeedbackModal, MarkVisitedModal, and SearchDialog",
    ],
  },
  {
    version: "v1.7.45",
    date: "July 2026",
    title: "Collapsible Wikipedia Summary on Destination Details",
    highlights: [
      "Preserved custom 2–3 sentence travel overview as the primary text at top of destination pages",
      "Moved secondary Wikipedia reference into a compact collapsible card defaulting to 2 lines",
      "Added 'Read More (Wikipedia) ▼' / 'Show less ▲' interactive toggle button",
      "Preserved official Wikipedia (CC BY-SA 4.0) attribution link",
    ],
  },
  {
    version: "v1.7.44",
    date: "July 2026",
    title: "Mobile UI Polish & UX Improvements",
    highlights: [
      "Reduced homepage top section padding to bring Base Location card closer to navbar",
      "Fixed Station/ZIP toggle mobile overflow with responsive flex wrapping and full-width layout",
      "Conditionally hid 'Save Settings' button on non-form tabs like Data & Export",
      "Constrained Release Notes modal height (max-h-[90vh]) with sticky header and scrollable timeline",
      "Replaced Feedback dialog emojis with clean Lucide icons and added loading/success submission UX",
      "Removed external GitHub link from mobile drawer navigation footer",
      "Enhanced active tab sidebar indicator in Settings with emerald left accent border and shadow glow",
      "Harmonized homepage date filter pills and custom Date Picker sizing, height, and typography",
      "Increased footer top margin and padding for improved mobile breathing room",
    ],
  },
  {
    version: "v1.7.43",
    date: "July 2026",
    title: "\u2728 Recommended Default Sort on Destinations",
    highlights: [
      "Added 'Recommended' as the new default sort on the Destinations page — seasons, transport fit, and saved travel preferences all factor in",
      "Calendar-season scoring added to the recommendation engine (spring/summer/autumn/winter, independent of live weather)",
      "Sort never filters destinations — 'Recommended' always shows the same count as any other sort option",
      "Saved Settings > Travel Preferences (carMode, publicModes, partySize) are automatically applied to scoring",
    ],
  },
  {
    version: "v1.7.42",
    date: "July 2026",
    title: "Navbar Micro-Polish & Translucent Glass Refinement",
    highlights: [
      "Elevated Navbar height to 68px and added translucent glass backdrop-blur-xl styling",
      "Added OS-aware search shortcut badge rendering Ctrl K on Linux/Windows and \u2318K on macOS",
      "Refined search bar with +4px icon padding, +15% placeholder text contrast, and 10% narrower width",
      "Enhanced active navigation pill state with distinct emerald background and accent borders",
    ],
  },
  {
    version: "v1.7.41",
    date: "July 2026",
    title: "Nav Pill Relabel: Itineraries",
    highlights: [
      "Renamed 'My Trips' navigation pill label to 'Itineraries' across desktop nav and mobile drawer",
      "Preserved canonical route at /my-trips",
    ],
  },
  {
    version: "v1.7.40",
    date: "July 2026",
    title: "Flattened Navbar Direct-Link Navigation & Mobile Sync",
    highlights: [
      "Flattened desktop navigation to 5 always-visible direct-link pills (Destinations, Collections, My Trips, Bucket List, Passport) with subtle cluster dividers",
      "Unified active pill styling using clean background highlights",
      "Synchronized mobile drawer navigation items and added missing Bucket List entry",
      "Cleaned up legacy hover dropdown state, timers, and event handlers",
    ],
  },
  {
    version: "v1.7.39",
    date: "July 2026",
    title: "Inclusive Multi-Tab QA Engineering Studio",
    highlights: [
      "Upgraded /qa into an inclusive QA Studio with 5 dedicated audit tabs: Health, Image QA Studio, Hierarchy, Budget/Transport, and Collections",
      "Integrated in-app Image QA Studio with visual cards, status flags (OK/BROKEN/WRONG_LANDMARK/LOW_QUALITY), custom URL replacement inputs, localStorage persistence, and 1-click CSV/JSON export",
      "Added Hub & Relationship Inspector, Transport Mode Auditor, and Collection Coverage Auditor",
    ],
  },
  {
    version: "v1.7.38",
    date: "July 2026",
    title: "Dataset Refinement & Internal QA Route Privacy",
    highlights: [
      "Removed unused gallery arrays from destinations dataset to optimize memory footprint",
      "Removed public Footer link to QA Dashboard while preserving direct route access for developers",
    ],
  },
  {
    version: "v1.7.37",
    date: "July 2026",
    title: "Account Switch State Reset & Production Log Cleanup",
    highlights: [
      "Fixed user account switch edge case by clearing local state when user.id changes without explicit sign-out",
      "Stripped debug console.logs from useTripSync to protect user sync payload privacy",
      "Added unit test suite for account switch state reset behavior",
    ],
  },
  {
    version: "v1.7.36",
    date: "July 2026",
    title: "Standardized Release Ruleset & Protocol Enforcement",
    highlights: [
      "Established standard Release Ruleset document at docs/RELEASE_RULES.md",
      "Synchronized all historical release notes from v1.7.22 up to v1.7.36 in ReleaseNotesModal",
      "Mandated pre-commit Prettier formatting verification and multi-branch release sync",
    ],
  },
  {
    version: "v1.7.35",
    date: "July 2026",
    title: "Intelligent Timeline Fallback Date & Custom SQL Sync",
    highlights: [
      "Extracted user_data.updated_at timestamp as intelligent fallback date for un-dated visits",
      "Added visited_dates JSONB column support for full cross-device custom visit date synchronization",
      "Added interactive inline date editor modal trigger on all Timeline cards",
    ],
  },
  {
    version: "v1.7.34",
    date: "July 2026",
    title: "Schema-Resilient Cloud Hydration",
    highlights: [
      "Replaced explicit column select with select('*') to prevent PGRST204 column schema errors",
      "Implemented resilient upsert fallback to preserve user history across all database environments",
      "Guaranteed visited destination and prefecture hydration on clean browsers",
    ],
  },
  {
    version: "v1.7.33",
    date: "July 2026",
    title: "Passport Prefecture Dynamic Re-Derivation",
    highlights: [
      "Updated useTripStore migration dependency array to re-derive 21 visited prefectures dynamically when cloud visited data finishes loading",
      "Added console debug logging for Supabase cloud sync hydration state",
    ],
  },
  {
    version: "v1.7.32",
    date: "July 2026",
    title: "Cross-Browser Sync Race Condition Fix",
    highlights: [
      "Wrapped user_data and trips promises in Promise.allSettled() to prevent premature cloud state overwrite on initial login",
      "Eliminated empty state cloud upsert on fresh Chrome and Firefox sessions",
    ],
  },
  {
    version: "v1.7.31",
    date: "July 2026",
    title: "Mobile Passport Timeline Date Synchronization",
    highlights: [
      "Added visitedDates and setVisitedDates to useTripSync cloud synchronization layer",
      "Hardened PassportTimelineCalendar date parsing for ISO strings and date formats",
    ],
  },
  {
    version: "v1.7.30",
    date: "July 2026",
    title: "Landmark UNESCO Image Replacements & Sendai Hero",
    highlights: [
      "Replaced generic UNESCO stock images with 15 landmark-specific Wikimedia photographs (Gunkanjima, Genbaku Dome, Horyu-ji)",
      "Updated Sendai City hero image toMukayama skyline view",
    ],
  },
  {
    version: "v1.7.28",
    date: "July 2026",
    title: "Image QA Dashboard Multi-Select & Auto-Save",
    highlights: [
      "Added multi-select filter pills and instant keystroke auto-saving to Image QA HTML Dashboard",
      "Added manual Save Progress button with live toast notification",
    ],
  },
  {
    version: "v1.7.21",
    date: "July 2026",
    title: "Bucket List Standardization & Release Notes",
    highlights: [
      "Standardized Bucket List bookmark button across all cards & detail pages",
      "Added toast notifications for Bucket List actions via Sonner",
      "Interactive Release Notes modal from version links in Navbar",
      "Live search input in Help Center FAQs & Guide cards",
      "Visual QA Dashboard route at /qa for dataset completeness",
    ],
  },
  {
    version: "v1.7.20",
    date: "July 2026",
    title: "Parent Hub Date Cascading Fix",
    highlights: [
      "Fixed retrospective date migration so parent hubs inherit exact child visit dates",
      "Added self-healing date cleanup for city hubs",
      "Created dedicated Vitest test suite for undated parent hub cascading",
    ],
  },
  {
    version: "v1.7.17",
    date: "July 2026",
    title: "Architecture & Metadata Refinement",
    highlights: [
      "Expanded destinations-meta.json with region, role, kind, and status fields",
      "Corrected parent hub relationships for Akasaka, teamLab Planets, and Western Tokyo cities",
      "Added automated relationship validation rules to data pipeline",
    ],
  },
  {
    version: "v1.7.16",
    date: "July 2026",
    title: "Lightweight Chunk Splitting",
    highlights: [
      "Generated destinations-meta.json (~14 KB) to decouple store state from 830 KB destination database",
      "Reduced useTripStore chunk size from 874 KB down to ~45 KB (95% reduction)",
      "Added idle image preloading during browser requestIdleCallback",
    ],
  },
  {
    version: "v1.7.11",
    date: "July 2026",
    title: "Skeleton & Progressive Loading Pass",
    highlights: [
      "Integrated 120ms anti-flash delayed skeletons for Notion/Linear feel",
      "Added LazyImage translucent pulse skeleton with 300ms fade-in transition",
      "Created DestinationDetailsSkeleton, CollectionCardSkeleton, and StatCardSkeleton",
    ],
  },
  {
    version: "v1.7.0",
    date: "July 2026",
    title: "TabiMap Design Polish",
    highlights: [
      "Unified PageHeader component across major feature views",
      "Deepened dark mode theme contrast & glassmorphism system",
      "Standardized typography scale & 8px spacing grid",
    ],
  },
];

export function ReleaseNotesModal({
  isOpen,
  onClose,
  version,
}: ReleaseNotesModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[90vh] sm:max-h-[85vh] m-4 sm:m-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 shrink-0 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold tracking-tight">
                  TabiMap Release Notes
                </h2>
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {version}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Changelog & Release History
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Timeline list */}
        <div className="p-4 sm:p-6 overflow-y-auto min-h-0 flex-1 space-y-6 text-slate-800 dark:text-slate-200">
          {RELEASES.map((rel) => (
            <div
              key={rel.version}
              className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 space-y-2"
            >
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-500 border-4 border-white dark:border-slate-900" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base text-slate-900 dark:text-white">
                    {rel.version}
                  </span>
                  {rel.tag && (
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {rel.tag}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {rel.date}
                </span>
              </div>

              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {rel.title}
              </h4>

              <ul className="space-y-1.5 pt-1">
                {rel.highlights.map((item, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>TabiMap Japan &copy; 2026</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
