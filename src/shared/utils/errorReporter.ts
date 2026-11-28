import { APP_VERSION, COMMIT_SHA } from "@/shared/utils/version";
import { redactSensitiveValues } from "@/shared/utils/redact";
import { supabase } from "@/lib/supabase";

/**
 * KAI-46: privacy-safe frontend error reporting.
 *
 * Captures unhandled errors, route crashes and caught failures (Supabase
 * sync, auth) with minimal privacy-safe context — app version, deployment
 * commit, route, locale, browser class and a feature tag. NEVER captures
 * tokens, auth payloads, personal data, request bodies or full
 * localStorage. Every string is passed through the same shared redactor
 * the server applies (redactSensitiveValues), so JWTs, Bearer tokens,
 * sb_secret_ keys, API-key/password-like values and emails cannot reach
 * storage even if they appear inside an error message.
 *
 * Events are sent as up to 10 separate POSTs per minute to /api/errors
 * (Pages Function → Supabase error_events). Reporting is best-effort and
 * must never break the app: failures to report are swallowed. When a
 * Supabase session exists, its access token is attached best-effort so the
 * Function can attribute the event to the signed-in user — a failed token
 * lookup never reports an error and never blocks the event.
 */

export interface ErrorReportContext {
  appVersion: string;
  commitSha: string;
  route: string;
  locale: string;
  browser: string;
  feature: string;
  message: string;
  errorName?: string;
  stackHead?: string;
}

const MAX_BATCH_PER_MINUTE = 10;
const MAX_MESSAGE_LENGTH = 2000;

let sentThisMinute = 0;
let windowStart = Date.now();
type ChunkRecoveryResult = "not-chunk" | "reloading" | "cooldown";
type ChunkRecoveryHandler = (error: unknown) => ChunkRecoveryResult;

let chunkRecoveryHandler: ChunkRecoveryHandler | null = null;
let installedWindow: Window | null = null;
let errorHandler: ((event: ErrorEvent) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

/** Lets the recovery module report whether it handled or deferred a chunk error. */
export function registerChunkLoadRecoveryHandler(
  handler: ChunkRecoveryHandler | null,
): void {
  chunkRecoveryHandler = handler;
}

/** Test-only: reset the rate-limit window between test cases. */
export function __resetErrorReporter(): void {
  sentThisMinute = 0;
  windowStart = Date.now();
  chunkRecoveryHandler = null;
  if (installedWindow && errorHandler && rejectionHandler) {
    installedWindow.removeEventListener("error", errorHandler);
    installedWindow.removeEventListener("unhandledrejection", rejectionHandler);
  }
  installedWindow = null;
  errorHandler = null;
  rejectionHandler = null;
}

function browserClass(): string {
  if (typeof navigator === "undefined") return "unknown";
  if (/(iPhone|iPad|iPod)/i.test(navigator.userAgent)) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  if (/Windows/i.test(navigator.userAgent)) return "windows";
  if (/Mac/i.test(navigator.userAgent)) return "macos";
  if (/Linux/i.test(navigator.userAgent)) return "linux";
  return "other";
}

/** Privacy-safe extraction: message + name + first stack frames only. */
function sanitizeError(error: unknown): {
  message: string;
  name?: string;
  stackHead?: string;
} {
  if (error instanceof Error) {
    return {
      message: (error.message || error.name || "Unknown error").slice(
        0,
        MAX_MESSAGE_LENGTH,
      ),
      name: error.name,
      stackHead: error.stack?.split("\n").slice(0, 3).join("\n").slice(0, 500),
    };
  }
  let message = "Unknown error";
  try {
    if (typeof error === "string") message = error;
    else if (error && typeof error === "object") {
      message = String((error as { message?: unknown }).message ?? error);
    }
  } catch {
    // ignore
  }
  return { message: message.slice(0, MAX_MESSAGE_LENGTH) };
}

function currentContext(
  feature: string,
): Omit<ErrorReportContext, "message" | "errorName" | "stackHead"> {
  let route = "";
  let locale = "";
  if (typeof window !== "undefined") {
    route = window.location.pathname.slice(0, 200);
    try {
      locale = window.document.documentElement.lang || "";
    } catch {
      // ignore
    }
  }
  return {
    appVersion: APP_VERSION,
    commitSha: COMMIT_SHA,
    route,
    locale,
    browser: browserClass(),
    feature,
  };
}

/** Best-effort current Supabase access token (null when signed out or when
 *  the lookup fails — never throws, never reports the failure). */
async function currentAccessToken(): Promise<string | null> {
  try {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Redacts every string field — the same boundary the server enforces. */
function redactContext(report: ErrorReportContext): ErrorReportContext {
  const redacted: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(report)) {
    redacted[key] =
      typeof value === "string" ? redactSensitiveValues(value) : value;
  }
  return redacted as unknown as ErrorReportContext;
}

async function deliver(report: ErrorReportContext): Promise<void> {
  try {
    const accessToken = await currentAccessToken();
    await fetch("/api/errors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(redactContext(report)),
      keepalive: true,
    });
  } catch {
    // Best-effort: never throw from the reporter.
  }
}

/** Starts a rate-limited report and returns its best-effort delivery promise. */
function startErrorReport(
  error: unknown,
  feature: string,
): Promise<void> | null {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    sentThisMinute = 0;
  }
  // A once-per-60-second chunk recovery must remain measurable even when
  // ordinary reports have reached their per-minute cap.
  if (sentThisMinute >= MAX_BATCH_PER_MINUTE && feature !== "chunk-reload") {
    return null;
  }
  sentThisMinute += 1;

  const { message, name, stackHead } = sanitizeError(error);
  return deliver({
    ...currentContext(feature),
    message,
    errorName: name,
    stackHead,
  });
}

