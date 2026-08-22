/**
 * KAI-147 review-fix test control for the lazy destinations-meta chunk.
 *
 * The real loader resolves via microtasks in vitest — too fast to
 * reproduce the "mutation happens BEFORE metadata arrives" window. This
 * module lets tests hold the metadata unresolved across store mutations,
 * then release it and let reconciliation run.
 *
 * The regression test mocks `loadDestinationsMeta` to route through
 * `currentPromise()` here; production code is untouched.
 */
import type { Destination } from "@/shared/types/destination";
import { readFileSync } from "node:fs";
import path from "node:path";

let held: Promise<Destination[]> | null = null;
let releaseHeld: ((meta: Destination[]) => void) | null = null;
const samplers = new Set<() => void>();

function loadRealMeta(): Destination[] {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src/shared/data/destinations-meta.json"),
      "utf8",
    ),
  ) as Destination[];
}

export const destinationsMetaState = {
  /** Hold metadata unresolved until release() is awaited. */
  hold(): void {
    if (held) return;
    held = new Promise<Destination[]>((resolve) => {
      releaseHeld = resolve;
    });
  },
  /**
   * Observe the store at every microtask boundary while metadata resolves.
   * The Consumer re-renders on store changes; sampling here catches
   * transient intermediate states (e.g. a prefecture removed then
   * re-added by a later effect).
   */
  onStoreSample(sample: () => void): () => void {
    samplers.add(sample);
    return () => samplers.delete(sample);
  },
  /** Called by the test's flush loop — runs all registered samplers. */
  runSamplers(): void {
    for (const sample of samplers) sample();
  },
  /** Release a held load with the real committed meta JSON. */
  async release(): Promise<void> {
    if (!held || !releaseHeld) {
      held = null;
      releaseHeld = null;
      return;
    }
    const promise = held;
    releaseHeld(loadRealMeta());
    await promise;
    held = null;
    releaseHeld = null;
  },
  /** The promise loadDestinationsMeta() should hand out right now. */
  currentPromise(): Promise<Destination[]> {
    if (!held) {
      // No hold installed: behave like the real loader (immediate value).
      return Promise.resolve(loadRealMeta());
    }
    return held;
  },
};
