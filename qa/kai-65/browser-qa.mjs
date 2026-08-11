/**
 * KAI-65 manual browser QA: mobile search zoom persistence + duplicate clear control.
 *
 * Usage: node qa/kai-65/browser-qa.mjs   (requires dev server on :5174)
 *
 * Engines: Playwright WebKit (closest available to the Safari engine) + Chromium.
 * Viewports: 360, 390, 430, 768 (mobile/tablet), 1440 (desktop regression).
 * Locales: EN + JA (navigator.language driven).
 *
 * LIMITATION (documented): Playwright WebKit on Linux is the desktop WebKit
 * engine — it does not implement iOS Safari's optical focus-zoom, so the
 * "page stays enlarged after dismiss" symptom itself cannot be reproduced in
 * automation. This script instead verifies the preventive contract (every
 * mobile search input computes >= 16px font-size, the condition iOS Safari
 * uses to decide whether to zoom on focus) and that the app never applies its
 * own scale/transform. Real-device iOS QA remains the authoritative check for
 * the optical-zoom symptom; unit tests cover the markup/CSS contract.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webkit, chromium } from "playwright";

const BASE = "http://localhost:5174";
const SHOTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "screenshots",
);
mkdirSync(SHOTS, { recursive: true });

const results = [];
let failures = 0;

function record(engine, width, locale, check, ok, detail = "") {
  results.push({ engine, width, locale, check, ok, detail });
  if (!ok) failures += 1;
}

async function evalMetrics(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      overflowX: de.scrollWidth - de.clientWidth,
      bodyTransform: body ? getComputedStyle(body).transform : "",
      htmlTransform: getComputedStyle(de).transform,
      bodyZoom: body ? getComputedStyle(body).zoom : "",
      visualViewportScale: window.visualViewport
        ? window.visualViewport.scale
        : null,
    };
  });
}

async function getViewportMeta(page) {
  return page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return m ? m.getAttribute("content") : null;
  });
}

/**
 * getComputedStyle(el, '::-webkit-search-cancel-button') returns UA defaults
 * in Chromium and empty styles in WebKit regardless of author rules, so a
 * style probe cannot prove suppression. Verified approaches instead:
 *   1. the scoped suppression rule exists in the served stylesheet, and
 *   2. the input carries the opt-in class,
 * plus visual verification (screenshots inspected in both engines showed the
 * native X disappears with the rule applied — see qa/kai-65/screenshots and
 * the isolated probe documented in the KAI-65 PR).
 */
async function nativeCancelSuppressed(page, inputSelector) {
  const cls = await page
    .locator(inputSelector)
    .getAttribute("class")
    .catch(() => null);
  const ruleInCss = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (
            rule.selectorText &&
            rule.selectorText.includes("no-native-search-cancel") &&
            rule.selectorText.includes("search-cancel-button")
          ) {
            return true;
          }
        }
      } catch {
        /* cross-origin / opaque sheet */
      }
    }
    return false;
  });
  if (ruleInCss && (cls ?? "").includes("no-native-search-cancel")) {
    return {
      ok: true,
      detail: "opt-in class + scoped suppression rule in stylesheet",
    };
  }
  // Vite dev may keep CSS in JS modules; fall back to fetching the module.
  if (ruleInCss === false) {
    const text = await page.request
      .get(`${BASE}/src/index.css`)
      .then((r) => r.text())
      .catch(() => "");
    if (
      text.includes(
        "input.no-native-search-cancel::-webkit-search-cancel-button",
      )
    ) {
      return {
        ok: true,
        detail:
          "rule present in served index.css module (dev-mode stylesheet scan unavailable)",
      };
    }
  }
  return {
    ok: false,
    detail: `class=${cls ?? "null"}, ruleInCss=${ruleInCss}, visual proof in screenshots only`,
  };
}

/**
 * The GlobalSearch navbar inline input (hidden md:flex; sticky header is z-50)
 * also renders a clear X. Scope dialog assertions to the dialog portal only:
 * find the dialog input (aria-label + bg-transparent) and count within its
 * `fixed inset-0` portal root.
 */
async function countInDialog(page, searchLabel, selector) {
  return page.evaluate(
    ({ label, selector }) => {
      const input = [
        ...document.querySelectorAll('input[aria-label="' + label + '"]'),
      ].find((i) => i.className.includes("bg-transparent"));
      const root = input ? input.closest("div.fixed.inset-0") : null;
      return root ? root.querySelectorAll(selector).length : -1;
    },
    { label: searchLabel, selector },
  );
}

