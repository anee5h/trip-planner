import { version } from "../../../package.json";

export const APP_VERSION: string = version;

/**
 * Deployment commit SHA, baked at build time by Vite's `define`
 * (vite.config.ts reads `git rev-parse HEAD`). Falls back to "unknown" in
 * non-Vite contexts (node/tsx build scripts, tests without the define).
 */
export const COMMIT_SHA: string =
  typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : "unknown";

/** "2.0.0-beta.2" -> "v2.0.0 Beta 2"; prerelease labels otherwise rendered verbatim. */
export function formatAppVersion(v: string): string {
  return v.startsWith("v") ? v : `v${v.replace("-beta.", " Beta ")}`;
}
