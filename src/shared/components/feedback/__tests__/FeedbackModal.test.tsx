/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackModal } from "../FeedbackModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const enMap: Record<string, string> = {
  "feedbackModal.title": "Send Feedback",
  "feedbackModal.subtitle": "Help us improve Meguruto for travelers",
  "feedbackModal.typesLabel": "Feedback Type",
  "feedbackModal.types.general": "General",
  "feedbackModal.types.feature": "Feature",
  "feedbackModal.types.bug": "Bug Report",
  "feedbackModal.messageLabel": "Your Message",
  "feedbackModal.placeholder": "Share your thoughts, suggestions, or issues...",
  "feedbackModal.cancel": "Cancel",
  "feedbackModal.submit": "Submit Feedback",
  "feedbackModal.retry": "Try Again",
  "feedbackModal.submitting": "Sending...",
  "feedbackModal.errorGeneric": "Failed to submit feedback. Please try again.",
  "feedbackModal.successTitle": "Thank you for your feedback!",
  "feedbackModal.successMessage": "Your feedback has been sent.",
  "feedbackModal.sendEmail": "Also Send via Email",
  "feedbackModal.done": "Done",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) =>
      enMap[key] ?? opts?.defaultValue ?? key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 201 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  document.body.innerHTML = "";
});

const renderModal = () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);
  });
};

const setMessage = (text: string) => {
  const textarea =
    document.body.querySelector<HTMLTextAreaElement>("textarea")!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async () => {
  await act(async () => {
    document.body
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

describe("FeedbackModal — KAI-96 delivery semantics", () => {
  it("posts to /api/feedback with full context and shows success only after backend confirms", async () => {
    renderModal();
    setMessage("Great app, loved the Kyoto guide");

    await submit();

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/feedback");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBeUndefined();
    const payload = JSON.parse(init.body);
    expect(payload.message).toBe("Great app, loved the Kyoto guide");
    expect(payload.type).toBe("general");
    expect(payload.locale).toBe("en");
    expect(payload.route).toBe("/");
    expect(payload.app_version).toBeTruthy();
    expect(payload.browser_class).toBe("desktop");
    expect(payload.user_id).toBeUndefined();

    expect(document.body.textContent).toContain("Thank you for your feedback!");
  });

  it("shows a localized error and preserves the message when the backend fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, { status: 502 }),
    );
    renderModal();
    setMessage("This should fail");

    await submit();

    expect(document.body.textContent).toContain(
      "Failed to submit feedback. Please try again.",
    );
    expect(
      (document.body.querySelector("textarea") as HTMLTextAreaElement).value,
    ).toBe("This should fail");
    // Retry affordance present
    expect(document.body.textContent).toContain("Try Again");
    // No false success
    expect(document.body.textContent).not.toContain(
      "Thank you for your feedback!",
    );
  });

  it("retries after failure and only then shows success", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    renderModal();
    setMessage("Retry me");

    await submit();
    expect(document.body.textContent).toContain("Try Again");

    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("Thank you for your feedback!");
  });

  it("does not fire duplicate requests while a submission is pending", async () => {
    let resolveFetch: (r: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    setMessage("Double tap test");

    // Two rapid submit attempts while pending
    await act(async () => {
      const form = document.body.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch!(new Response(null, { status: 201 }));
    });
    expect(document.body.textContent).toContain("Thank you for your feedback!");
  });

  it("sends the Supabase session token for server-side identity verification when signed in", async () => {
    const { supabase } = await import("@/lib/supabase");
    (supabase!.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        session: {
          access_token: "test-access-token",
          user: { id: "4c6e379c-eaa4-4ff0-80fa-bcf6b8118b8b" },
        },
      },
    });
    renderModal();
    setMessage("Signed in feedback");

    await submit();

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    // The client must never send a user id of its own — identity is
    // derived server-side from the verified token.
    const payload = JSON.parse(init.body);
    expect(payload.user_id).toBeUndefined();
  });
});
