import { describe, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "../accountDeletion";

describe("KAI-44 requestAccountDeletion", () => {
  it("POSTs the session token and otp reauth mode to the deletion endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, deleted: {} }), {
        status: 200,
      }),
    );
    const result = await requestAccountDeletion(
      "token-123",
      { reauthMode: "otp" },
      fetchMock,
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/delete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer token-123",
        }),
        body: JSON.stringify({ reauthMode: "otp" }),
      }),
    );
  });

  it("sends the password for server-side verification in password mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, deleted: {} }), {
        status: 200,
      }),
    );
    await requestAccountDeletion(
      "token-123",
      { reauthMode: "password", email: "u@example.com", password: "pw" },
      fetchMock,
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      reauthMode: "password",
      email: "u@example.com",
      password: "pw",
    });
  });

  it("preserves the server partial-failure JSON instead of collapsing it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: "data_deletion_failed",
          step: "delete_user_data",
          deleted: { trips: true, user_data: false },
          retrySafe: true,
        }),
        { status: 502 },
      ),
    );
    const result = await requestAccountDeletion(
      "token",
      { reauthMode: "otp" },
      fetchMock,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("data_deletion_failed");
      expect(result.step).toBe("delete_user_data");
      expect(result.deleted).toEqual({ trips: true, user_data: false });
      expect(result.retrySafe).toBe(true);
    }
  });

  it("classifies network failure as an unknown-outcome network_error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await requestAccountDeletion(
      "token",
      { reauthMode: "otp" },
      fetchMock,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("network_error");
      expect(result.retrySafe).toBeUndefined();
    }
  });

  it("returns a typed failure for 401 sessions without crashing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "invalid_session" }), {
        status: 401,
      }),
    );
    const result = await requestAccountDeletion(
      "bad-token",
      { reauthMode: "otp" },
      fetchMock,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_session");
    }
  });
});
