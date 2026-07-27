import { describe, it, expect } from "vitest";
import QaDashboard from "../QaDashboard";

describe("QaDashboard Component", () => {
  it("exports QaDashboard function component", () => {
    expect(typeof QaDashboard).toBe("function");
  });
});
