const { chromium } = require('playwright');

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Usage: node scripts/pw_check.js <url>');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });

  const result = { url, ok: false, finalUrl: null, title: null, status: null, error: null };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    result.finalUrl = page.url();
    result.status = resp ? resp.status() : null;
    result.title = await page.title();
    result.ok = (!!result.status && result.status < 400);
  } catch (e) {
    result.error = String(e);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
