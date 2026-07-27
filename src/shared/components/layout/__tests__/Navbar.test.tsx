import { describe, it, expect } from "vitest";
import Navbar from "../Navbar";

describe("Navbar Component", () => {
  it("exports Navbar function component", () => {
    expect(typeof Navbar).toBe("function");
  });
});
