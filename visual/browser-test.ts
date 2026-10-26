import { expect, test as base } from "@playwright/test";

// An automatic fixture runs before beforeEach, covering navigation and setup too.
export const test = base.extend<{ pageErrors: void }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const record = (error: Error) => errors.push(error.stack ?? error.message);
      page.on("pageerror", record);
      try {
        await use();
      } finally {
        page.off("pageerror", record);
        expect(errors, "Browser must not produce uncaught page errors").toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect };
export type * from "@playwright/test";
