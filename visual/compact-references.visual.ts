import { test, expect } from "./browser-test";

for (const route of ["framework-demo", "inside-svg", "shared-service", "spring-workshop"])
  test(`${route} keeps references available without expanding the reading path`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/notes/${route}`, { waitUntil: "networkidle" });
    const sources = page.locator("#sources");
    await expect(sources.locator("details")).toHaveCount(1);
    await expect(sources.locator("details")).not.toHaveAttribute("open");
    await expect(sources.getByRole("heading", { name: "Sources", exact: true })).toBeVisible();
    await page.evaluate(() => {
      location.hash = "sources";
    });
    await expect(sources.locator("details")).toHaveAttribute("open");
    await expect(sources.locator("ol a").first()).toBeVisible();
    const count = await sources.locator("li").count();
    await expect(sources.locator("summary")).toContainText(
      `${count} ${count === 1 ? "source and where it applies" : "sources and where they apply"}`,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
