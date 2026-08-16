import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("KAI-95: Mobile viewport zoom prevention & modal typography", () => {
  it("index.css includes global mobile form control font-size rule (>=16px on <768px)", () => {
    const cssPath = path.resolve(process.cwd(), "src/index.css");
    const cssContent = readFileSync(cssPath, "utf-8");

    // Must target max-width 767px (mobile)
    expect(cssContent).toMatch(/@media\s*\(\s*max-width:\s*767px\s*\)/);
    // Must target inputs, selects, and textareas
    expect(cssContent).toMatch(/select/);
    expect(cssContent).toMatch(/textarea/);
    // Must set font-size to 16px !important
    expect(cssContent).toMatch(/font-size:\s*16px\s*!important/);
  });

  it("index.html keeps standard accessible viewport meta (no user-scalable=no, no maximum-scale=1)", () => {
    const htmlPath = path.resolve(process.cwd(), "index.html");
    const htmlContent = readFileSync(htmlPath, "utf-8");

    expect(htmlContent).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    );
    expect(htmlContent).not.toContain("user-scalable=no");
    expect(htmlContent).not.toContain("maximum-scale=1");
    expect(htmlContent).not.toContain("user-scalable=0");
  });

  it("StationInput uses mobile zoom-safe font sizes (text-base sm:text-sm)", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/shared/components/StationInput.tsx",
    );
    const content = readFileSync(filePath, "utf-8");

    // Selects and inputs should have text-base sm:text-sm, not raw text-sm
    const selectMatches =
      content.match(/<select[\s\S]*?className="([^"]*)"/g) || [];
    expect(selectMatches.length).toBeGreaterThanOrEqual(2);
    for (const match of selectMatches) {
      expect(match).toContain("text-base");
      expect(match).toContain("sm:text-sm");
    }

    const inputMatches =
      content.match(/<input[\s\S]*?className="([^"]*)"/g) || [];
    for (const match of inputMatches) {
      if (match.includes('type="text"')) {
        expect(match).toContain("text-base");
        expect(match).toContain("sm:text-sm");
      }
    }
  });

  it("SearchableDestinationPicker mobile input uses zoom-safe font token", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/shared/components/ui/SearchableDestinationPicker.tsx",
    );
    const content = readFileSync(filePath, "utf-8");

    expect(content).toMatch(
      /role="combobox"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("MarkVisitedModal and VisitedDateModal use zoom-safe font sizes", () => {
    const markVisitedPath = path.resolve(
      process.cwd(),
      "src/features/destinations/components/MarkVisitedModal.tsx",
    );
    const markVisitedContent = readFileSync(markVisitedPath, "utf-8");
    expect(markVisitedContent).toMatch(
      /type="date"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(markVisitedContent).toMatch(
      /type="month"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(markVisitedContent).toMatch(
      /<select[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );

    const visitedDatePath = path.resolve(
      process.cwd(),
      "src/features/destinations/components/VisitedDateModal.tsx",
    );
    const visitedDateContent = readFileSync(visitedDatePath, "utf-8");
    expect(visitedDateContent).toMatch(
      /type="date"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(visitedDateContent).toMatch(
      /type="month"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(visitedDateContent).toMatch(
      /<select[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("AuthModal and OnboardingFlow use zoom-safe font sizes", () => {
    const authPath = path.resolve(
      process.cwd(),
      "src/shared/components/auth/AuthModal.tsx",
    );
    const authContent = readFileSync(authPath, "utf-8");
    expect(authContent).toMatch(
      /type="email"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(authContent).toMatch(
      /type=\{showPassword[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );

    const onboardingPath = path.resolve(
      process.cwd(),
      "src/shared/components/auth/OnboardingFlow.tsx",
    );
    const onboardingContent = readFileSync(onboardingPath, "utf-8");
    expect(onboardingContent).toMatch(
      /placeholder=\{t\("settings\.fullNamePlaceholder"\)\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("FeedbackModal textarea uses zoom-safe mobile font size", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/shared/components/feedback/FeedbackModal.tsx",
    );
    const content = readFileSync(filePath, "utf-8");

    expect(content).toMatch(
      /<textarea[\s\S]*?className="[^"]*text-base\s+sm:text-xs/,
    );
  });

  it("PreferencesModal and ProfileModal inputs use zoom-safe font sizes", () => {
    const prefPath = path.resolve(
      process.cwd(),
      "src/shared/components/profile/PreferencesModal.tsx",
    );
    const prefContent = readFileSync(prefPath, "utf-8");
    expect(prefContent).toMatch(
      /type="number"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );

    const profilePath = path.resolve(
      process.cwd(),
      "src/shared/components/profile/ProfileModal.tsx",
    );
    const profileContent = readFileSync(profilePath, "utf-8");
    expect(profileContent).toMatch(
      /placeholder="How should we call you\?"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(profileContent).toMatch(
      /placeholder="Where do you live\?"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(profileContent).toMatch(
      /type="date"[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("ItineraryPickerModal and ItineraryPlanner inputs use zoom-safe font sizes", () => {
    const pickerPath = path.resolve(
      process.cwd(),
      "src/features/trips/components/ItineraryPickerModal.tsx",
    );
    const pickerContent = readFileSync(pickerPath, "utf-8");
    expect(pickerContent).toMatch(
      /type="text"[\s\S]*?value=\{newTitle\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );

    const plannerPath = path.resolve(
      process.cwd(),
      "src/features/trips/components/ItineraryPlanner.tsx",
    );
    const plannerContent = readFileSync(plannerPath, "utf-8");
    expect(plannerContent).toMatch(
      /type="date"[\s\S]*?value=\{stopDate\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("TripDetails journal textarea uses zoom-safe font size", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/features/trips/TripDetails.tsx",
    );
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(
      /<textarea[\s\S]*?value=\{journal\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("DayPlanWidget selects and custom minute input use zoom-safe font sizes", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/features/destinations/components/DayPlanWidget.tsx",
    );
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(
      /value=\{startTime\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(content).toMatch(
      /value=\{durationPreset\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(content).toMatch(
      /value=\{availableMinutes\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(content).toMatch(
      /value=\{returnMode\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(content).toMatch(
      /value=\{planType\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(content).toMatch(
      /value=\{pace\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(content).toMatch(
      /value=\{catchmentScope\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(content).toMatch(
      /value=\{partySize\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("Help and Settings search/account inputs use zoom-safe font sizes", () => {
    const helpPath = path.resolve(process.cwd(), "src/features/help/Help.tsx");
    const helpContent = readFileSync(helpPath, "utf-8");
    expect(helpContent).toMatch(
      /placeholder=\{t\("help\.searchPlaceholder"\)\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );

    const settingsPath = path.resolve(
      process.cwd(),
      "src/features/settings/Settings.tsx",
    );
    const settingsContent = readFileSync(settingsPath, "utf-8");
    expect(settingsContent).toMatch(
      /placeholder=\{t\("settings\.fullNamePlaceholder"\)\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
    expect(settingsContent).toMatch(
      /placeholder=\{t\("settings\.usernamePlaceholder"\)\}[\s\S]*?className="[^"]*text-base\s+sm:text-sm/,
    );
  });

  it("Shared Input primitive maintains text-base mobile and md:text-sm desktop contract", () => {
    const inputPath = path.resolve(
      process.cwd(),
      "src/shared/components/ui/input.tsx",
    );
    const inputContent = readFileSync(inputPath, "utf-8");
    expect(inputContent).toContain("text-base");
    expect(inputContent).toContain("md:text-sm");
  });
});
