/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModalDialog from "../ModalDialog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
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

function renderDialog(onClose = vi.fn()) {
  const opener = document.createElement("button");
  opener.type = "button";
  opener.textContent = "Open dialog";
  document.body.appendChild(opener);
  opener.focus();

  act(() => {
    root!.render(
      <ModalDialog
        titleId="dialog-title"
        onClose={onClose}
        className="test-dialog"
      >
        <h2 id="dialog-title">Edit dates</h2>
        <input data-dialog-initial-focus aria-label="Start date" />
        <button type="button">Save</button>
      </ModalDialog>,
    );
  });

  return { opener, onClose };
}

describe("ModalDialog", () => {
  it("moves focus into the dialog and traps Tab navigation", () => {
    const { opener } = renderDialog();
    const dialog = host!.querySelector('[role="dialog"]')!;
    const initial = host!.querySelector<HTMLInputElement>(
      "[data-dialog-initial-focus]",
    )!;
    const save = host!.querySelector<HTMLButtonElement>("button:last-child")!;

    expect(document.activeElement).toBe(initial);

    act(() => {
      save.focus();
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(initial);

    act(() => {
      initial.focus();
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(document.activeElement).toBe(save);

    expect(opener).not.toBe(document.activeElement);
  });

  it("closes on Escape and returns focus to the opener", () => {
    const { opener, onClose } = renderDialog();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => root!.unmount());
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("uses an explicit opener when the triggering menu item unmounts", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.appendChild(opener);

    const onClose = vi.fn();
    act(() => {
      root!.render(
        <ModalDialog titleId="dialog-title" onClose={onClose} opener={opener}>
          <h2 id="dialog-title">Rename</h2>
          <input data-dialog-initial-focus aria-label="Trip title" />
        </ModalDialog>,
      );
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => root!.unmount());
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