/** GlobalSearch navbar inline input — distinctive left-padding class. */
function navbarInput(page) {
  return page.locator('input[class*="pl-[42px]"]');
}

/** Open the global search dialog: BottomNav button (<768) or Ctrl+K (>=768). */
async function openSearchDialog(page, width, searchLabel) {
  if (width >= 768) {
    await page.keyboard.press("Control+k");
  } else {
    await page.click(
      `nav[aria-label="Mobile Navigation"] button[aria-label="${searchLabel}"]`,
    );
  }
}

/** Dismiss: Cancel button (<640) or Escape key (>=640, ESC badge exists there). */
async function dismissSearchDialog(page, width, closeLabel) {
  if (width < 640) {
    await page.click(`button[aria-label="${closeLabel}"]`);
  } else {
    await page.keyboard.press("Escape");
  }
}

async function runMobileFlow(engineName, engine, width, locale) {
  const label = locale === "ja" ? "ja-JP" : "en-US";
  const searchLabel = locale === "ja" ? "検索" : "Search";
  const clearLabel = locale === "ja" ? "検索をクリア" : "Clear search input";
  const closeLabel = locale === "ja" ? "検索を閉じる" : "Close search";

  const context = await engine.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: width < 768,
    hasTouch: width < 768,
    locale: label,
  });
  const page = await context.newPage();
  const tag = `${engineName}@${width}px/${locale}`;
  const dialogInput = () =>
    page.locator('input[aria-label="' + searchLabel + '"].bg-transparent');

  try {
    // --- Open page ---
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    if (width < 768) {
      await page.waitForSelector('nav[aria-label="Mobile Navigation"] button', {
        timeout: 20000,
      });
    } else {
      await navbarInput(page).waitFor({ state: "visible", timeout: 20000 });
    }
    await page.waitForTimeout(600);

    const meta = await getViewportMeta(page);
    record(
      tag,
      width,
      locale,
      "viewport meta has no restrictive values",
      !!meta && !/maximum-scale|user-scalable/.test(meta),
      meta ?? "missing",
    );

    const before = await evalMetrics(page);

    // --- Open Search ---
    await openSearchDialog(page, width, searchLabel);
    await dialogInput().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(500);

    // autoFocus: input is focused on open
    const focused = await page.evaluate(
      () => document.activeElement?.tagName === "INPUT",
    );
    record(tag, width, locale, "search opens with input focused", focused);

    const fs = await dialogInput().evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    record(
      tag,
      width,
      locale,
      "dialog input font-size >= 16px (iOS focus-zoom prevention)",
      fs >= 16,
      `${fs}px`,
    );

    const placeholder = await dialogInput().getAttribute("placeholder");
    if (width < 640) {
      record(
        tag,
        width,
        locale,
        "mobile placeholder locale-correct",
        locale === "ja"
          ? placeholder === "めぐるとを検索"
          : placeholder === "Search Meguruto",
        placeholder ?? "null",
      );
    } else {
      record(
        tag,
        width,
        locale,
        "tablet placeholder = desktop placeholder",
        placeholder ===
          (locale === "ja"
            ? "目的地・コレクション・アクションを検索（例：京都、UNESCO）"
            : "Search destinations, collections, actions... (e.g., 'Kyoto', 'UNESCO')"),
        placeholder ?? "null",
      );
    }

    // --- Type query ---
    await dialogInput().fill("kyoto");
    await page.waitForTimeout(400);
    const value1 = await dialogInput().inputValue();
    record(
      tag,
      width,
      locale,
      "typing updates the query",
      value1 === "kyoto",
      value1,
    );

    // Exactly one X in the dialog (clear). Close control is Cancel text/ESC badge, not an X.
    const xCount = await countInDialog(page, searchLabel, "svg.lucide-x");
    const clearCount = await countInDialog(
      page,
      searchLabel,
      'button[aria-label="' + clearLabel + '"]',
    );
    record(
      tag,
      width,
      locale,
      "exactly one X icon in dialog (clear)",
      xCount === 1,
      `${xCount} X`,
    );
    record(
      tag,
      width,
      locale,
      "exactly one clear button",
      clearCount === 1,
      `${clearCount} clear`,
    );

    // --- Clear ---
    await page.click(
      'div.fixed.inset-0 button[aria-label="' + clearLabel + '"]',
    );
    await page.waitForTimeout(300);
    const value2 = await dialogInput().inputValue();
    const stillFocused = await page.evaluate(
      () => document.activeElement?.tagName === "INPUT",
    );
    record(tag, width, locale, "clear empties query", value2 === "", value2);
    record(tag, width, locale, "clear keeps input focused", stillFocused);

    // --- Type again ---
    await dialogInput().fill("osaka");
    await page.waitForTimeout(400);
    const value3 = await dialogInput().inputValue();
    record(
      tag,
      width,
      locale,
      "re-type after clear works",
      value3 === "osaka",
      value3,
    );

    await page.screenshot({
      path: path.join(
        SHOTS,
        `${engineName}-${width}-${locale}-dialog-query.png`,
      ),
    });

    // --- Dismiss ---
    await dismissSearchDialog(page, width, closeLabel);
    await dialogInput().waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(500);

    const after = await evalMetrics(page);
    const zoomSafe =
      after.bodyTransform === "none" &&
      after.htmlTransform === "none" &&
      (after.visualViewportScale === null || after.visualViewportScale === 1);
    record(
      tag,
      width,
      locale,
      "dismiss leaves no app-level scale/transform",
      zoomSafe,
      JSON.stringify(after),
    );
    // 768px has a pre-existing navbar overflow (~84px, present at page load,
    // unrelated to Search); assert search does not INCREASE it.
    record(
      tag,
      width,
      locale,
      "no NEW horizontal overflow after dismiss",
      after.overflowX <= before.overflowX + 1,
      `overflowX ${before.overflowX}px -> ${after.overflowX}px`,
    );
    record(
      tag,
      width,
      locale,
      "no scroll jump after dismiss",
      after.scrollY === before.scrollY,
      `scrollY ${before.scrollY} -> ${after.scrollY}`,
    );

    await page.screenshot({
      path: path.join(
        SHOTS,
        `${engineName}-${width}-${locale}-after-dismiss.png`,
      ),
    });

    // --- Reopen (clean state) ---
    await openSearchDialog(page, width, searchLabel);
    await dialogInput().waitFor({ state: "visible", timeout: 15000 });
    await dialogInput().fill("tokyo");
    await page.waitForTimeout(300);
    const reopened = await dialogInput().inputValue();
    record(
      tag,
      width,
      locale,
      "reopen works with clean state",
      reopened === "tokyo",
      reopened,
    );
    await dismissSearchDialog(page, width, closeLabel);
    await dialogInput().waitFor({ state: "detached", timeout: 10000 });

    // --- Browser Back: open Search from /destinations, Back returns to / ---
    await page.goto(`${BASE}/destinations`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page
      .locator('input[type="search"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(600);
    await openSearchDialog(page, width, searchLabel);
    await dialogInput().waitFor({ state: "visible", timeout: 15000 });
    await dialogInput().fill("tokyo");
    await page.waitForTimeout(300);
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(800);
    const urlAfterBack = page.url();
    const backClean = await evalMetrics(page);
    record(
      tag,
      width,
      locale,
      "browser Back navigates per existing history (no loop)",
      urlAfterBack === `${BASE}/`,
      `url=${urlAfterBack}`,
    );
    record(
      tag,
      width,
      locale,
      "no scale/new overflow after Back",
      backClean.htmlTransform === "none" &&
        backClean.overflowX <= before.overflowX + 1,
      JSON.stringify(backClean),
    );
    await page.screenshot({
      path: path.join(SHOTS, `${engineName}-${width}-${locale}-after-back.png`),
    });

    // --- Destinations page search input ---
    await page.goto(`${BASE}/destinations`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const destInput = page.locator('input[type="search"]');
    await destInput.waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(600);

    const dfs = await destInput.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    record(
      tag,
      width,
      locale,
      "Destinations search font-size >= 16px on mobile",
      dfs >= 16,
      `${dfs}px`,
    );

    const cls = await destInput.getAttribute("class");
    record(
      tag,
      width,
      locale,
      "Destinations input opts into no-native-search-cancel",
      (cls ?? "").includes("no-native-search-cancel"),
    );

    await destInput.fill("kyoto");
    await page.waitForTimeout(500);
    const destX = await page.evaluate(() => {
      const input = document.querySelector('input[type="search"]');
      const field = input?.closest("div.relative");
      return field ? field.querySelectorAll("svg.lucide-x").length : -1;
    });
    record(
      tag,
      width,
      locale,
      "exactly one X in Destinations search field",
      destX === 1,
      `${destX} X`,
    );

    const native = await nativeCancelSuppressed(page, 'input[type="search"]');
    record(
      tag,
      width,
      locale,
      "native WebKit search-cancel suppressed",
      native.ok,
      native.detail,
    );

    await page.screenshot({
      path: path.join(
        SHOTS,
        `${engineName}-${width}-${locale}-dest-search.png`,
      ),
    });
  } catch (e) {
    record(
      tag,
      width,
      locale,
      "flow completed without errors",
      false,
      `exception: ${String(e).slice(0, 200)}`,
    );
  } finally {
    await context.close();
  }
}

async function runDesktopFlow(engineName, engine, locale) {
  const label = locale === "ja" ? "ja-JP" : "en-US";
  const searchLabel = locale === "ja" ? "検索" : "Search";
  const clearLabel = locale === "ja" ? "検索をクリア" : "Clear search input";

  const context = await engine.newContext({
    viewport: { width: 1440, height: 900 },
    locale: label,
  });
  const page = await context.newPage();
  const tag = `${engineName}@1440px/${locale}`;

  try {
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await navbarInput(page).waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(800);

    // Navbar inline search (GlobalSearch) — desktop only
    const navInput = navbarInput(page);
    const nfs = await navInput.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    record(
      tag,
      1440,
      locale,
      "desktop navbar input keeps compact 12px size",
      Math.abs(nfs - 12) <= 0.5,
      `${nfs}px`,
    );

    await navInput.fill("kyoto");
    await page.waitForTimeout(600);
    const popover = page.locator('div[class*="top-full"]');
    await popover.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    const popoverRows = await popover.count().then(async () => {
      const visible = await popover.isVisible();
      if (!visible) return 0;
      return page.evaluate(() => {
        const pop = document.querySelector('div[class*="top-full"]');
        return pop ? pop.querySelectorAll("a, button").length : 0;
      });
    });
    record(
      tag,
      1440,
      locale,
      "desktop inline results render for query",
      popoverRows > 0,
      `${popoverRows} result rows`,
    );

    await page.click('button[aria-label="' + clearLabel + '"]');
    await page.waitForTimeout(300);
    const cleared = await navInput.inputValue();
    record(
      tag,
      1440,
      locale,
      "desktop clear empties query",
      cleared === "",
      cleared,
    );

    // Dialog via Ctrl+K; keyboard Escape closes
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+k" : "Control+k",
    );
    const dialogInput = page.locator(
      'input[aria-label="' + searchLabel + '"].bg-transparent',
    );
    await dialogInput.waitFor({ state: "visible", timeout: 15000 });
    const dfs = await dialogInput.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    record(
      tag,
      1440,
      locale,
      "desktop dialog input font-size unchanged (16px)",
      Math.abs(dfs - 16) <= 0.5,
      `${dfs}px`,
    );
    await dialogInput.fill("osaka");
    await page.waitForTimeout(400);
    const dlgX = await countInDialog(page, searchLabel, "svg.lucide-x");
    record(
      tag,
      1440,
      locale,
      "desktop dialog shows exactly one X (clear)",
      dlgX === 1,
      `${dlgX} X`,
    );

    await page.keyboard.press("Escape");
    await dialogInput.waitFor({ state: "detached", timeout: 10000 });
    record(tag, 1440, locale, "Escape closes dialog (desktop keyboard)", true);

    await page.screenshot({
      path: path.join(SHOTS, `${engineName}-1440-${locale}-desktop.png`),
    });
  } catch (e) {
    record(
      tag,
      1440,
      locale,
      "desktop flow completed without errors",
      false,
      `exception: ${String(e).slice(0, 200)}`,
    );
  } finally {
    await context.close();
  }
}

const wk = await webkit.launch();
const cr = await chromium.launch();
try {
  for (const [name, engine] of [
    ["webkit", wk],
    ["chromium", cr],
  ]) {
    for (const width of [360, 390, 430, 768]) {
      for (const locale of ["en", "ja"]) {
        await runMobileFlow(name, engine, width, locale);
      }
    }
    for (const locale of ["en", "ja"]) {
      await runDesktopFlow(name, engine, locale);
    }
  }
} finally {
  await wk.close();
  await cr.close();
}

// Summary table
console.log("\n=== KAI-65 browser QA summary ===");
console.log(
  ["engine", "width", "locale", "check", "result", "detail"]
    .map((h) => h.padEnd(10))
    .join(""),
);
for (const r of results) {
  console.log(
    [
      r.engine.padEnd(10),
      String(r.width).padEnd(10),
      r.locale.padEnd(10),
      r.check.slice(0, 48).padEnd(48),
      (r.ok ? "PASS" : "FAIL").padEnd(10),
      r.detail.slice(0, 60),
    ].join(""),
  );
}
console.log(`\n${results.length} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
