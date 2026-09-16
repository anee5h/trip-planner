import { describe, it, expect } from "vitest";
import {
  DestinationPlanningSection,
  getPlannerTransportScopeNotice,
} from "../DestinationPlanningSection";

describe("DestinationPlanningSection", () => {
  it("exports DestinationPlanningSection function component", () => {
    expect(typeof DestinationPlanningSection).toBe("function");
  });

  it("points saved-origin travellers to the canonical cost breakdown", () => {
    const notice = getPlannerTransportScopeNotice("en", true);
    expect(notice).toContain("excludes travel to the first stop");
    expect(notice).toContain("canonical trip-cost scope");
  });

  it("keeps the Japanese origin notice aligned with the breakdown", () => {
    const notice = getPlannerTransportScopeNotice("ja", true);
    expect(notice).toContain("費用内訳で旅行全体の費用範囲を確認できます");
  });

  it("does not imply origin cost when no origin is saved, in EN and JA", () => {
    expect(getPlannerTransportScopeNotice("en", false)).toContain(
      "On-site estimate — set an origin to include travel",
    );
    expect(getPlannerTransportScopeNotice("ja", false)).toContain(
      "現地費用の目安です。出発地を設定すると交通費も含まれます",
    );
  });
});
