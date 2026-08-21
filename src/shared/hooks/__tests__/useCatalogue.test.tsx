/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanonicalPlace,
  CatalogueNeed,
} from "@/shared/services/place/PlaceCatalog";
import { useCatalogue } from "../useCatalogue";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const loadCatalogue = vi.hoisted(() => vi.fn());
const loadedPlaces = vi.hoisted(() => ({
  summary: [{ id: "summary-place", name: "Summary place" }],
  full: [
    {
      id: "full-place",
      name: "Full place",
      content: { en: { name: "Full place" } },
    },
  ],
}));

const fixtures = loadedPlaces as unknown as Record<
  CatalogueNeed,
  CanonicalPlace[]
>;

vi.mock("@/shared/services/place/PlaceCatalog", () => ({
  loadCatalogue,
  getFullPlaces: () => loadedPlaces.full,
  getLoadedLitePlaces: () => loadedPlaces.summary,
  hasLoadedFullIndex: () => false,
  hasLoadedLiteIndex: () => false,
}));

interface ProbeProps {
  need: CatalogueNeed;
  enabled?: boolean;
}

function Probe({ need, enabled = true }: ProbeProps) {
  const state = useCatalogue({ need, enabled });
  return (
    <div>
      <output data-testid="status">{state.status}</output>
      <output data-testid="places">
        {state.places.map((place) => place.id).join(",")}
      </output>
      <output data-testid="error">{state.error?.message ?? ""}</output>
      <button data-testid="retry" onClick={state.retry} />
    </div>
  );
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function renderProbe(props: ProbeProps) {
  act(() => {
    root!.render(<Probe {...props} />);
  });
}

function text(testId: string) {
  return host!.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  loadCatalogue.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("useCatalogue", () => {
  it("stays idle and does not load while disabled", async () => {
    renderProbe({ need: "summary", enabled: false });
    await flush();

    expect(text("status")).toBe("idle");
    expect(text("places")).toBe("");
    expect(loadCatalogue).not.toHaveBeenCalled();
  });

  it("loads exactly once when enabled changes from false to true", async () => {
    const deferred = Promise.resolve(loadedPlaces.summary as CanonicalPlace[]);
    loadCatalogue.mockReturnValue(deferred);

    renderProbe({ need: "summary", enabled: false });
    renderProbe({ need: "summary", enabled: true });
    await flush();

    expect(loadCatalogue).toHaveBeenCalledTimes(1);
    expect(loadCatalogue).toHaveBeenCalledWith("summary");
    expect(text("status")).toBe("ready");
    expect(text("places")).toBe("summary-place");
  });

  it("loads summary and full intents through their respective requests", async () => {
    loadCatalogue.mockImplementation((need: CatalogueNeed) =>
      Promise.resolve(fixtures[need]),
    );

    renderProbe({ need: "summary" });
    await flush();
    expect(loadCatalogue).toHaveBeenLastCalledWith("summary");
    expect(text("places")).toBe("summary-place");

    renderProbe({ need: "full" });
    await flush();
    expect(loadCatalogue).toHaveBeenLastCalledWith("full");
    expect(text("places")).toBe("full-place");
  });

  it("reports an initial failure and recovers on retry", async () => {
    const failure = new Error("summary unavailable");
    loadCatalogue
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(loadedPlaces.summary as CanonicalPlace[]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderProbe({ need: "summary" });
    await flush();
    expect(text("status")).toBe("error");
    expect(text("error")).toBe("summary unavailable");

    act(() => {
      host!.querySelector<HTMLButtonElement>("[data-testid='retry']")!.click();
    });
    expect(text("status")).toBe("loading");
    await flush();

    expect(text("status")).toBe("ready");
    expect(text("places")).toBe("summary-place");
    errorSpy.mockRestore();
  });

  it("retains places but reports loading during retry, then exposes failure", async () => {
    loadCatalogue.mockResolvedValueOnce(
      loadedPlaces.summary as CanonicalPlace[],
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderProbe({ need: "summary" });
    await flush();
    expect(text("status")).toBe("ready");
    expect(text("places")).toBe("summary-place");

    let rejectRefresh!: (error: Error) => void;
    const refresh = new Promise<CanonicalPlace[]>((_, reject) => {
      rejectRefresh = reject;
    });
    loadCatalogue.mockReturnValueOnce(refresh);
    act(() => {
      host!.querySelector<HTMLButtonElement>("[data-testid='retry']")!.click();
    });
    expect(text("status")).toBe("loading");
    expect(text("places")).toBe("summary-place");

    rejectRefresh(new Error("refresh failed"));
    await flush();
    expect(text("status")).toBe("error");
    expect(text("places")).toBe("summary-place");
    expect(text("error")).toBe("refresh failed");
    errorSpy.mockRestore();
  });

  it("loads the full source when need changes from summary to full", async () => {
    loadCatalogue.mockImplementation((need: CatalogueNeed) =>
      Promise.resolve(fixtures[need]),
    );

    renderProbe({ need: "summary" });
    await flush();
    renderProbe({ need: "full" });
    await flush();

    expect(loadCatalogue).toHaveBeenNthCalledWith(1, "summary");
    expect(loadCatalogue).toHaveBeenNthCalledWith(2, "full");
    expect(text("places")).toBe("full-place");
  });
});
