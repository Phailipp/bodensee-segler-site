import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DATA_FILES = [
  { type: 'harbor', file: 'data/harbors.json' },
  { type: 'anchor', file: 'data/anchors.json' },
  { type: 'rental', file: 'data/rentals.json' },
  { type: 'gastro', file: 'data/gastros.json' },
  { type: 'service', file: 'data/services.json' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = { limit: 20, dryRun: false, headless: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || '20');
    else if (a === '--dry-run' || a === '--dryRun') args.dryRun = true;
    else if (a === '--headed') args.headless = false;
  }
  return args;
}

function isUrlAllowed(u) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    const blocked = [
      'openstreetmap.org',
      'osm.org',
      'wikidata.org',
      'wikipedia.org',
      'wikimedia.org',
      'mapcarta.com',
      'my-sea.com',
      'tripadvisor.',
      'facebook.com',
      'instagram.com',
      'local.ch',
      'adac.',
      'marinas.info',
      'slipanlage.info',
      'slipway.de',
    ];
    return !blocked.some(b => host === b || host.endsWith('.' + b) || host.includes(b));
  } catch {
    return false;
  }
}

async function readJson(rel) {
  const p = path.join(ROOT, rel);
  const raw = await fs.readFile(p, 'utf-8');
  return { path: p, data: JSON.parse(raw) };
}

async function writeJson(absPath, obj) {
  const txt = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(absPath, txt, 'utf-8');
}

function ensureCandidateFields(item) {
  if (!('candidateUrl' in item)) item.candidateUrl = null;
  if (!('candidateFoundAt' in item)) item.candidateFoundAt = null;
  if (!('candidateSource' in item)) item.candidateSource = null;
}

async function verifyUrl(page, url) {
  const result = { ok: false, status: null, finalUrl: null, title: null, contentType: null, error: null };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    result.status = resp ? resp.status() : null;
    result.finalUrl = page.url();
    result.title = await page.title();
    result.contentType = resp ? (resp.headers()['content-type'] || null) : null;
    // basic plausibility: not an error page
    const badTitle = (result.title || '').toLowerCase().includes('not found') || (result.title || '').toLowerCase().includes('error');
    result.ok = !!result.status && result.status < 400 && !badTitle;
  } catch (e) {
    result.error = String(e);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv);

  // Load all data
  const loaded = await Promise.all(DATA_FILES.map(f => readJson(f.file)));

  // Build candidate list
  const candidates = [];
  for (let i = 0; i < DATA_FILES.length; i++) {
    const { type } = DATA_FILES[i];
    const { data } = loaded[i];
    for (const item of data) {
      ensureCandidateFields(item);
      if (item.url) continue;
      if (!item.candidateUrl) continue;
      if (!isUrlAllowed(item.candidateUrl)) continue;
      candidates.push({ type, item, fileIndex: i });
    }
  }

  const batch = candidates.slice(0, Math.max(0, args.limit || 0));
  const out = { checked: 0, promoted: 0, skipped: candidates.length - batch.length, errors: [] };

  if (!batch.length) {
    console.log(JSON.stringify({ ...out, note: 'no candidates to verify' }, null, 2));
    return;
  }

  const browser = await chromium.launch({ headless: args.headless });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });

  for (const c of batch) {
    out.checked++;
    const url = c.item.candidateUrl;
    const r = await verifyUrl(page, url);
    if (r.ok) {
      out.promoted++;
      if (!args.dryRun) {
        c.item.url = url;
        c.item.source = url;
        c.item.lastVerified = todayISO();
        c.item.candidateUrl = null;
        c.item.candidateFoundAt = null;
        c.item.candidateSource = null;
      }
    } else {
      out.errors.push({ id: c.item.id, type: c.type, url, status: r.status, title: r.title, error: r.error });
    }
  }

  await browser.close();

  if (!args.dryRun) {
    // persist files
    for (let i = 0; i < loaded.length; i++) {
      await writeJson(loaded[i].path, loaded[i].data);
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
