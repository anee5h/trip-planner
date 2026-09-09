import { describe, it, expect } from "vitest";
import {
  DestinationPlanningSection,
  getPlannerTransportScopeNotice,
} from "../DestinationPlanningSection";

describe("DestinationPlanningSection", () => {
  it("exports DestinationPlanningSection function component", () => {
    expect(typeof DestinationPlanningSection).toBe("function");
  });

  it("states the different time and cost scopes when an origin is saved", () => {
    const notice = getPlannerTransportScopeNotice("en", true);
    expect(notice).toContain("excludes travel to the first stop");
    expect(notice).toContain("includes origin transport");
  });

  it("keeps the origin-pricing condition in the Japanese origin notice", () => {
    const notice = getPlannerTransportScopeNotice("ja", true);
    expect(notice).toContain("料金を算出できる場合");
    expect(notice).toContain("費用サマリーには出発地からの交通費を含みます");
  });

  it("does not imply origin cost when no origin is saved, in EN and JA", () => {
    expect(getPlannerTransportScopeNotice("en", false)).toContain(
      "not included without a saved origin",
    );
    expect(getPlannerTransportScopeNotice("ja", false)).toContain(
      "出発地が未設定",
    );
  });
});
