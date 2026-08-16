import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Privacy from "../Privacy";
import Cookies from "../Cookies";
import Terms from "../Terms";

describe("Legal contact surfaces", () => {
  it.each([
    ["privacy", Privacy],
    ["cookies", Cookies],
    ["terms", Terms],
  ])("%s page shows the canonical public contact email", (_name, Page) => {
    const html = renderToString(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
    expect(html).toContain("info@meguruto.app");
    expect(html).not.toContain("kaihatsu.studio");
    expect(html).not.toContain("@meguruto.jp");
  });
});
