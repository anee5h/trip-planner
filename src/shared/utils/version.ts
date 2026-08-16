import { version } from "../../../package.json";

export const APP_VERSION: string = version;

/** "2.0.0-beta.1" -> "v2.0.0 Beta 1"; prerelease labels otherwise rendered verbatim. */
export function formatAppVersion(v: string): string {
  return v.startsWith("v") ? v : `v${v.replace("-beta.", " Beta ")}`;
}
