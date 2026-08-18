import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFullPlaces,
  hasLoadedFullIndex,
  loadDestinationsIndex,
  resetDestinationsIndexForTests,
} from "../PlaceCatalog";

/**
 * KAI-121: loader failure/retry + no-CommonJS regression tests.
 *
 * 1. A rejected fetch must NOT poison the singleton: the promise is
 *    cleared, the error surfaces as a normal rejection (no unhandled
 *    rejection), and a subsequent call retries successfully.
 * 2. The loader is a runtime fetch of a plain static asset — PlaceCatalog
 *    must contain NO CommonJS `require()` (browser ESM safety).
 */
describe("KAI-121 full-index loader", () => {
  afterEach(() => {
    resetDestinationsIndexForTests();
    vi.unstubAllGlobals();
  });

  it("retries after a failed fetch (singleton is not poisoned)", async () => {
    // First call fails.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    await expect(loadDestinationsIndex()).rejects.toThrow(
      /failed to load destinations index/,
    );
    expect(hasLoadedFullIndex()).toBe(false);

    // Second call retries and succeeds.
    const fakeIndex = [
      { id: "a", name: "A", prefecture: "Tokyo" },
      { id: "b", name: "B", prefecture: "Osaka" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(fakeIndex), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    const index = await loadDestinationsIndex();
    expect(index).toHaveLength(2);
    expect(hasLoadedFullIndex()).toBe(true);
    expect(getFullPlaces().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("surfaces an HTTP error status as a retryable rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))),
    );
    await expect(loadDestinationsIndex()).rejects.toThrow(/HTTP 500/);
    expect(hasLoadedFullIndex()).toBe(false);
  });

  it("shares one in-flight promise between concurrent callers", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        calls += 1;
        return Promise.resolve(
          new Response(JSON.stringify([{ id: "x" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );
    const [a, b] = await Promise.all([
      loadDestinationsIndex(),
      loadDestinationsIndex(),
    ]);
    expect(a).toBe(b);
    expect(calls).toBe(1); // exactly one fetch for concurrent callers
  });
});

describe("KAI-121 no-CommonJS-in-browser guard", () => {
  it("PlaceCatalog uses no require() (browser ESM safety)", async () => {
    const source = await import("../PlaceCatalog?raw");
    // The ?raw import gives the file source as text.
    let text = (source as unknown as { default: string }).default;
    // Strip comments — the docs legitimately mention require(); only an
    // actual call site must fail.
    text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(text).not.toMatch(/\brequire\s*\(/);
    expect(text).toMatch(/fetch\(/); // runtime fetch, not a static import
    expect(text).not.toMatch(/destinations-index\.json\?url/);
  });
});
