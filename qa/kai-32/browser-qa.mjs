/**
 * KAI-32 manual browser QA: EN + JA destination pages, desktop + mobile.
 * Usage: node qa/kai-32/browser-qa.mjs  (requires dev server on :5174)
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:5174";
const CASES = [
  { id: "okayama-city", label: "Okayama hub" },
  { id: "korakuen-okayama", label: "Korakuen" },
  { id: "kurashiki-city", label: "Kurashiki hub" },
  { id: "ohara-museum-of-art", label: "Ohara Museum" },
  { id: "hiroshima-city", label: "Hiroshima hub" },
  { id: "miyajima-itsukushima", label: "Miyajima/Itsukushima" },
  { id: "daisho-in", label: "Daisho-in (Miyajima)" },
  { id: "hatsukaichi-city", label: "Hatsukaichi hub" },
  { id: "matsue-city", label: "Matsue hub" },
  { id: "izumo-taisha", label: "Izumo Taisha" },
  { id: "uradome-coast", label: "Uradome Coast (Tottori)" },
  { id: "karato-market-shimonoseki", label: "Karato Market (Yamaguchi)" },
];

const results = [];
const browser = await chromium.launch();
for (const c of CASES) {
  for (const locale of ["en", "ja"]) {
    for (const width of [1440, 410]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        locale: locale === "ja" ? "ja-JP" : "en-US",
      });
      const url = `${BASE}/destinations/${c.id}`;
      const errors = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !/favicon/.test(m.text()))
          errors.push(`console: ${m.text().slice(0, 120)}`);
      });
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        // Wait for the detail page to actually render (lazy-loaded route);
        // the CTA label differs by locale (EN: Add to Itinerary / JA: 旅程に追加).
        await page.waitForSelector("text=/Add to Itinerary|旅程に追加/", {
          timeout: 20000,
        });
        await page.waitForTimeout(800);
      } catch (e) {
        results.push({
          ...c,
          locale,
          width,
          ok: false,
          errors: [`wait: ${e.message.slice(0, 100)}`],
        });
        await page.close();
        continue;
      }
      const body = (await page.locator("body").innerText()).slice(0, 4000);
      const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(
        body,
      );
      const ok = body.length > 300 && errors.length === 0;
      const jaOk = locale === "ja" ? hasJapanese : true;
      const note = [];
      if (c.id === "miyajima-itsukushima") {
        if (/ferry|Ferry|フェリー/.test(body)) note.push("ferry-mentioned");
        if (/naha|nago|motobu|Okinawa|沖縄/.test(body))
          note.push("OKINAWA-LEFTOVER");
        if (/train|Train|電車/.test(body)) note.push("TRAIN-CLAIMED");
      }
      if (c.id === "izumo-taisha" && /Rikuch|Iwate|2011|岩手/.test(body))
        note.push("IWATE-LEFTOVER");
      if (c.id === "korakuen-okayama" && /1280px/.test(body))
        note.push("hero-1280px");
      if (/Not Found|404/.test(body)) note.push("NOT-FOUND");
      if (locale === "ja" && !hasJapanese) note.push("NO-JA");
      results.push({
        ...c,
        locale,
        width,
        ok: ok && jaOk,
        bodyLen: body.length,
        ja: hasJapanese,
        note: note.join(",") || "-",
        errors: errors.slice(0, 2),
      });
      await page.close();
    }
  }
}
await browser.close();
for (const r of results) {
  console.log(
    `${r.ok ? "PASS" : "FAIL"} ${r.label.padEnd(26)} ${r.locale} ${String(r.width).padEnd(5)} body=${r.bodyLen} ja=${r.ja} ${r.note}${r.ok ? "" : " ERR=" + r.errors.join("; ")}`,
  );
}
const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length ? 1 : 0);
