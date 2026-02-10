/* Smoke QA for Bodensee Segler (Playwright)
 * Usage: node scripts/qa_smoke_playwright.js <url>
 */

const { chromium } = require('playwright');

async function run(url, viewport) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });

  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e?.message || e}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Core UI present
  await page.waitForSelector('#langToggle', { timeout: 20000 });

  // Open first harbor modal (if present)
  const firstHarbor = page.locator('#harborsGrid [data-open="harbor"]').first();
  if (await firstHarbor.count()) {
    await firstHarbor.click({ force: true });
    await page.waitForSelector('#modalBackdrop.open', { timeout: 10000 });

    // Regression guard: modal must be above fixed nav (Safari/Leaflet stacking issues)
    const topHit = await page.evaluate(() => {
      const el = document.elementFromPoint(10, 10);
      const nav = document.querySelector('nav');
      const backdrop = document.querySelector('#modalBackdrop');
      return {
        id: el ? el.id : null,
        inNav: nav && el ? nav.contains(el) : false,
        navZ: nav ? getComputedStyle(nav).zIndex : null,
        backdropZ: backdrop ? getComputedStyle(backdrop).zIndex : null
      };
    });
    if (topHit.inNav) throw new Error(`Nav is above modal (navZ=${topHit.navZ}, backdropZ=${topHit.backdropZ})`);
    if (topHit.id !== 'modalBackdrop') throw new Error('Expected modal backdrop to be on top at (10,10)');

    // close via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }

  await browser.close();
  return { viewport, errors };
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node scripts/qa_smoke_playwright.js <url>');
    process.exit(2);
  }

  const results = [];
  results.push(await run(url, { width: 1440, height: 900 }));
  results.push(await run(url, { width: 390, height: 844 }));

  const allErrors = results.flatMap(r => r.errors.map(e => `[${r.viewport.width}x${r.viewport.height}] ${e}`));
  if (allErrors.length) {
    console.error('SMOKE_QA_FAIL');
    for (const e of allErrors) console.error(e);
    process.exit(1);
  }

  console.log('SMOKE_QA_OK');
}

main().catch(e => {
  console.error('SMOKE_QA_EXCEPTION', e);
  process.exit(1);
});
