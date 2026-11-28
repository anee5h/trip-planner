import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadFailure } from "@/shared/utils/chunkLoadDetection";
import {
  __resetChunkLoadRecoveryForTests,
  CHUNK_RECOVERY_SESSION_KEY,
  CHUNK_RECOVERY_WINDOW_MS,
  recoverFromChunkLoadFailure,
} from "@/shared/utils/chunkLoadRecovery";
import type { ChunkRecoveryDependencies } from "@/shared/utils/chunkLoadRecovery";

vi.mock("@/shared/utils/errorReporter", () => ({
  reportErrorAndWait: vi.fn().mockResolvedValue(undefined),
}));

const chunkMessages = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Unable to preload CSS for /assets/DestinationDetails-test.css",
];

function setupDependencies(now = 1_000_000) {
  const values = new Map<string, string>();
  const dependencies: ChunkRecoveryDependencies = {
    getStorage: () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }),
    now: () => now,
    report: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
  };
  return {
    dependencies,
    values,
    setNow: (value: number) => {
      now = value;
    },
  };
}

describe("chunk load recovery", () => {
  beforeEach(() => {
    __resetChunkLoadRecoveryForTests();
  });

  afterEach(() => {
    __resetChunkLoadRecoveryForTests();
    vi.restoreAllMocks();
  });

  it.each(chunkMessages)("detects %s", (message) => {
    expect(isChunkLoadFailure(message)).toBe(true);
    expect(isChunkLoadFailure(new Error(message))).toBe(true);
  });

  it("detects ChunkLoadError by name and ignores unrelated errors", () => {
    const chunkError = new Error("Loading chunk failed");
    chunkError.name = "ChunkLoadError";

    expect(isChunkLoadFailure(chunkError)).toBe(true);
    expect(isChunkLoadFailure(new Error("Network request failed"))).toBe(false);
    expect(
      isChunkLoadFailure("TypeError: Cannot read properties of null"),
    ).toBe(false);
  });

  it("reports the first failure and reloads only after reporting completes", async () => {
    const { dependencies } = setupDependencies();
    let finishReport!: () => void;
    dependencies.report = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishReport = resolve;
        }),
    );

    expect(recoverFromChunkLoadFailure(chunkMessages[0], dependencies)).toBe(
      "reloading",
    );
    await vi.waitFor(() =>
      expect(dependencies.report).toHaveBeenCalledWith(
        chunkMessages[0],
        "chunk-reload",
      ),
    );
    expect(dependencies.reload).not.toHaveBeenCalled();

    finishReport();
    await vi.waitFor(() =>
      expect(dependencies.reload).toHaveBeenCalledTimes(1),
    );
  });

  it("blocks another reload within 60 seconds and allows one after the window", async () => {
    const { dependencies, values, setNow } = setupDependencies();
    expect(recoverFromChunkLoadFailure(chunkMessages[0], dependencies)).toBe(
      "reloading",
    );
    await vi.waitFor(() =>
      expect(dependencies.reload).toHaveBeenCalledTimes(1),
    );
    expect(values.get(CHUNK_RECOVERY_SESSION_KEY)).toBe("1000000");

    // A full page reload creates a fresh module instance but keeps sessionStorage.
    __resetChunkLoadRecoveryForTests();
    setNow(1_000_000 + CHUNK_RECOVERY_WINDOW_MS - 1);
    expect(recoverFromChunkLoadFailure(chunkMessages[1], dependencies)).toBe(
      "cooldown",
    );
    expect(dependencies.report).toHaveBeenCalledTimes(1);
    expect(dependencies.reload).toHaveBeenCalledTimes(1);

    setNow(1_000_000 + CHUNK_RECOVERY_WINDOW_MS + 1);
    expect(recoverFromChunkLoadFailure(chunkMessages[2], dependencies)).toBe(
      "reloading",
    );
    await vi.waitFor(() =>
      expect(dependencies.reload).toHaveBeenCalledTimes(2),
    );
    expect(dependencies.report).toHaveBeenCalledTimes(2);
  });

  it("fails closed when sessionStorage access throws", () => {
    const { dependencies } = setupDependencies();
    dependencies.getStorage = () => {
      throw new Error("storage unavailable");
    };

    expect(recoverFromChunkLoadFailure(chunkMessages[0], dependencies)).toBe(
      "cooldown",
    );
    expect(dependencies.report).not.toHaveBeenCalled();
    expect(dependencies.reload).not.toHaveBeenCalled();
  });

  it("does not report or reload non-chunk errors", () => {
    const { dependencies } = setupDependencies();

    expect(
      recoverFromChunkLoadFailure(
        new Error("ordinary route error"),
        dependencies,
      ),
    ).toBe("not-chunk");
    expect(dependencies.report).not.toHaveBeenCalled();
    expect(dependencies.reload).not.toHaveBeenCalled();
  });
});
