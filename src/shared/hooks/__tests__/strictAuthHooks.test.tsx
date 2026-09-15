/**
 * @vitest-environment jsdom
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useAuth } from "@/shared/hooks/useAuth";
import {
  useAuthModal,
  useOptionalAuthModal,
} from "@/shared/context/AuthModalContext";

function AuthProbe() {
  useAuth();
  return null;
}

function AuthModalProbe() {
  useAuthModal();
  return null;
}

function OptionalAuthModalProbe() {
  const context = useOptionalAuthModal();
  return <output>{context ? "present" : "absent"}</output>;
}

describe("strict authentication hooks", () => {
  it("throws when useAuth is rendered outside AuthProvider", () => {
    expect(() => renderToString(<AuthProbe />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });

  it("throws when useAuthModal is rendered outside AuthModalProvider", () => {
    expect(() => renderToString(<AuthModalProbe />)).toThrow(
      "useAuthModal must be used within AuthModalProvider",
    );
  });

  it("returns null from the deliberately optional modal boundary", () => {
    expect(renderToString(<OptionalAuthModalProbe />)).toContain(
      ">absent</output>",
    );
  });
});
