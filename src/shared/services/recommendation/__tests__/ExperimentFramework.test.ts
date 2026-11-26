import { beforeEach, describe, expect, it } from "vitest";
import {
  ExperimentFramework,
  experimentFramework,
  type ExperimentConfig,
} from "../ExperimentFramework";

const FIXTURE: ExperimentConfig = {
  id: "exp_test_split",
  name: "Test split",
  enabled: true,
  startDate: "2020-01-01",
  endDate: "2099-12-31",
  variants: [
    { id: "control", name: "Control", allocationPercentage: 50 },
    { id: "treatment", name: "Treatment", allocationPercentage: 50 },
  ],
};

describe("ExperimentFramework Unit Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    experimentFramework.registerExperiment(FIXTURE);
    experimentFramework.setKillSwitch(FIXTURE.id, true);
  });

  it("should assign identical variant for the same session ID deterministically", () => {
    const res1 = experimentFramework.getAssignment(
      FIXTURE.id,
      "user_session_123",
    );
    const res2 = experimentFramework.getAssignment(
      FIXTURE.id,
      "user_session_123",
    );

    expect(res1.variantId).toBe(res2.variantId);
    expect(res1.reason).toBe("ASSIGNED");
  });

  it("should fall back to control variant when an experiment is expired", () => {
    const res = experimentFramework.getAssignment(
      FIXTURE.id,
      "user_session_123",
      new Date("2100-06-01"),
    );

    expect(res.variantId).toBe("control");
    expect(res.isControl).toBe(true);
    expect(res.reason).toBe("EXPIRED");
  });

  it("should fall back to control variant when kill switch is disabled", () => {
    experimentFramework.setKillSwitch(FIXTURE.id, false);

    const res = experimentFramework.getAssignment(
      FIXTURE.id,
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

describe("ExperimentFramework with no experiments", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty and writes nothing to localStorage when constructed", () => {
    const framework = new ExperimentFramework();
    expect(framework.listExperiments()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("creates the session id on first use and keeps it stable", () => {
    const framework = new ExperimentFramework();
    expect(localStorage.getItem("tabimap_experiment_session_id")).toBeNull();

    const first = framework.getSessionId();
    expect(localStorage.getItem("tabimap_experiment_session_id")).toBe(first);
    expect(framework.getSessionId()).toBe(first);
    expect(new ExperimentFramework().getSessionId()).toBe(first);
  });

  it("does not create a session id for an unknown experiment", () => {
    new ExperimentFramework().getAssignment("nope");
    expect(localStorage.length).toBe(0);
  });
});
