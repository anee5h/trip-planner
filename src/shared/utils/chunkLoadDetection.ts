const CHUNK_LOAD_MESSAGE_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
];

/** Recognizes browser and Vite dynamic-import failure shapes. */
export function isChunkLoadFailure(error: unknown, depth = 0): boolean {
  if (typeof error === "string") {
    const message = error.toLowerCase();
    return CHUNK_LOAD_MESSAGE_PATTERNS.some((pattern) =>
      message.includes(pattern),
    );
  }

  if (!error || typeof error !== "object" || depth > 1) return false;

  try {
    const candidate = error as {
      name?: unknown;
      message?: unknown;
      reason?: unknown;
      payload?: unknown;
    };
    if (candidate.name === "ChunkLoadError") return true;
    if (
      typeof candidate.message === "string" &&
      isChunkLoadFailure(candidate.message)
    ) {
      return true;
    }
    return (
      isChunkLoadFailure(candidate.reason, depth + 1) ||
      isChunkLoadFailure(candidate.payload, depth + 1)
    );
  } catch {
    // A hostile/revoked object should not break global error handling.
    return false;
  }
}
