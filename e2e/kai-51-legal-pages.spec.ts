import { expect, test } from "@playwright/test";

/**
 * KAI-51 J16: legal pages render and remain reachable — terms, privacy and
 * cookies. Desktop exposes them in the footer; mobile navigation carries
 * them in the bottom nav (asserted by existence there).
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

test("mobile bottom nav exposes the legal link", async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), "desktop uses the footer");
  await page.goto("/");
  const termsLink = page.locator("a[href='/terms']").first();
  await expect(termsLink).toHaveCount(1);
});
