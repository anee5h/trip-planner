import { expect, test, type Page } from "@playwright/test";

const TODAY = "2026-08-12";
const FORECAST_DATES = buildDateRange(TODAY, "2026-08-21");

function buildDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function monthIndex(iso: string): number {
  const [year, month] = iso.split("-").map(Number);
  return year * 12 + month;
}

function isMobileProject(projectName: string): boolean {
  return projectName.includes("mobile");
}

async function mockForecast(page: Page) {
  await page.clock.install({ time: "2026-08-12T12:00:00+09:00" });
  await page.route("**/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        daily: {
          time: FORECAST_DATES,
          weathercode: FORECAST_DATES.map(() => 0),
          temperature_2m_max: FORECAST_DATES.map(() => 25),
          temperature_2m_min: FORECAST_DATES.map(() => 18),
        },
      }),
    });
  });
}

function datePickerTrigger(page: Page) {
  return page.locator('main button[aria-haspopup="dialog"]').first();
}

async function openDatePicker(page: Page, mobile: boolean) {
  const trigger = datePickerTrigger(page);
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Choose travel date" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) => getComputedStyle(element).position),
    )
    .toBe(mobile ? "fixed" : "absolute");
  return dialog;
}

async function selectDate(
  page: Page,
  date: string,
  fromDate: string,
  mobile: boolean,
) {
  const dialog = await openDatePicker(page, mobile);
  const targetMonth = monthIndex(date);
  let currentMonth = monthIndex(fromDate);

  while (!(await dialog.locator(`button[data-date="${date}"]`).count())) {
    const direction = targetMonth > currentMonth ? "next" : "previous";
    const monthButton = dialog.getByRole("button", {
      name: new RegExp(direction, "i"),
    });
    await expect(monthButton).toBeVisible();
    await monthButton.click();
    currentMonth += direction === "next" ? 1 : -1;
  }

  const day = dialog.locator(`button[data-date="${date}"]`);
  await expect(day).toBeEnabled();
  await day.click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => new URL(page.url()).search).toBe(`?date=${date}`);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("date"))
    .toBe(date);
  await expectDateOnTrigger(page, formatMonthDayLabel(date));
}

async function expectDateOnTrigger(page: Page, dateLabel: string) {
  await expect(datePickerTrigger(page)).toContainText(dateLabel);
}

function formatMonthDayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

test.beforeEach(async ({ page }) => {
  await mockForecast(page);
});

test.describe("KAI-85 Home date selection", () => {
  test("preserves weekend selection through URL, reload, and history", async ({
    page,
  }, testInfo) => {
    const mobile = isMobileProject(testInfo.project.name);
    await page.goto("/");

    const trigger = datePickerTrigger(page);
    await expect(trigger).toContainText("Select date");
    await expect(page).toHaveURL(/\/$/);

    await selectDate(page, "2026-08-15", TODAY, mobile); // +3, Saturday

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/date=2026-08-15/);
    await expectDateOnTrigger(page, "Aug 15");

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expectDateOnTrigger(page, "Select date");

    await page.goForward();
    await expect(page).toHaveURL(/date=2026-08-15/);
    await expectDateOnTrigger(page, "Aug 15");

    await selectDate(page, "2026-08-16", "2026-08-15", mobile); // +4, Sunday
    await selectDate(page, "2026-08-17", "2026-08-16", mobile); // +5, Monday
    await selectDate(page, "2026-08-19", "2026-08-17", mobile); // +7
  });

  test("accepts month, year, and +30-day future selections", async ({
    page,
  }, testInfo) => {
    const mobile = isMobileProject(testInfo.project.name);
    await page.goto("/");

    await expect(datePickerTrigger(page)).toContainText("Select date");

    await selectDate(page, "2026-09-11", TODAY, mobile); // +30
    await selectDate(page, "2026-08-31", "2026-09-11", mobile); // month boundary
    await selectDate(page, "2026-09-01", "2026-08-31", mobile); // month boundary
    await selectDate(page, "2026-12-31", "2026-09-01", mobile); // year boundary
    await selectDate(page, "2027-01-01", "2026-12-31", mobile); // year boundary
  });
});

test.describe("KAI-85 shared date-picker semantics", () => {
  test("keeps Destinations in Any date mode without an explicit date", async ({
    page,
  }, testInfo) => {
    const mobile = isMobileProject(testInfo.project.name);
    await page.goto("/destinations");

    const trigger = datePickerTrigger(page);
    await expect(trigger).toContainText("Any date");
    await expect(page).not.toHaveURL(/date=/);

    const dialog = await openDatePicker(page, mobile);
    await expect(
      dialog.getByRole("button", { name: "Any date" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Any date" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toContainText("Any date");
    await expect(page).not.toHaveURL(/date=/);
  });
});
