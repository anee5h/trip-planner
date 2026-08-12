/**
 * KAI-85 browser QA: mobile selection of the immediate weekend and following weekday.
 *
 * Usage: npm run dev -- --host 127.0.0.1 --port 5174
 *        node qa/kai-85/browser-qa.mjs
 */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5174";
const dates = [
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
  "2026-08-16",
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  locale: "en-US",
});
const page = await context.newPage();

await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
await page.route("**/v1/forecast**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      daily: {
        time: dates,
        weathercode: dates.map(() => 0),
        temperature_2m_max: dates.map(() => 25),
        temperature_2m_min: dates.map(() => 18),
      },
    }),
  });
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
const trigger = page.locator('button[aria-haspopup="dialog"]');
await trigger.waitFor({ timeout: 20000 });

for (const date of ["2026-08-15", "2026-08-16", "2026-08-17"]) {
  if (await page.locator('[role="dialog"]').count()) {
    await page
      .locator('[role="dialog"] button[aria-label*="Close"]')
      .first()
      .click();
  }
  await trigger.click();

  const day = page.locator(`button[data-date="${date}"]`);
  await day.waitFor({ timeout: 10000 });
  if ((await day.getAttribute("disabled")) !== null) {
    throw new Error(`${date} is disabled on the phone viewport`);
  }
  await day.click();

  await page.waitForFunction(
    (expected) =>
      new URL(window.location.href).searchParams.get("date") === expected,
    date,
  );
  const selected = await trigger.textContent();
  if (!selected?.includes(`Aug ${Number(date.slice(-2))}`)) {
    throw new Error(`Date capsule did not retain ${date}: ${selected}`);
  }
}

console.log("PASS KAI-85 mobile date selection: Aug 15, Aug 16, Aug 17");
await browser.close();
