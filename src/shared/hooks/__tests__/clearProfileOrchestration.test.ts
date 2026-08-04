import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeClearProfile } from "../clearProfileOrchestration";
import type { ClearProfileDependencies } from "../clearProfileOrchestration";
import type { User } from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";

type Deps = ClearProfileDependencies;

function mockClient(overrides: {
  updateUserError?: Error | null;
  updateUserData?: Record<string, unknown>;
  deleteError?: Error | null;
}) {
  const updateUser = vi.fn().mockResolvedValue({
    error: overrides.updateUserError ?? null,
    data: overrides.updateUserData ?? { user: { id: "user-1" } as User },
  });

  const eq = vi
    .fn()
    .mockResolvedValue(
      overrides.deleteError
        ? { error: overrides.deleteError }
        : { error: null },
    );
  const del = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ delete: del });

  return {
    auth: { updateUser },
    from,
  };
}

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    user: { id: "user-1" } as User,
    client: mockClient({}) as unknown as Deps["client"],
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onUserUpdated: vi.fn(),
    profileMetadataFields: ["username", "full_name", "preferences"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeClearProfile orchestration", () => {
  it("returns failed when user is null (not signed in)", async () => {
    const deps = makeDeps({ user: null });
    const result = await executeClearProfile(deps);

    expect(result.status).toBe("failed");
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("returns failed when metadata clearing fails, does not delete row or sign out", async () => {
    const deps = makeDeps({
      client: mockClient({
        updateUserError: new Error("fail"),
      }) as unknown as Deps["client"],
    });

    const result = await executeClearProfile(deps);

    expect(result.status).toBe("failed");
    expect((deps.client as any).auth.updateUser).toHaveBeenCalledTimes(1);
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("returns partially_cleared when metadata clears but row deletion fails, does not sign out", async () => {
    const deps = makeDeps({
      client: mockClient({
        updateUserError: null,
        updateUserData: { user: { id: "user-1" } as User },
        deleteError: new Error("delete fail"),
      }) as unknown as Deps["client"],
    });

    const result = await executeClearProfile(deps);

    expect(result.status).toBe("partially_cleared");
    expect(deps.onUserUpdated).toHaveBeenCalled();
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("returns cleared_but_signout_failed when both destructive ops succeed but sign-out fails", async () => {
    const deps = makeDeps({
      client: mockClient({}) as unknown as Deps["client"],
      signOut: vi
        .fn()
        .mockResolvedValue({ error: new Error("signout fail") as AuthError }),
    });

    const result = await executeClearProfile(deps);

    expect(result.status).toBe("cleared_but_signout_failed");
    expect(deps.signOut).toHaveBeenCalled();
  });

  it("returns cleared_and_signed_out and calls operations in order", async () => {
    const callOrder: string[] = [];

    const updateUser = vi.fn().mockImplementation(async () => {
      callOrder.push("metadata");
      return { error: null, data: { user: { id: "user-1" } as User } };
    });

    const eq = vi.fn().mockImplementation(async () => {
      callOrder.push("row-delete");
      return { error: null };
    });

    const deps = makeDeps({
      client: {
        auth: { updateUser },
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({ eq }),
        }),
      } as unknown as Deps["client"],
      signOut: vi.fn().mockImplementation(async () => {
        callOrder.push("signout");
        return { error: null };
      }),
    });

    const result = await executeClearProfile(deps);

    expect(result.status).toBe("cleared_and_signed_out");
    expect(callOrder).toEqual(["metadata", "row-delete", "signout"]);
    expect(deps.onUserUpdated).toHaveBeenCalled();
  });
});
