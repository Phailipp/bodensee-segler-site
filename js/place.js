const $ = (sel, root = document) => root.querySelector(sel);

async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return await res.json();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function kv(k, v) {
  return `<div class="kv"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v || '—')}</div></div>`;
}

function getParam(name) {
  return new URL(window.location.href).searchParams.get(name);
}

function t(i18n, key) {
  return i18n?.[key] ?? key;
}

function lakeDataUrl(slug, file) {
  return `./data/lakes/${encodeURIComponent(slug)}/${file}`;
}

function typeLabel(lang, type) {
  const de = { harbor: 'Hafen', anchor: 'Ankerplatz', rental: 'Vermietung', gastro: 'Gastro', service: 'Service' };
  const en = { harbor: 'Harbor', anchor: 'Anchorage', rental: 'Rental', gastro: 'Food', service: 'Service' };
  return (lang === 'en' ? en : de)[type] || type;
}

async function main() {
  const lakes = await loadJSON('./data/lakes.json');

  const lakeSlug = getParam('lake') || localStorage.getItem('bs_lake') || 'bodensee';
  const lake = lakes.find(l => l.slug === lakeSlug) || lakes[0];

  const langPref = localStorage.getItem('bs_lang');
  const lang = (langPref === 'en' || langPref === 'de') ? langPref : 'de';
  const i18n = await loadJSON(`./i18n/${lang}.json`);

  // apply a single translation (back label)
  const back = $('[data-i18n="detail.back"]');
  if (back) back.textContent = t(i18n, 'detail.back');

  // nav logo
  const logo = document.querySelector('nav .logo');
  if (logo) {
    const dot = logo.querySelector('span');
    logo.textContent = lake.name;
    if (dot) logo.appendChild(dot);
  }

  const type = getParam('type');
  const id = getParam('id');
  if (!type || !id) throw new Error('Missing type/id');

  const fileMap = {
    harbor: 'harbors.json',
    anchor: 'anchors.json',
    rental: 'rentals.json',
    gastro: 'gastros.json',
    service: 'services.json'
  };

  const list = await loadJSON(lakeDataUrl(lake.slug, fileMap[type]));
  const item = list.find(x => x.id === id);
  if (!item) throw new Error('Not found');

  $('#detailType').textContent = typeLabel(lang, type);
  $('#detailName').textContent = item.name;
  $('#detailSubtitle').textContent = lake.name;

  const coords = (item.lat != null && item.lng != null) ? `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}` : '';
  const gm = coords ? `https://www.google.com/maps?q=${encodeURIComponent(coords)}` : '';

  const rows = [];
  rows.push(kv(t(i18n, 'modal.k.country'), (item.country || '').toUpperCase()));
  if (item.region) rows.push(kv(t(i18n, 'modal.k.region'), item.region));
  if (item.location) rows.push(kv(t(i18n, 'modal.k.location'), item.location));
  if (coords) rows.push(kv(t(i18n, 'modal.k.coords'), coords));
  if (item.url) rows.push(kv(t(i18n, 'modal.k.website'), item.url));
  if (!item.url && item.candidateUrl) rows.push(kv(t(i18n, 'modal.k.candidate'), item.candidateUrl));
  if (item.lastVerified) rows.push(kv(t(i18n, 'modal.k.lastVerified'), item.lastVerified));

  $('#detailGrid').innerHTML = rows.join('');

  const actions = [];
  if (item.url) actions.push(`<a class="action-btn" href="${item.url}" target="_blank" rel="noreferrer">${escapeHtml(t(i18n, 'modal.actions.website'))}</a>`);
  if (!item.url && item.candidateUrl) actions.push(`<a class="action-btn" href="${item.candidateUrl}" target="_blank" rel="noreferrer">${escapeHtml(t(i18n, 'modal.actions.candidate'))}</a>`);
  if (gm) actions.push(`<a class="action-btn" href="${gm}" target="_blank" rel="noreferrer">${escapeHtml(t(i18n, 'modal.actions.route'))}</a>`);

  $('#detailActions').innerHTML = actions.join('');

  // Back link should return to the same lake
  const backToMap = $('#backToMap');
  if (backToMap) backToMap.href = `./index.html?lake=${encodeURIComponent(lake.slug)}`;
}

main().catch(err => {
  console.error(err);
  $('#detailName').textContent = 'Not found';
});
