import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetErrorReporter,
  reportError,
  reportErrorAndWait,
} from "@/shared/utils/errorReporter";

vi.mock("@/lib/supabase", () => ({ supabase: null }));

describe("error reporter recovery delivery", () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));

  beforeEach(() => {
    __resetErrorReporter();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a keepalive chunk-reload report through the shared reporter after the normal cap", async () => {
    for (let index = 0; index < 10; index += 1) {
      reportError(new Error(`ordinary error ${index}`), "test");
    }
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));

    await reportErrorAndWait(
      new Error("Failed to fetch dynamically imported module"),
      "chunk-reload",
    );

    expect(fetchMock).toHaveBeenCalledTimes(11);
    const [, request] = fetchMock.mock.calls[10] as [string, RequestInit];
    expect(request.keepalive).toBe(true);
    expect(JSON.parse(String(request.body))).toMatchObject({
      feature: "chunk-reload",
      message: "Failed to fetch dynamically imported module",
    });
  });
});