/** Rate-limited report entry point (up to 10 separate POSTs per minute). */
export function reportError(error: unknown, feature = "app"): void {
  const delivery = startErrorReport(error, feature);
  if (delivery) void delivery;
}

/** Awaits the existing redacted, keepalive delivery path when the caller must
 *  finish reporting before a page transition (for example a chunk recovery). */
export async function reportErrorAndWait(
  error: unknown,
  feature: string,
): Promise<void> {
  await startErrorReport(error, feature);
}

/**
 * KAI-46: distinguishes genuine operational auth failures from ordinary
 * user-input failures. Supabase returns HTTP status codes on AuthError:
 * 400 = invalid credentials / validation (never a production incident),
 * 429 = rate-limited by Supabase Auth (operational), >= 500 = service
 * fault (operational). Errors without a status (network failures,
 * exceptions) are treated as operational.
 */
export function isOperationalAuthFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }
  return true;
}

/** Reports an auth failure only when it is operational (see above). */
export function reportAuthFailureIfOperational(
  error: unknown,
  operation: string,
): void {
  if (isOperationalAuthFailure(error)) {
    reportError(error, `auth:${operation}`);
  }
}

/** Installs global handlers for unhandled errors and rejections. */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined" || installedWindow === window) return;

  if (installedWindow && errorHandler && rejectionHandler) {
    installedWindow.removeEventListener("error", errorHandler);
    installedWindow.removeEventListener("unhandledrejection", rejectionHandler);
  }

  installedWindow = window;
  errorHandler = (event) => {
    const error = event.error ?? event.message;
    const recovery = chunkRecoveryHandler?.(error);
    if (recovery !== "reloading") reportError(error, "window");
  };
  rejectionHandler = (event) => {
    const recovery = chunkRecoveryHandler?.(event.reason);
    if (recovery !== "reloading") reportError(event.reason, "promise");
  };

  window.addEventListener("error", errorHandler);
  window.addEventListener("unhandledrejection", rejectionHandler);
}
