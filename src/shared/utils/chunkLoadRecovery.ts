import { isChunkLoadFailure } from "@/shared/utils/chunkLoadDetection";
import {
  registerChunkLoadRecoveryHandler,
  reportErrorAndWait,
} from "@/shared/utils/errorReporter";

export const CHUNK_RECOVERY_SESSION_KEY = "meguruto-chunk-recovery-at";
export const CHUNK_RECOVERY_WINDOW_MS = 60_000;
const REPORT_BEFORE_RELOAD_TIMEOUT_MS = 1_200;

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export interface ChunkRecoveryDependencies {
  getStorage: () => SessionStorageLike;
  now: () => number;
  report: (error: unknown, feature: string) => Promise<void>;
  reload: () => void;
}

export type ChunkRecoveryResult = "not-chunk" | "reloading" | "cooldown";

const browserDependencies: ChunkRecoveryDependencies = {
  getStorage: () => window.sessionStorage,
  now: () => Date.now(),
  report: reportErrorAndWait,
  reload: () => window.location.reload(),
};

let recoveryStartedInThisDocument = false;
let installedWindow: Window | null = null;
let preloadErrorHandler: ((event: Event) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

/** Attempts one same-URL reload for a chunk failure; unavailable storage fails
 *  closed so private-mode storage errors cannot create a reload loop. */
export function recoverFromChunkLoadFailure(
  error: unknown,
  dependencies: ChunkRecoveryDependencies = browserDependencies,
): ChunkRecoveryResult {
  if (!isChunkLoadFailure(error)) return "not-chunk";
  if (recoveryStartedInThisDocument) return "reloading";

  const now = dependencies.now();
  try {
    const storage = dependencies.getStorage();
    const storedRecovery = storage.getItem(CHUNK_RECOVERY_SESSION_KEY);
    const lastRecovery = Number(storedRecovery);
    if (
      storedRecovery !== null &&
      Number.isFinite(lastRecovery) &&
      now - lastRecovery < CHUNK_RECOVERY_WINDOW_MS
    ) {
      return "cooldown";
    }
    storage.setItem(CHUNK_RECOVERY_SESSION_KEY, String(now));
  } catch {
    return "cooldown";
  }

  recoveryStartedInThisDocument = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const report = Promise.resolve()
    .then(() => dependencies.report(error, "chunk-reload"))
    .catch(() => undefined);
  const maximumWait = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, REPORT_BEFORE_RELOAD_TIMEOUT_MS);
  });
  void Promise.race([report, maximumWait]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
    dependencies.reload();
  });

  return "reloading";
}

/** Installs early listeners so Vite and unhandled-import failures recover
 *  before React's route boundary renders its fallback. */
export function installChunkLoadRecovery(): void {
  if (typeof window === "undefined") return;
  registerChunkLoadRecoveryHandler(recoverFromChunkLoadFailure);
  if (installedWindow === window) return;

  if (installedWindow && preloadErrorHandler && rejectionHandler) {
    installedWindow.removeEventListener(
      "vite:preloadError",
      preloadErrorHandler,
    );
    installedWindow.removeEventListener("unhandledrejection", rejectionHandler);
  }

  installedWindow = window;
  preloadErrorHandler = (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    if (recoverFromChunkLoadFailure(payload) === "reloading") {
      event.preventDefault();
    }
  };
  rejectionHandler = (event) => {
    if (recoverFromChunkLoadFailure(event.reason) === "reloading") {
      event.preventDefault();
    }
  };

  window.addEventListener("vite:preloadError", preloadErrorHandler);
  window.addEventListener("unhandledrejection", rejectionHandler);
}

/** Test-only reset that models a full document reload. */
export function __resetChunkLoadRecoveryForTests(): void {
  recoveryStartedInThisDocument = false;
  registerChunkLoadRecoveryHandler(null);
  if (installedWindow && preloadErrorHandler && rejectionHandler) {
    installedWindow.removeEventListener(
      "vite:preloadError",
      preloadErrorHandler,
    );
    installedWindow.removeEventListener("unhandledrejection", rejectionHandler);
  }
  installedWindow = null;
  preloadErrorHandler = null;
  rejectionHandler = null;
}
