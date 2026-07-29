import { beforeEach, describe, expect, it } from "vitest";
import { experimentFramework } from "../ExperimentFramework";

describe("ExperimentFramework Unit Tests", () => {
  beforeEach(() => {
    experimentFramework.setKillSwitch("exp_season_weight_2026", true);
  });

  it("should assign identical variant for the same session ID deterministically", () => {
    const res1 = experimentFramework.getAssignment(
      "exp_season_weight_2026",
      "user_session_123",
    );
    const res2 = experimentFramework.getAssignment(
      "exp_season_weight_2026",
      "user_session_123",
    );

    expect(res1.variantId).toBe(res2.variantId);
    expect(res1.reason).toBe("ASSIGNED");
  });

  it("should fall back to control variant when an experiment is expired", () => {
    const expiredDate = new Date("2027-06-01");
    const res = experimentFramework.getAssignment(
      "exp_season_weight_2026",
      "user_session_123",
      expiredDate,
    );

    expect(res.variantId).toBe("control");
    expect(res.isControl).toBe(true);
    expect(res.reason).toBe("EXPIRED");
  });

  it("should fall back to control variant when kill switch is disabled", () => {
    experimentFramework.setKillSwitch("exp_season_weight_2026", false);

    const res = experimentFramework.getAssignment(
      "exp_season_weight_2026",
      "user_session_123",
    );

    expect(res.variantId).toBe("control");
    expect(res.isControl).toBe(true);
    expect(res.reason).toBe("DISABLED");
  });

  it("should return NOT_FOUND for unknown experiment IDs safely without crashing", () => {
    const res = experimentFramework.getAssignment(
      "unknown_experiment_id",
      "user_session_123",
    );

    expect(res.variantId).toBe("control");
    expect(res.reason).toBe("NOT_FOUND");
  });
});
