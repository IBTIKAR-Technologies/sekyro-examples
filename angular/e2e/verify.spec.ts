// The Angular app runs a Sandbox session in <sekyro-verification> to a verified result, in English and in Arabic (right
// to left), with the element's events reaching the Angular handlers.
import { expect, test } from "@playwright/test";
import { installFixture } from "./fixture-api";

test("start, skip with test data, verified", async ({ page }) => {
  const fixture = await installFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start verification" }).click();
  const element = page.locator("sekyro-verification");
  await expect(element.getByRole("heading", { name: "Confirm you're human" })).toBeVisible();
  // Light DOM, partner branding from the session.
  expect(await element.evaluate((el) => el.shadowRoot)).toBeNull();
  await expect(element.locator(".sekyro-verification")).toHaveCSS("--sekyro-color-brand", "#0f766e");
  // @sekyro-step reached AppComponent.
  await expect(page.locator("pre")).toContainText('"lastStep": "liveness"');

  await element.getByRole("button", { name: "Skip with test data" }).click();
  await expect(page.locator("pre")).toContainText('"lastStep": "result"');
  // The server's verdict (polled every 3 s) is final: the flow gives way to the summary.
  await expect(page.locator("pre")).toContainText('"status": "verified"', { timeout: 10_000 });
  await expect(element).toHaveCount(0);
  expect(fixture.calls).toContain("POST /sessions");
});

test("Arabic runs right to left", async ({ page }) => {
  await installFixture(page);
  await page.goto("/");
  await page.getByLabel("Language").selectOption("ar");
  await page.getByRole("button", { name: "Start verification" }).click();
  const flow = page.locator("sekyro-verification .sekyro-flow");
  await expect(flow).toHaveAttribute("dir", "rtl");
  await expect(flow).toHaveAttribute("lang", "ar");
});

test("leaving the flow (sekyro-close) ends the session on the page", async ({ page }) => {
  await installFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start verification" }).click();
  const element = page.locator("sekyro-verification");
  await element.getByRole("button", { name: "Close" }).click();
  // The session's consent is recorded: the flow asks first.
  await element.getByRole("alertdialog", { name: "Leave verification?" }).getByRole("button", { name: "Leave" }).click();
  await expect(element).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start verification" })).toBeEnabled();
});

test("Angular Material's theme and typography leave the flow's type as it is", async ({ page }) => {
  await installFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start verification" }).click();
  const title = page.locator("sekyro-verification").getByRole("heading", { name: "Confirm you're human" });
  // The flow's title role (24/30, 600) under <body class="mat-typography">.
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("line-height", "30px");
  await expect(title).toHaveCSS("font-weight", "600");
  await expect(title).toHaveCSS("margin-block-end", "0px");
  // The session's branding font (Inter), not Material's Roboto.
  expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^Inter,/);
  const button = page.locator("sekyro-verification").getByRole("button", { name: "Start camera" });
  await expect(button).toHaveCSS("font-size", "17px");
  await expect(button).toHaveCSS("box-sizing", "border-box");
});
