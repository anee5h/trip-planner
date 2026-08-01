import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearLegacyAccountStorage } from "../clearLegacyAccountStorage";

describe("clearLegacyAccountStorage", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockLocalStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };

    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes legacy account keys from localStorage", () => {
    localStorage.setItem(
      "trip-planner-favorites",
      JSON.stringify(["tokyo-tower"]),
    );
    localStorage.setItem("trip-planner-visited", JSON.stringify(["kyoto-hub"]));
    localStorage.setItem(
      "trip-planner-visited-prefs",
      JSON.stringify(["Kyoto"]),
    );
    localStorage.setItem(
      "trip-planner-visited-dates",
      JSON.stringify({ "kyoto-hub": ["2026-01-01"] }),
    );
    localStorage.setItem("trip-planner-home-station", "Shinjuku Station");
    localStorage.setItem(
      "trip-planner-home-station-coords",
      JSON.stringify({ lat: 35.69, lng: 139.7 }),
    );
    localStorage.setItem("trip-planner-trips", JSON.stringify([]));
    localStorage.setItem(
      "trip-planner-ratings",
      JSON.stringify({ "tokyo-tower": "up" }),
    );

    clearLegacyAccountStorage();

    expect(localStorage.getItem("trip-planner-favorites")).toBeNull();
    expect(localStorage.getItem("trip-planner-visited")).toBeNull();
    expect(localStorage.getItem("trip-planner-visited-prefs")).toBeNull();
    expect(localStorage.getItem("trip-planner-visited-dates")).toBeNull();
    expect(localStorage.getItem("trip-planner-home-station")).toBeNull();
    expect(localStorage.getItem("trip-planner-home-station-coords")).toBeNull();
    expect(localStorage.getItem("trip-planner-trips")).toBeNull();
    expect(localStorage.getItem("trip-planner-ratings")).toBeNull();
  });

  it("preserves trip-planner-compare and non-account localStorage keys", () => {
    localStorage.setItem(
      "trip-planner-compare",
      JSON.stringify(["tokyo-tower", "sensoji"]),
    );
    localStorage.setItem("sb-test-auth-token", "token-value");
    localStorage.setItem("meguruto-theme", "dark");

    clearLegacyAccountStorage();

    expect(localStorage.getItem("trip-planner-compare")).toBe(
      JSON.stringify(["tokyo-tower", "sensoji"]),
    );
    expect(localStorage.getItem("sb-test-auth-token")).toBe("token-value");
    expect(localStorage.getItem("meguruto-theme")).toBe("dark");
  });
});
