/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OriginLocationDisplay } from "../OriginLocationDisplay";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ locale: "en" as "en" | "ja" }));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: state.locale, setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "origin.from": state.locale === "ja" ? "出発地" : "From",
        "origin.edit": state.locale === "ja" ? "編集" : "Edit",
      })[key] ?? key,
  }),
}));

let root: Root;
let host: HTMLDivElement;

function render(onEdit = vi.fn(), editDisabled = false) {
  act(() =>
    root.render(
      <OriginLocationDisplay
        origin="Nakayama Station (中山駅), Kanagawa"
        onEdit={onEdit}
        editDisabled={editDisabled}
      />,
    ),
  );
  return onEdit;
}

beforeEach(() => {
  state.locale = "en";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("OriginLocationDisplay", () => {
  it("updates to the active locale without mixed-language text", () => {
    render();
    expect(host.textContent).toContain("From");
    expect(host.textContent).toContain("Nakayama Station, Kanagawa");
    expect(host.textContent).not.toContain("中山駅");

    state.locale = "ja";
    render();
    expect(host.textContent).toContain("出発地");
    expect(host.textContent).toContain("中山駅、神奈川県");
    expect(host.textContent).not.toContain("Nakayama Station");
  });

  it("keeps Edit visible and callable in a fixed grid column", () => {
    const onEdit = render();
    const button = host.querySelector("button")!;

    expect(host.firstElementChild?.className).toContain(
      "grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(button.textContent).toBe("Edit");
    act(() => button.click());
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("disables only the Edit action when profile mutation is unavailable", () => {
    const onEdit = render(vi.fn(), true);
    const button = host.querySelector("button")!;

    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(onEdit).not.toHaveBeenCalled();
  });
});
