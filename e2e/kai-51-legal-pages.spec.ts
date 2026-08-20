import { expect, test } from "./fixtures";

/**
 * KAI-51 J16: legal pages render and remain reachable — terms, privacy and
 * cookies. Desktop and mobile use the responsive footer for legal links.
 */

const LEGAL_PATHS = ["/terms", "/privacy", "/cookies"] as const;

function isMobile(projectName: string) {
  return projectName.includes("mobile");
}

for (const path of LEGAL_PATHS) {
  test(`${path} renders a titled page`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(200);
  });
}

test("legal pages are reachable from the footer (desktop)", async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo.project.name), "mobile uses the bottom nav");
  await page.goto("/");
  const termsLink = page.locator("a[href='/terms']").first();
  await expect(termsLink).toBeVisible();
  await termsLink.click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("mobile footer exposes a reachable legal link", async ({
  page,
}, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), "desktop uses the footer");
  await page.goto("/");
  const termsLink = page.locator("footer a[href='/terms']");
  await expect(termsLink).toBeVisible();
  await termsLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terms$/);
});
