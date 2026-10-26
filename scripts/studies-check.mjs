import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const origin = process.env.STUDY_ORIGIN ?? "http://localhost:3152";
const out = "artifacts/all-studies/integration";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [],
  checks = [];
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(origin + "/studies");
    await page.locator(".study-card").last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const card of await page.locator(".study-card").all()) await card.scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      cards: [...document.querySelectorAll(".study-card")].map((e) => {
        const r = e.getBoundingClientRect(),
          body = e.querySelector(".study-card-body").getBoundingClientRect(),
          poster = e.querySelector(".study-poster").getBoundingClientRect(),
          img = e.querySelector("img");
        return {
          id: e.dataset.study,
          x: r.x,
          right: r.right,
          bodyX: body.x,
          posterX: poster.x,
          actionY: e.querySelector(".study-open").getBoundingClientRect().y,
          creditY: e.querySelector(".study-credit").getBoundingClientRect().y,
          loaded: img.complete && img.naturalWidth > 0,
          links: [...e.querySelectorAll(".study-open,.study-credit")].map((a) => ({
            height: a.getBoundingClientRect().height,
            size: parseFloat(getComputedStyle(a).fontSize),
          })),
        };
      }),
    }));
    assert.equal(layout.overflow, false);
    assert.equal(layout.cards.length, 5);
    for (const card of layout.cards) {
      assert(card.loaded, card.id + " poster");
      assert(card.x >= 0 && card.right <= width + 0.5);
      if (width <= 760) assert(Math.abs(card.bodyX - card.posterX) < 0.5);
      for (const link of card.links) assert(link.height >= 44 && link.size >= 15);
    }
    if (width > 760)
      for (const i of [0, 2]) {
        assert(
          Math.abs(layout.cards[i].actionY - layout.cards[i + 1].actionY) < 0.5,
          "paired actions align",
        );
        assert(
          Math.abs(layout.cards[i].creditY - layout.cards[i + 1].creditY) < 0.5,
          "paired credits align",
        );
      }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${out}/gallery-${width}.png`, fullPage: true });
    checks.push({ width, ...layout });
  }
  for (const path of ["/", "/docs"]) {
    await page.goto(origin + path);
    await page.locator('a[href="/studies"]').first().click();
    await page.locator(".study-card").last().waitFor();
    assert.equal(new URL(page.url()).pathname, "/studies");
  }
  checks.push({ homeAndGuideNavigation: true });
  // Exercise batched observer entries: the newest visibility record must win.
  for (const slug of ["mechanical-arm", "morph", "ink"]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    p.on("pageerror", (e) => errors.push(slug + ": " + e.message));
    await p.addInitScript(() => {
      const Native = IntersectionObserver;
      window.__observers = [];
      window.IntersectionObserver = class extends Native {
        constructor(callback, options) {
          super(callback, options);
          window.__observers.push(callback);
        }
      };
    });
    await p.goto(origin + `/studies/${slug}/index.html`);
    await p.locator("canvas,svg").first().waitFor();
    await p.waitForTimeout(100);
    const snapshot = () =>
      p.evaluate(
        (slug) =>
          slug === "morph"
            ? window.__morphStudy.snapshot().ticks
            : slug === "ink"
              ? Number(document.querySelector("#ink").dataset.time)
              : Number(document.querySelector("#mechanism").dataset.tipX),
        slug,
      );
    await p.evaluate((slug) => {
      for (const cb of window.__observers)
        cb([{ isIntersecting: true }, { isIntersecting: false }]);
      if (slug === "morph") document.querySelector('[data-form="2"]').click();
      else if (slug === "ink") document.querySelector("#play").click();
      else
        document
          .querySelector('[data-target="transfer"]')
          .dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    }, slug);
    const before = await snapshot();
    await p.waitForTimeout(140);
    assert.equal(await snapshot(), before, slug + " newest hidden freezes");
    await p.evaluate(() => {
      for (const cb of window.__observers)
        cb([{ isIntersecting: false }, { isIntersecting: true }]);
    });
    await p.waitForTimeout(180);
    assert.notEqual(await snapshot(), before, slug + " newest visible resumes");
    await p.getByRole("link", { name: /All studies/ }).click();
    await p.locator(".study-card").last().waitFor();
    checks.push({ study: slug, batchedVisibility: true, returnLink: true });
    await p.close();
  }
  // Every artifact runs at null origin with network forbidden, with an actual interaction.
  for (const slug of ["hairline", "mechanical-arm", "morph", "ink"]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    p.on("pageerror", (e) => errors.push("opaque " + slug + ": " + e.message));
    const requests = [];
    await p.route("**/*", (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    await p.setContent(
      '<iframe sandbox="allow-scripts" style="width:100%;height:1000px;border:0"></iframe>',
    );
    await p
      .locator("iframe")
      .evaluate(
        (el, html) => (el.srcdoc = html),
        readFileSync(`public/studies/${slug}/index.html`, "utf8"),
      );
    const frame = p.frameLocator("iframe");
    await frame.locator("canvas,svg").first().waitFor();
    if (slug === "hairline") {
      await frame.locator("#stage").focus();
      await p.keyboard.press("End");
      assert.equal(await frame.locator("#read").textContent(), "folio 06");
    }
    if (slug === "mechanical-arm") {
      await frame.locator('[data-target="park"]').click();
      assert.equal(
        await frame.locator('[data-target="park"]').getAttribute("aria-pressed"),
        "true",
      );
    }
    if (slug === "morph") {
      await frame.locator('[data-form="2"]').click();
      assert.equal(await frame.locator('[data-form="2"]').getAttribute("aria-pressed"), "true");
    }
    if (slug === "ink") {
      await frame.locator('[data-scene="2"]').click();
      assert.equal(await frame.locator('[data-scene="2"]').getAttribute("aria-current"), "true");
    }
    await p.waitForTimeout(100);
    assert.deepEqual(requests, []);
    checks.push({ study: slug, opaqueInteractive: true, networkRequests: requests });
    await p.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ origin, checks, errors }, null, 2));
  console.log(
    "Gallery at four widths, navigation, three batched lifecycle regressions and four interactive opaque artifacts passed.",
  );
} finally {
  await browser.close();
}
