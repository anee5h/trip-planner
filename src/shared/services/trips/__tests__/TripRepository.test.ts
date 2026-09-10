import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseTripRepository } from "../TripRepository";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => {
  const mockFrom = vi.fn();
  return {
    supabase: {
      from: mockFrom,
    },
  };
});

describe("TripRepository Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls select when fetching user trips", async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    vi.mocked(supabase!.from).mockReturnValue({ select: mockSelect } as any);

    const repo = new SupabaseTripRepository();
    const trips = await repo.fetchTrips("user-1");

    expect(supabase!.from).toHaveBeenCalledWith("trips");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(trips).toEqual([]);
  });

  it("round-trips canonical dates and persisted stop order", async () => {
    const stops = [
      { id: "stop-2", type: "custom", name: "Hotel" },
      {
        id: "stop-1",
        type: "destination",
        destinationId: "ginza",
        name: "Ginza",
        date: "2026-08-08",
      },
    ];
    const row = {
      id: "trip-1",
      user_id: "user-1",
      title: "Tokyo weekend",
      start_date: "2026-08-08",
      end_date: "2026-08-09",
      status: "draft",
      stops,
      journal_notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const mockOrder = vi.fn().mockResolvedValue({ data: [row], error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase!.from).mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    } as any);

    const repo = new SupabaseTripRepository();
    const [reloaded] = await repo.fetchTrips("user-1");
    await repo.saveTrip(reloaded);

    expect(reloaded.startDate).toBe("2026-08-08");
    expect(reloaded.endDate).toBe("2026-08-09");
    expect(reloaded.stops.map((stop) => stop.id)).toEqual(["stop-2", "stop-1"]);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        start_date: "2026-08-08",
        end_date: "2026-08-09",
        stops,
      }),
    );
  });

  it("persists canonical date edits through a save and reload cycle", async () => {
    let persistedRow: any = {
      id: "trip-2",
      user_id: "user-1",
      title: "Kyoto weekend",
      start_date: null,
      end_date: null,
      status: "draft",
      stops: [],
      journal_notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const mockOrder = vi.fn().mockImplementation(async () => ({
      data: [persistedRow],
      error: null,
    }));
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockUpsert = vi.fn().mockImplementation(async (payload) => {
      persistedRow = payload;
      return { error: null };
    });

    vi.mocked(supabase!.from).mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    } as any);

    const repo = new SupabaseTripRepository();
    const [initial] = await repo.fetchTrips("user-1");
    await repo.saveTrip({
      ...initial,
      startDate: "2026-09-12",
      endDate: "2026-09-15",
    });

    const [reloaded] = await repo.fetchTrips("user-1");
    expect(reloaded.startDate).toBe("2026-09-12");
    expect(reloaded.endDate).toBe("2026-09-15");

    await repo.saveTrip({
      ...reloaded,
      startDate: undefined,
      endDate: undefined,
    });
    expect(persistedRow.start_date).toBeNull();
    expect(persistedRow.end_date).toBeNull();
  });
});
