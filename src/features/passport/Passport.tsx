import { useState } from "react";
import type { PassportTab } from "./types";
import { PassportNav } from "./components/PassportNav";
import { PassportOverview } from "./components/PassportOverview";
import { PassportJapanMap } from "./components/PassportJapanMap";
import { PassportTimeline } from "./components/PassportTimeline";
import { PassportAchievements } from "./components/PassportAchievements";
import { PassportBadges } from "./components/PassportBadges";
import { PassportStatistics } from "./components/PassportStatistics";

import { PageHeader } from "@/shared/components/ui/PageHeader";

export default function Passport() {
  const [activeTab, setActiveTab] = useState<PassportTab>("overview");

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl space-y-6">
      <PageHeader
        title="Travel Passport"
        subtitle="Traveler Profile Hub"
        description="Track your exploration progress, unlocked heritage achievements, and personal travel timeline across Japan."
      />

      {/* Taller Sticky Sub-Nav */}
      <PassportNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Active Section Content */}
      <main className="pt-4">
        {activeTab === "overview" && (
          <PassportOverview onSelectTab={setActiveTab} />
        )}
        {activeTab === "japan-map" && <PassportJapanMap />}
        {activeTab === "timeline" && <PassportTimeline />}
        {activeTab === "achievements" && <PassportAchievements />}
        {activeTab === "badges" && <PassportBadges />}
        {activeTab === "statistics" && <PassportStatistics />}
      </main>
    </div>
  );
}
