import type { SignupSource } from "@/shared/services/analytics/RecommendationAnalyticsTypes";
import { generateUUID } from "@/shared/utils/uuid";

const INTENT_KEY = "meguruto_pending_persistence_intent_v1";
const DRAFT_KEY_PREFIX = "meguruto_pending_persistence_draft_v1:";
const INTENT_TTL_MS = 15 * 60 * 1000;
const MAX_DRAFT_BYTES = 400_000;

export type PendingPersistenceIntent =
  | {
      type: "bucket_list_save";
      destinationId: string;
      sourceSurface: SignupSource;
      createdAt: number;
    }
  | {
      type: "passport";
      destinationId: string;
      visitDate: string;
      sourceSurface: SignupSource;
      createdAt: number;
    }
  | {
      type: "preferences";
      preferences: {
        carMode: string;
        publicModes: string[];
        tripDuration: string;
        partySize: number;
      };
      sourceSurface: SignupSource;
      createdAt: number;
    }
  | {
      type: "trip_save";
      draftRef: string;
      returnPath: string;
      sourceSurface: SignupSource;
      createdAt: number;
    }
  | {
      type: "my_trips";
      returnPath: string;
      sourceSurface: SignupSource;
      createdAt: number;
    };

export type PendingPersistenceIntentInput =
  | Omit<
      Extract<PendingPersistenceIntent, { type: "bucket_list_save" }>,
      "createdAt"
    >
  | Omit<Extract<PendingPersistenceIntent, { type: "passport" }>, "createdAt">
  | Omit<
      Extract<PendingPersistenceIntent, { type: "preferences" }>,
      "createdAt"
    >
  | Omit<Extract<PendingPersistenceIntent, { type: "trip_save" }>, "createdAt">
  | Omit<Extract<PendingPersistenceIntent, { type: "my_trips" }>, "createdAt">;

type StoredIntent = PendingPersistenceIntentInput & {
  createdAt: number;
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isSafeReturnPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length <= 1000
  );
}

function isValidSource(value: unknown): value is SignupSource {
  return (
    value === "header" ||
    value === "auth_modal" ||
    value === "bucket_list_save" ||
    value === "trip_save" ||
    value === "my_trips" ||
    value === "preferences" ||
    value === "passport"
  );
}

function isValidIntent(value: unknown): value is PendingPersistenceIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as Record<string, unknown>;
  if (
    typeof intent.createdAt !== "number" ||
    !Number.isFinite(intent.createdAt) ||
    Date.now() - intent.createdAt > INTENT_TTL_MS ||
    !isValidSource(intent.sourceSurface)
  ) {
    return false;
  }

  if (intent.type === "bucket_list_save") {
    return isSafeId(intent.destinationId);
  }
  if (intent.type === "passport") {
    return (
      isSafeId(intent.destinationId) &&
      typeof intent.visitDate === "string" &&
      /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(intent.visitDate)
    );
  }
  if (intent.type === "preferences") {
    const preferences = intent.preferences;
    if (!preferences || typeof preferences !== "object") return false;
    const value = preferences as Record<string, unknown>;
    return (
      typeof value.carMode === "string" &&
      value.carMode.length <= 40 &&
      Array.isArray(value.publicModes) &&
      value.publicModes.every(
        (mode) => typeof mode === "string" && mode.length <= 40,
      ) &&
      typeof value.tripDuration === "string" &&
      value.tripDuration.length <= 40 &&
      typeof value.partySize === "number" &&
      Number.isInteger(value.partySize) &&
      value.partySize >= 1 &&
      value.partySize <= 8
    );
  }
  if (intent.type === "trip_save") {
    return isSafeId(intent.draftRef) && isSafeReturnPath(intent.returnPath);
  }
  if (intent.type === "my_trips") {
    return isSafeReturnPath(intent.returnPath);
  }
  return false;
}

export function setPendingPersistenceIntent(
  intent: PendingPersistenceIntentInput,
): boolean {
  const target = storage();
  if (!target) return false;
  try {
    const value: StoredIntent = { ...intent, createdAt: Date.now() };
    target.setItem(INTENT_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function peekPendingPersistenceIntent(): PendingPersistenceIntent | null {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(INTENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidIntent(parsed)) {
      target.removeItem(INTENT_KEY);
      return null;
    }
    return parsed;
  } catch {
    target.removeItem(INTENT_KEY);
    return null;
  }
}

export function consumePendingPersistenceIntent(): PendingPersistenceIntent | null {
  const intent = peekPendingPersistenceIntent();
  if (!intent) return null;
  storage()?.removeItem(INTENT_KEY);
  return intent;
}

export function clearPendingPersistenceIntent(): void {
  storage()?.removeItem(INTENT_KEY);
}

export function storePendingPersistenceDraft(value: unknown): string | null {
  const target = storage();
  if (!target) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_DRAFT_BYTES) return null;
    const ref = generateUUID();
    target.setItem(`${DRAFT_KEY_PREFIX}${ref}`, serialized);
    return ref;
  } catch {
    return null;
  }
}

export function readPendingPersistenceDraft<T>(ref: string): T | null {
  if (!isSafeId(ref)) return null;
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(`${DRAFT_KEY_PREFIX}${ref}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearPendingPersistenceDraft(ref: string): void {
  if (!isSafeId(ref)) return;
  storage()?.removeItem(`${DRAFT_KEY_PREFIX}${ref}`);
}

export const pendingPersistenceIntentStorageKey = INTENT_KEY;
