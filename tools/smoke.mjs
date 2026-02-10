import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.cwd());

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function contentType(p) {
  return mime[path.extname(p)] || 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const fp = path.join(root, p);
    const buf = await readFile(fp);
    res.writeHead(200, { 'content-type': contentType(fp) });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise(resolve => server.listen(0, resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('pageerror', (e) => {
  console.error('PAGEERROR', e);
});

await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#map', { state: 'attached' });
await page.evaluate(() => document.querySelector('#karte')?.scrollIntoView?.({ behavior: 'instant' }));
await page.waitForTimeout(800);

const first = await page.$('[data-open]');
if (first) {
  await first.click();
  await page.waitForSelector('#modalBackdrop.open');
  await page.waitForSelector('#modalBody');
}

await browser.close();
server.close();
console.log('smoke ok');
