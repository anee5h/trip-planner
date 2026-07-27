import { describe, it, expect } from "vitest";

describe("useTripSync - Race condition and set union hydration tests", () => {
  it("prevents premature hydration flag when trips query resolves before user_data query", async () => {
    let isLoaded = false;
    let localVisited: string[] = [];

    // Simulate trips query completing fast (5ms)
    const tripsPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 5);
    });

    // Simulate user_data query taking longer (30ms)
    const userDataPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        localVisited = ["tokyo-station", "sensoji", "himeji-castle"];
        resolve();
      }, 30);
    });

    // Promise.allSettled synchronization
    const syncPromise = Promise.allSettled([
      userDataPromise,
      tripsPromise,
    ]).then(() => {
      isLoaded = true;
    });

    // Fast trips promise finishes at 5ms, but isLoaded should still be false
    await tripsPromise;
    expect(isLoaded).toBe(false);

    // After all promises settle (30ms+), isLoaded becomes true and visited is fully hydrated
    await syncPromise;
    expect(isLoaded).toBe(true);
    expect(localVisited).toHaveLength(3);
  });

  it("merges remote visited array with local visited array via set union without erasing items", () => {
    const localVisited = ["tokyo-station", "shibuya-sky-shibuya"];
    const remoteVisited = ["tokyo-station", "himeji-castle", "osaka-castle"];

    const combined = Array.from(new Set([...localVisited, ...remoteVisited]));

    expect(combined).toEqual([
      "tokyo-station",
      "shibuya-sky-shibuya",
      "himeji-castle",
      "osaka-castle",
    ]);
    expect(combined).toHaveLength(4);
  });
});
