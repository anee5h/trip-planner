import { afterEach, describe, expect, it } from "vitest";
import {
  clearPendingPersistenceDraft,
  clearPendingPersistenceIntent,
  consumePendingPersistenceIntent,
  peekPendingPersistenceIntent,
  readPendingPersistenceDraft,
  setPendingPersistenceIntent,
  storePendingPersistenceDraft,
} from "../PendingPersistenceIntent";

afterEach(() => {
  clearPendingPersistenceIntent();
  for (const key of Object.keys(sessionStorage)) {
    if (key.includes("meguruto_pending_persistence_draft_v1:")) {
      sessionStorage.removeItem(key);
    }
  }
});

describe("KAI-259 safe pending persistence intents", () => {
  it("preserves each P0 source surface with only safe structured fields", () => {
    const cases = [
      {
        type: "bucket_list_save" as const,
        destinationId: "ueno-zoo",
        sourceSurface: "bucket_list_save" as const,
      },
      {
        type: "passport" as const,
        destinationId: "ueno-zoo",
        visitDate: "2026-09-15",
        sourceSurface: "passport" as const,
      },
      {
        type: "preferences" as const,
        preferences: {
          carMode: "none",
          publicModes: ["train", "bus"],
          tripDuration: "halfDay",
          partySize: 2,
        },
        sourceSurface: "preferences" as const,
      },
      {
        type: "my_trips" as const,
        returnPath: "/my-trips",
        sourceSurface: "my_trips" as const,
      },
    ];

    for (const intent of cases) {
      expect(setPendingPersistenceIntent(intent)).toBe(true);
      expect(peekPendingPersistenceIntent()).toMatchObject(intent);
      expect(peekPendingPersistenceIntent()).not.toHaveProperty("email");
      expect(peekPendingPersistenceIntent()).not.toHaveProperty("password");
      expect(peekPendingPersistenceIntent()).not.toHaveProperty("token");
      clearPendingPersistenceIntent();
    }
  });

  it("consumes an intent once and keeps a generated draft outside the URL", () => {
    const draftRef = storePendingPersistenceDraft({
      type: "generated_plan",
      planId: "plan-1",
      destinations: ["ueno-zoo", "ueno-park"],
    });
    expect(draftRef).toBeTruthy();
    expect(
      setPendingPersistenceIntent({
        type: "trip_save",
        draftRef: draftRef!,
        returnPath: "/destinations/ueno-zoo",
        sourceSurface: "trip_save",
      }),
    ).toBe(true);

    expect(peekPendingPersistenceIntent()).toMatchObject({
      type: "trip_save",
      draftRef,
      sourceSurface: "trip_save",
    });
    expect(consumePendingPersistenceIntent()).toMatchObject({
      type: "trip_save",
      draftRef,
    });
    expect(consumePendingPersistenceIntent()).toBeNull();
    expect(readPendingPersistenceDraft(draftRef!)).toEqual({
      type: "generated_plan",
      planId: "plan-1",
      destinations: ["ueno-zoo", "ueno-park"],
    });
    clearPendingPersistenceDraft(draftRef!);
    expect(readPendingPersistenceDraft(draftRef!)).toBeNull();
  });

  it("rejects unsafe external return paths", () => {
    expect(
      setPendingPersistenceIntent({
        type: "my_trips",
        returnPath: "https://example.com/steal-session",
        sourceSurface: "my_trips",
      }),
    ).toBe(true);
    expect(peekPendingPersistenceIntent()).toBeNull();
  });
});
