import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'https://phailipp.github.io/bodensee-segler-site').replace(/\/$/, '');

const root = path.resolve(process.cwd());
const lakes = JSON.parse(await readFile(path.join(root, 'data/lakes.json'), 'utf8'));

const pages = [
  `${BASE_URL}/`,
  `${BASE_URL}/index.html`,
  `${BASE_URL}/impressum.html`,
  `${BASE_URL}/datenschutz.html`,
  `${BASE_URL}/place.html`
];

const typeFiles = [
  ['harbor', 'harbors.json'],
  ['anchor', 'anchors.json'],
  ['rental', 'rentals.json'],
  ['gastro', 'gastros.json'],
  ['service', 'services.json']
];

for (const lake of lakes) {
  // lake-specific index entry (so the selector is shareable)
  pages.push(`${BASE_URL}/index.html?lake=${encodeURIComponent(lake.slug)}`);

  for (const [type, file] of typeFiles) {
    const p = path.join(root, 'data/lakes', lake.slug, file);
    let list = [];
    try {
      list = JSON.parse(await readFile(p, 'utf8'));
    } catch {
      // ignore missing
      continue;
    }
    for (const item of list) {
      pages.push(`${BASE_URL}/place.html?lake=${encodeURIComponent(lake.slug)}&type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`);
    }
  }
}

const today = new Date().toISOString().slice(0, 10);
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
pages
  .filter(Boolean)
  .map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n') +
`\n</urlset>\n`;

await writeFile(path.join(root, 'sitemap.xml'), xml);
console.log(`wrote sitemap.xml (${pages.length} urls)`);
