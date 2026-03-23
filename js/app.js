/* Bodensee Segler – premium single-page prototype
 * Data: /data/*.json
 * i18n: /i18n/{de,en}.json
 */

const state = {
  lang: 'de',
  i18n: {},
  data: {
    harbors: [],
    anchors: [],
    rentals: [],
    gastros: [],
    services: [],
    layers: []
  },
  filtersHarbors: {
    q: '',
    country: 'ALL',
    minDraft: '',
    minGuestBerths: ''
  },
  filtersAnchors: {
    q: '',
    country: 'ALL',
    overnight: 'ANY',
    minDepth: ''
  },
  map: null,
  markers: { harbors: [], anchors: [], rentals: [], gastros: [] },
  markerClusters: { harbors: null, anchors: null, rentals: null, gastros: null },
  zoneLayer: null,
  zoneLayers: [],
  mapLayers: {
    harbors: true,
    anchors: true,
    rentals: true,
    gastros: true,
    zones: false,
    location: false
  },
  showUnverified: false,
  activePreset: null,
  lakeId: null,
  lakeMeta: null,
  lakesIndex: []
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function getUrlParam(k) {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get(k);
  } catch {
    return null;
  }
}

function t(key) {
  return state.i18n?.[key] ?? key;
}


function replaceAllStrings(obj, from, to) {
  try {
    for (const k of Object.keys(obj || {})) {
      if (typeof obj[k] === 'string') obj[k] = obj[k].split(from).join(to);
    }
  } catch {}
  return obj;
}


function renderLakeLinks() {
  const box = document.getElementById('lakeLinks');
  if (!box) return;
  const links = state.lakeMeta && Array.isArray(state.lakeMeta.links) ? state.lakeMeta.links : [];
  if (!links.length) {
    box.innerHTML = '';
    return;
  }
  const html = links.map(l => {
    const url = escapeHtml(l.url || '');
    const label = escapeHtml(l.label || l.url || '');
    return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
  }).join('<br>');
  box.innerHTML = `<p>${html}</p>`;
}

function applyLakeBranding() {
  const name = state.lakeMeta?.name || 'Bodensee';
  const lakeId = state.lakeId || 'bodensee';

  // Title + OG
  const title = `${name} Segler`;
  document.title = title;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);

  // Description: keep template, swap lake name
  const descTpl = `Kuratiert und klar: Häfen, Ankerplätze, Vermietung, Gastro und Service am ${name}. Interaktive Karte, Filter und Detailinfos.`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', descTpl);
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', descTpl.replace('Interaktive Karte, Filter und Detailinfos.', ''));

  // Hero image per lake — set immediately, no flash
  const hero = document.querySelector('.hero');
  if (hero) {
    const heroPositions = {
      'bodensee': 'center 40%',
      'genfersee': 'center 50%',
      'lago-maggiore': 'center 50%',
      'thunersee': 'center 40%',
      'vierwaldstaettersee': 'center 50%',
      'zuerichsee': 'center 35%',
      'zugersee': 'center 50%'
    };
    const pos = heroPositions[lakeId] || 'center 50%';
    hero.style.backgroundImage = `linear-gradient(180deg, rgba(12,25,41,0.3) 0%, rgba(12,25,41,0.8) 100%), url('assets/hero-${lakeId}.jpg')`;
    hero.style.backgroundPosition = `center, ${pos}`;
    hero.style.backgroundSize = 'auto, cover';
    hero.style.backgroundRepeat = 'no-repeat, no-repeat';
  }

  // Logo already handled by selector, but keep it safe
  const logo = document.getElementById('lakeLogo');
  if (logo) logo.textContent = name;
}

function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

async function copyTextToClipboard(text) {
  if (!text) return false;

  // Modern async clipboard
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall back
  }

  // Fallback (older browsers)
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function initShareSection() {
  const buttons = $$('[data-copy-target]');
  if (!buttons.length) return;

  let timer = null;

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-copy-target');
      const el = id ? document.getElementById(id) : null;
      if (!el) return;

      const card = btn.closest('.share-card') || el.closest('.share-card');
      const status = card ? $('.copy-status', card) : null;

      const ok = await copyTextToClipboard(el.value || el.textContent || '');
      if (status) {
        status.textContent = ok ? t('share.copied') : t('share.copyFailed');
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { status.textContent = ''; }, 2400);
      }
    });
  });
}

function parseOpenParam() {
  try {
    const p = new URLSearchParams(window.location.search);
    const raw = (p.get('open') || '').trim();
    if (!raw) return null;
    const [type, id] = raw.split(':');
    if (!type || !id) return null;
    return { type, id };
  } catch {
    return null;
  }
}

function findItemByTypeAndId(type, id) {
  const d = state.data || {};
  const list = {
    harbor: d.harbors,
    anchor: d.anchors,
    rental: d.rentals,
    gastro: d.gastros,
    service: d.services
  }[type];
  if (!Array.isArray(list)) return null;
  return list.find(x => x.id === id) || null;
}

function resolveOpenTarget({ type, id }) {
  // Happy path: explicit type matches.
  const direct = findItemByTypeAndId(type, id);
  if (direct) return { type, item: direct };

  // Robustness: if type is unknown/misspelled, still try to locate by id.
  const d = state.data || {};
  const buckets = [
    ['harbor', d.harbors],
    ['anchor', d.anchors],
    ['rental', d.rentals],
    ['gastro', d.gastros],
    ['service', d.services]
  ];
  for (const [t, list] of buckets) {
    if (!Array.isArray(list)) continue;
    const hit = list.find(x => x.id === id);
    if (hit) return { type: t, item: hit };
  }
  return null;
}

function handleDeepLinkOpen() {
  const o = parseOpenParam();
  if (!o) return;

  // Scroll to map section so the modal appears in view.
  try {
    if (!window.location.hash) window.location.hash = '#karte';
  } catch {}
  const mapEl = document.getElementById('karte');
  if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const start = Date.now();
  const tryOpen = () => {
    const modalReady = !!(document.getElementById('modalBackdrop') && document.getElementById('modalBody'));
    const mapReady = !!state.map;
    const dataReady = !!(state.data && (state.data.harbors || state.data.anchors || state.data.rentals || state.data.gastros || state.data.services));

    if (modalReady && mapReady && dataReady) {
      const target = resolveOpenTarget(o);
      if (target?.item) {
        openModal(target.type, target.item);
        return;
      }
    }

    // Retry for up to 10 seconds (covers slow connections).
    if (Date.now() - start < 10000) return setTimeout(tryOpen, 200);
  };

  tryOpen();
}


function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('bs_lang', lang);
  document.documentElement.lang = lang;

  // toggle buttons
  $$('#langToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
    b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false');
  });

  // apply translations
  $$('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  // placeholders
  $$('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });

  // select options text
  $$('[data-i18n-option]').forEach(el => {
    const key = el.getAttribute('data-i18n-option');
    el.textContent = t(key);
  });

  renderAll();
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return await res.json();
}

function formatCountry(code) {
  if (!code) return '';
  return code.toUpperCase();
}

function matchesQuery(obj, q) {
  if (!q) return true;
  const hay = [obj.name, obj.location, obj.region, (obj.features || []).join(' '), obj.details, obj.ground, obj.protection]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function isVerified(item) {
  return !!((item?.source || '').trim() && (item?.lastVerified || '').trim());
}

function candidateHint(item) {
  const k = (item?.candidateUrlKind || '').trim();
  if (k === 'social') return 'Hinweis: Candidate Link ist Social (oft nicht verifizierbar als Quelle).';
  if (k === 'aggregator') return 'Hinweis: Candidate Link ist Aggregator (nicht als offizielle Quelle).';
  return '';
}

function applyFilters(list, type) {
  if (type !== 'anchors' && type !== 'harbors') return list;
  const f = type === 'anchors' ? state.filtersAnchors : state.filtersHarbors;
  let out = list;

  if (f.country !== 'ALL') {
    out = out.filter(x => (x.country || '').toUpperCase() === f.country);
  }

  if (f.q) out = out.filter(x => matchesQuery(x, f.q));

  if (type === 'anchors') {
    if (f.overnight !== 'ANY') {
      const val = f.overnight === 'YES';
      out = out.filter(x => !!x.overnight === val);
    }
    if (f.minDepth) {
      const md = Number(String(f.minDepth).replace(',', '.'));
      if (!Number.isNaN(md)) out = out.filter(x => (x.depthMaxM ?? x.depthMinM ?? 0) >= md);
    }
  }

  if (type === 'harbors') {
    if (f.minDraft) {
      const d = Number(String(f.minDraft).replace(',', '.'));
      if (!Number.isNaN(d)) out = out.filter(x => (x.maxDraftM ?? 0) >= d);
    }
    if (f.minGuestBerths) {
      const g = Number(String(f.minGuestBerths).replace(',', '.'));
      if (!Number.isNaN(g)) out = out.filter(x => (x.guestBerths ?? 0) >= g);
    }
  }

  return out;
}

function updateChipsForHarbors() {
  const chips = [];
  const f = state.filtersHarbors;
  if (f.q) chips.push(`${f.q}`);
  if (f.country !== 'ALL') chips.push(`${t('filter.country')}: ${f.country}`);
  if (f.minDraft) chips.push(`${t('filter.minDraft')}: ${f.minDraft}`);

  const row = $('#harborChips');
  if (!row) return;
  row.innerHTML = chips.map(c => `<span class="chip">${escapeHtml(c)}</span>`).join('');
}

function updateChipsForAnchors() {
  const chips = [];
  const f = state.filtersAnchors;
  if (f.q) chips.push(`${f.q}`);
  if (f.country !== 'ALL') chips.push(`${t('filter.country')}: ${f.country}`);
  if (f.overnight !== 'ANY') chips.push(`${t('filter.overnight')}: ${f.overnight === 'YES' ? t('filter.overnight.yes') : t('filter.overnight.no')}`);
  if (f.minDepth) chips.push(`${t('filter.minDepth')}: ${f.minDepth}`);

  const row = $('#anchorChips');
  if (!row) return;
  row.innerHTML = chips.map(c => `<span class="chip">${escapeHtml(c)}</span>`).join('');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


function syncFilterInputsFromState() {
  // Harbors
  const hq = $('#harborSearch');
  const hcountry = $('#harborCountry');
  const hminDraft = $('#harborMinDraft');
  if (hq) hq.value = state.filtersHarbors.q;
  if (hcountry) hcountry.value = state.filtersHarbors.country;
  if (hminDraft) hminDraft.value = state.filtersHarbors.minDraft;

  // Anchors
  const aq = $('#anchorSearch');
  const acountry = $('#anchorCountry');
  const aovernight = $('#anchorOvernight');
  const aminDepth = $('#anchorMinDepth');
  if (aq) aq.value = state.filtersAnchors.q;
  if (acountry) acountry.value = state.filtersAnchors.country;
  if (aovernight) aovernight.value = state.filtersAnchors.overnight;
  if (aminDepth) aminDepth.value = state.filtersAnchors.minDepth;
}

const scenarioPresets = {
  // What other apps do well: pick a concrete decision moment.
  // We only use fields we actually have today.
  eveningHarbor: {
    harbors: { q: 'Restaurant', country: 'ALL', minDraft: '', minGuestBerths: '1' },
    anchors: { q: '', country: 'ALL', overnight: 'ANY', minDepth: '' }
  },
  planBHarbor: {
    harbors: { q: '', country: 'ALL', minDraft: '1.8', minGuestBerths: '20' },
    anchors: { q: '', country: 'ALL', overnight: 'ANY', minDepth: '' }
  },
  quietAnchor: {
    harbors: { q: '', country: 'ALL', minDraft: '', minGuestBerths: '' },
    anchors: { q: '', country: 'ALL', overnight: 'NO', minDepth: '3.0' }
  }
};

function setActivePreset(key) {
  state.activePreset = key;
  $$('#scenarioButtons .scenario-btn').forEach(btn => {
    const isActive = key && btn.dataset.preset === key;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyScenarioPreset(key) {
  if (key === 'clear') {
    state.filtersHarbors = { q: '', country: 'ALL', minDraft: '', minGuestBerths: '' };
    state.filtersAnchors = { q: '', country: 'ALL', overnight: 'ANY', minDepth: '' };
    setActivePreset(null);
    syncFilterInputsFromState();
    renderAll();
    return;
  }

  const preset = scenarioPresets[key];
  if (!preset) return;

  state.filtersHarbors = { ...state.filtersHarbors, ...preset.harbors };
  state.filtersAnchors = { ...state.filtersAnchors, ...preset.anchors };

  setActivePreset(key);
  syncFilterInputsFromState();
  renderAll();

  const harborsSection = $('#haefen');
  if (harborsSection) harborsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initScenarioPresets() {
  const wrap = $('#scenarioButtons');
  if (!wrap) return;

  // Hide scenario buttons that can't return results for the current lake
  const hasHarbors = state.data.harbors.length > 0;
  const hasAnchors = state.data.anchors.length > 0;
  wrap.querySelectorAll('.scenario-btn[data-preset]').forEach(btn => {
    const p = btn.dataset.preset;
    if (p === 'clear') return; // always show
    if ((p === 'eveningHarbor' || p === 'planBHarbor') && !hasHarbors) btn.style.display = 'none';
    if (p === 'quietAnchor' && !hasAnchors) btn.style.display = 'none';
  });

  // Hide entire scenario section if no presets are visible
  const visiblePresets = wrap.querySelectorAll('.scenario-btn[data-preset]:not([style*="display: none"]):not(.scenario-clear)');
  const section = wrap.closest('.scenario-section');
  if (section && visiblePresets.length === 0) section.style.display = 'none';

  wrap.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-preset]');
    if (!btn) return;
    applyScenarioPreset(btn.dataset.preset);
  });
}

function setUpFilterBars() {
  // Harbors
  const hq = $('#harborSearch');
  const hcountry = $('#harborCountry');
  const hminDraft = $('#harborMinDraft');

  const onHarborChange = () => {
    state.filtersHarbors.q = hq.value.trim();
    state.filtersHarbors.country = hcountry.value;
    state.filtersHarbors.minDraft = hminDraft.value.trim();
    setActivePreset(null);
    renderAll();
  };

  ['input', 'change'].forEach(evt => {
    hq.addEventListener(evt, onHarborChange);
    hcountry.addEventListener(evt, onHarborChange);
    hminDraft.addEventListener(evt, onHarborChange);
  });

  // Anchors
  const aq = $('#anchorSearch');
  const acountry = $('#anchorCountry');
  const aovernight = $('#anchorOvernight');
  const aminDepth = $('#anchorMinDepth');

  const onAnchorChange = () => {
    state.filtersAnchors.q = aq.value.trim();
    state.filtersAnchors.country = acountry.value;
    state.filtersAnchors.overnight = aovernight.value;
    state.filtersAnchors.minDepth = aminDepth.value.trim();
    setActivePreset(null);
    renderAll();
  };

  ['input', 'change'].forEach(evt => {
    aq.addEventListener(evt, onAnchorChange);
    acountry.addEventListener(evt, onAnchorChange);
    aovernight.addEventListener(evt, onAnchorChange);
    aminDepth.addEventListener(evt, onAnchorChange);
  });
}

function cardHarbor(h) {
  const features = (h.features || []).slice(0, 6);
  const prem = h.premium ? ' premium' : '';
  const badge = h.premium ? '<span class="premium-badge">Premium</span>' : '';
  return `
    <div class="harbor-card${prem}" data-open="harbor" data-id="${h.id}">
      <div class="harbor-image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20 L12 4 L22 20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        <span class="harbor-country">${formatCountry(h.country)}</span>
      </div>
      <div class="harbor-content">
        <h3 class="harbor-name">${escapeHtml(h.name)}${badge}</h3>
        <p class="harbor-location">${escapeHtml(h.region || '')}</p>
        <div class="harbor-stats">
          <div class="stat"><div class="stat-value">${h.berths ?? '—'}</div><div class="stat-label">${t('stats.berths')}</div></div>
          <div class="stat"><div class="stat-value">${h.guestBerths ?? '—'}</div><div class="stat-label">${t('stats.guest')}</div></div>
          <div class="stat"><div class="stat-value">${h.maxDraftM ? `${h.maxDraftM}m` : '—'}</div><div class="stat-label">${t('stats.draft')}</div></div>
        </div>
        <div class="harbor-features">
          ${features.map(f => `<span class="feature-tag">${escapeHtml(f)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function rowAnchor(a) {
  const overnightTag = a.overnight ? `<span class="anchor-tag overnight">${t('filter.overnight.yes')}</span>` : `<span class="anchor-tag">${t('filter.overnight.no')}</span>`;
  return `
    <div class="anchor-item" data-open="anchor" data-id="${a.id}">
      <div>
        <h3 class="anchor-name">${escapeHtml(a.name)}</h3>
        <p class="anchor-location">${escapeHtml(a.region || '')}</p>
        <div class="anchor-tags">
          <span class="anchor-tag">${escapeHtml(a.ground || '')}</span>
          <span class="anchor-tag">${escapeHtml(a.protection || '')}</span>
          ${overnightTag}
        </div>
      </div>
      <div class="anchor-meta">
        <div class="stat"><div class="stat-value">${a.depthMinM ?? '—'}–${a.depthMaxM ?? '—'}m</div><div class="stat-label">${t('stats.depth')}</div></div>
      </div>
    </div>
  `;
}

function cardRental(r) {
  const prem = r.premium ? ' premium' : '';
  const badge = r.premium ? '<span class="premium-badge">Premium</span>' : '';
  return `
    <div class="harbor-card${prem}" data-open="rental" data-id="${r.id}">
      <div class="harbor-image" style="background: linear-gradient(135deg, #1a2d42 0%, #2d1a42 100%);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20 L12 4 L22 20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        <span class="harbor-country">${formatCountry(r.country)}</span>
      </div>
      <div class="harbor-content">
        <h3 class="harbor-name">${escapeHtml(r.name)}${badge}</h3>
        <p class="harbor-location">${escapeHtml(r.location || '')}</p>
        <div class="harbor-stats">
          <div class="stat"><div class="stat-value">${r.fleetSize ?? '—'}</div><div class="stat-label">${t('rentals.stats.boats')}</div></div>
          <div class="stat"><div class="stat-value">${escapeHtml(r.priceFrom || '—')}</div><div class="stat-label">${t('stats.price')}</div></div>
        </div>
        <div class="harbor-features">
          ${(r.features || []).slice(0, 6).map(f => `<span class="feature-tag">${escapeHtml(f)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function rowGastro(g) {
  const prem = g.premium ? ' premium' : '';
  const badge = g.premium ? '<span class="premium-badge">Premium</span>' : '';
  return `
    <div class="anchor-item${prem}" data-open="gastro" data-id="${g.id}">
      <div>
        <h3 class="anchor-name">${escapeHtml(g.name)}${badge}</h3>
        <p class="anchor-location">${escapeHtml(g.location || '')}</p>
        <div class="anchor-tags">
          ${(g.features || []).slice(0,3).map(f => `<span class="anchor-tag">${escapeHtml(f)}</span>`).join('')}
        </div>
      </div>
      <div class="anchor-meta">
        <div class="stat"><div class="stat-value">${escapeHtml(g.price || '—')}</div><div class="stat-label">${t('stats.price')}</div></div>
        <div class="stat"><div class="stat-value">${escapeHtml(g.berthing || '—')}</div><div class="stat-label">${t('stats.berthing')}</div></div>
      </div>
    </div>
  `;
}

function cardService(s) {
  return `
    <div class="service-item" data-open="service" data-id="${s.id}">
      <svg class="service-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      <h3 class="service-name">${escapeHtml(s.name)}</h3>
      <p class="service-detail">${escapeHtml(s.details || '')}</p>
    </div>
  `;
}

function computeCoverage(list) {
  const total = list.length;
  const verified = list.filter(x => (x.source || '').trim() && (x.lastVerified || '').trim()).length;
  const pct = total ? Math.round((verified / total) * 100) : 0;
  return { total, verified, pct };
}

function renderCoverage() {
  const el = document.getElementById('coverageStats');
  if (!el) return;

  const c = {
    harbors: computeCoverage(state.data.harbors),
    anchors: computeCoverage(state.data.anchors),
    rentals: computeCoverage(state.data.rentals),
    gastros: computeCoverage(state.data.gastros),
    services: computeCoverage(state.data.services)
  };

  el.innerHTML = `
    <div class="coverage-grid">
      ${coverageItem(t('nav.harbors'), c.harbors)}
      ${coverageItem(t('nav.anchors'), c.anchors)}
      ${coverageItem(t('nav.rentals'), c.rentals)}
      ${coverageItem(t('nav.gastro'), c.gastros)}
      ${coverageItem(t('nav.service'), c.services)}
    </div>
    <p class="coverage-note">${escapeHtml(t('coverage.note'))}</p>
  `;

  renderBacklog();
}

function renderBacklog() {
  const el = document.getElementById('backlogStats');
  if (!el) return;

  const sections = [
    { key: 'harbor', label: t('nav.harbors'), items: state.data.harbors },
    { key: 'anchor', label: t('nav.anchors'), items: state.data.anchors },
    { key: 'rental', label: t('nav.rentals'), items: state.data.rentals },
    { key: 'gastro', label: t('nav.gastro'), items: state.data.gastros },
    { key: 'service', label: t('nav.service'), items: state.data.services }
  ];

  const blocks = sections.map(s => {
    const missing = s.items.filter(x => !((x.source || '').trim() && (x.lastVerified || '').trim()));
    if (!missing.length) return '';

    // show candidate-first
    missing.sort((a, b) => (b.candidateUrl ? 1 : 0) - (a.candidateUrl ? 1 : 0));

    const withCandidate = missing.filter(x => (x.candidateUrl || '').trim());
    const withoutCandidate = missing.filter(x => !((x.candidateUrl || '').trim()));

    function line(item) {
      const coords = (item.lat != null && item.lng != null) ? `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}` : '';
      const issueTitle = encodeURIComponent(`Add source: ${item.name}`);
      const issueBody = encodeURIComponent(
        `Type: ${s.key}\nID: ${item.id || ''}\nName: ${item.name}\nCountry: ${item.country || ''}\nCoords: ${coords}\n\nOfficial source link:\n- \n\nLast verified (YYYY-MM-DD):\n- \n\nCandidate URL (found, not verified):\n- ${item.candidateUrl || ''}`
      );
      const issueUrl = `https://github.com/Phailipp/bodensee-segler-site/issues/new?title=${issueTitle}&body=${issueBody}`;
      const candidate = item.candidateUrl
        ? `<a class="candidate-link" href="${escapeHtml(item.candidateUrl)}" target="_blank" rel="noreferrer">Candidate</a>${item.candidateUrlKind ? ` <span class=\"candidate-kind\">(${escapeHtml(item.candidateUrlKind)})</span>` : ''}`
        : '';
      const open = item.id ? `<a class="candidate-link" href="./?lake=${encodeURIComponent(state.lakeId || '')}&open=${encodeURIComponent(s.key + ':' + item.id)}#karte">Open</a>` : '';
      return `<li><a href="${issueUrl}" target="_blank" rel="noreferrer">${escapeHtml(item.name)}</a>${candidate ? ` ${candidate}` : ''}${open ? ` ${open}` : ''}</li>`;
    }

    const lines1 = withCandidate.slice(0, 8).map(line).join('');
    const lines2 = withoutCandidate.slice(0, 6).map(line).join('');

    return `
      <div class="backlog-block">
        <div class="backlog-title">${escapeHtml(s.label)}</div>
        <div class="coverage-note">Candidates: ${withCandidate.length} · Missing candidate: ${withoutCandidate.length}</div>
        ${lines1 ? `<ul class="backlog-list">${lines1}</ul>` : ''}
        ${lines2 ? `<div class="coverage-note" style="margin-top:10px">Missing candidate URL</div><ul class="backlog-list">${lines2}</ul>` : ''}
      </div>
    `;
  }).join('');

  if (!blocks) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="backlog-header">${escapeHtml(t('backlog.title'))}</div>
    <p class="coverage-note">${escapeHtml(t('backlog.note'))}</p>
    <div class="backlog-grid">${blocks}</div>
  `;
}

function coverageItem(label, c) {
  return `
    <div class="coverage-item">
      <div class="coverage-label">${escapeHtml(label)}</div>
      <div class="coverage-value">${c.verified}/${c.total}</div>
      <div class="coverage-sub">${c.pct}%</div>
    </div>
  `;
}

function renderAll() {
  const vFilter = state.showUnverified ? (x => true) : isVerified;

  // Harbors
  const harbors = applyFilters(state.data.harbors, 'harbors').filter(vFilter);
  $('#harborsGrid').innerHTML = harbors.length ? harbors.map(cardHarbor).join('') : emptyState();

  // Anchors
  const anchors = applyFilters(state.data.anchors, 'anchors').filter(vFilter);
  $('#anchorsList').innerHTML = anchors.length ? anchors.map(rowAnchor).join('') : emptyState(true);

  // Rentals
  const rentals = applyFilters(state.data.rentals, 'rentals').filter(vFilter);
  $('#rentalsGrid').innerHTML = rentals.length ? rentals.map(cardRental).join('') : emptyState();

  // Gastro
  const gastros = applyFilters(state.data.gastros, 'gastros').filter(vFilter);
  $('#gastroList').innerHTML = gastros.length ? gastros.map(rowGastro).join('') : emptyState(true);

  // Service
  const services = applyFilters(state.data.services, 'services').filter(vFilter);
  $('#serviceGrid').innerHTML = services.length ? services.map(cardService).join('') : emptyState();

  updateChipsForHarbors();
  updateChipsForAnchors();

  wireCardClicks();

  // Map layers: sync with legend toggles
  redrawMarkers({
    harbors: state.mapLayers.harbors ? harbors : [],
    anchors: state.mapLayers.anchors ? anchors : [],
    rentals: state.mapLayers.rentals ? rentals : [],
    gastros: state.mapLayers.gastros ? gastros : []
  });

  renderCoverage();
  renderLegendToggles();
  hideZonesIfUnavailable();
  // My location overlay
  if (state.mapLayers.location) {
    if (typeof state._locEnable === 'function') state._locEnable();
  } else {
    if (typeof state._locDisable === 'function') state._locDisable();
  }
}


function emptyState(isLight = false) {
  const color = isLight ? 'rgba(12,25,41,0.65)' : 'rgba(255,255,255,0.65)';
  return `
    <div style="text-align:center;padding:36px 16px;color:${color};font-weight:300;">
      <div style="letter-spacing:0.12em;text-transform:uppercase;font-size:0.75rem;margin-bottom:10px;">${escapeHtml(t('empty.title'))}</div>
      <div style="max-width:520px;margin:0 auto;">${escapeHtml(t('empty.body'))}</div>
    </div>
  `;
}

function wireCardClicks() {
  $$('[data-open]').forEach(el => {
    el.addEventListener('click', () => {
      const type = el.dataset.open;
      const id = el.dataset.id;
      const item = state.data[type + (type.endsWith('s') ? '' : 's')]?.find?.(x => x.id === id)
        || state.data.harbors.find(x => x.id === id)
        || state.data.anchors.find(x => x.id === id)
        || state.data.rentals.find(x => x.id === id)
        || state.data.gastros.find(x => x.id === id)
        || state.data.services.find(x => x.id === id);
      if (item) openModal(type, item);
    });
  });
}

function openModal(type, item) {
  const backdrop = $('#modalBackdrop');
  const title = $('#modalTitle');
  const body = $('#modalBody');

  title.textContent = item.name;

  const lat = item.lat;
  const lng = item.lng;
  const coords = (lat != null && lng != null) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '';
  const gm = coords ? `https://www.google.com/maps?q=${encodeURIComponent(coords)}` : '';

  // Shareable deep link back into the main page
  const share = `./?lake=${encodeURIComponent(state.lakeId || '')}&open=${encodeURIComponent(type + ':' + (item.id || ''))}#karte`;
  const shareAbs = `${window.location.origin}${window.location.pathname}?lake=${encodeURIComponent(state.lakeId || '')}&open=${encodeURIComponent(type + ':' + (item.id || ''))}#karte`;

  const rows = [];
  rows.push(kv(t('modal.k.country'), formatCountry(item.country || '')));
  if (item.region) rows.push(kv(t('modal.k.region'), item.region));
  if (item.location) rows.push(kv(t('modal.k.location'), item.location));
  if (coords) rows.push(kv(t('modal.k.coords'), coords));

  if (type === 'harbor') {
    rows.push(kv(t('stats.berths'), item.berths ?? '—'));
    rows.push(kv(t('stats.guest'), item.guestBerths ?? '—'));
    rows.push(kv(t('stats.draft'), item.maxDraftM ? `${item.maxDraftM}m` : '—'));
    if (item.features?.length) rows.push(kv(t('modal.k.features'), item.features.join(' · ')));
  }

  if (type === 'anchor') {
    rows.push(kv(t('stats.depth'), `${item.depthMinM ?? '—'}–${item.depthMaxM ?? '—'}m`));
    if (item.ground) rows.push(kv(t('stats.ground'), item.ground));
    if (item.protection) rows.push(kv(t('modal.k.shelter'), item.protection));
    rows.push(kv(t('filter.overnight'), item.overnight ? t('filter.overnight.yes') : t('filter.overnight.no')));
  }

  if (type === 'rental') {
    rows.push(kv(t('modal.k.fleet'), item.fleetSize ?? '—'));
    rows.push(kv(t('stats.price'), item.priceFrom ?? '—'));
    if (item.features?.length) rows.push(kv(t('modal.k.offer'), item.features.join(' · ')));
  }

  if (type === 'gastro') {
    rows.push(kv(t('stats.price'), item.price ?? '—'));
    rows.push(kv(t('stats.berthing'), item.berthing ?? '—'));
    if (item.features?.length) rows.push(kv(t('modal.k.highlights'), item.features.join(' · ')));
  }

  if (type === 'service') {
    rows.push(kv(t('modal.k.type'), item.type ?? '—'));
    rows.push(kv(t('modal.k.details'), item.details ?? '—'));
  }

  // Common extras
  if (item.notes) rows.push(kv(t('modal.k.notes'), item.notes));

  // Contact / ops fields (show only if present)
  if (item.vhf) rows.push(kv(t('modal.k.vhf'), item.vhf));
  if (item.phone) rows.push(kv(t('modal.k.phone'), item.phone));
  if (item.email) rows.push(kv(t('modal.k.email'), item.email));
  if (item.hours) rows.push(kv(t('modal.k.hours'), item.hours));
  if (item.prices) rows.push(kv(t('modal.k.prices'), item.prices));

  if (type === 'harbor') {
    if (item.maxLengthM != null) rows.push(kv(t('modal.k.maxLength'), `${item.maxLengthM}m`));
    if (item.maxBeamM != null) rows.push(kv(t('modal.k.maxBeam'), `${item.maxBeamM}m`));
    if (item.amenities?.length) rows.push(kv(t('modal.k.amenities'), item.amenities.join(' · ')));
    if (item.guestPolicy) rows.push(kv(t('modal.k.guestPolicy'), item.guestPolicy));
  }

  if (type === 'anchor') {
    if (item.holding) rows.push(kv(t('modal.k.holding'), item.holding));
    if (item.swell) rows.push(kv(t('modal.k.swell'), item.swell));
    if (item.restrictions) rows.push(kv(t('modal.k.restrictions'), item.restrictions));
  }

  const hasSource = !!(item.source && String(item.source).trim());
  const hasVerified = !!(item.lastVerified && String(item.lastVerified).trim());
  if (hasSource && item.url) {
    rows.push(`<div class="kv"><div class="k">${escapeHtml(t('modal.k.source'))}</div><div class="v"><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" style="color:var(--gold-light);text-decoration:underline">${escapeHtml(item.source)}</a></div></div>`);
  } else if (hasSource) {
    rows.push(kv(t('modal.k.source'), item.source));
  }
  if (hasVerified) rows.push(kv(t('modal.k.lastVerified'), item.lastVerified));

  if (!hasSource || !hasVerified) {
    rows.push(kv(t('modal.k.dataQuality'), t('modal.v.dataQuality.unverified')));
  } else {
    rows.push(kv(t('modal.k.dataQuality'), t('modal.v.dataQuality.verified')));
  }

  const actions = [];
  if (item.id) actions.push(`<button class="action-btn" id="shareBtn">${t('modal.actions.share')}</button>`);
  if (item.url) {
    actions.push(`<a class="action-btn" href="${item.url}" target="_blank" rel="noreferrer">${t('modal.actions.website')}</a>`);
  } else if (item.candidateUrl) {
    actions.push(`<a class="action-btn" href="${item.candidateUrl}" target="_blank" rel="noreferrer">${t('modal.actions.candidate')}</a>`);
  }
  if (item.affiliateUrl) {
    const affLabel = item.affiliateLabel || t('modal.actions.book');
    actions.push(`<a class="action-btn affiliate" href="${item.affiliateUrl}" target="_blank" rel="noreferrer">${escapeHtml(affLabel)}</a>`);
  }
  if (gm) actions.push(`<a class="action-btn" href="${gm}" target="_blank" rel="noreferrer">${t('modal.actions.route')}</a>`);
  if (coords) actions.push(`<button class="action-btn" id="copyCoordsBtn">${t('modal.actions.copy')}</button>`);

  // Search + report / contribute
  const q = [item.name, item.location, item.region, (state.lakeMeta?.name || '')].filter(Boolean).join(' ');
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  actions.push(`<a class="action-btn" href="${searchUrl}" target="_blank" rel="noreferrer">${t('modal.actions.search')}</a>`);

  const issueTitle = encodeURIComponent(`Data fix: ${item.name}`);
  const issueBody = encodeURIComponent(
    `Type: ${type}\nID: ${item.id || ''}\nName: ${item.name}\nCountry: ${item.country || ''}\nCoords: ${coords}\n\nWhat is wrong / what should be improved?\n- \n\nOfficial source link (best):\n- \n\nOptional notes:\n- `
  );
  const issueUrl = `https://github.com/Phailipp/bodensee-segler-site/issues/new?title=${issueTitle}&body=${issueBody}`;
  actions.push(`<a class="action-btn" href="${issueUrl}" target="_blank" rel="noreferrer">${t('modal.actions.report')}</a>`);

  body.innerHTML = `
    <div class="modal-grid">${rows.join('')}</div>
    <div class="modal-actions">${actions.join('')}</div>
  `;

  backdrop.classList.add('open');

  // Copy coords
  const copyBtn = $('#copyCoordsBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(coords);
        copyBtn.textContent = '✓';
        setTimeout(() => (copyBtn.textContent = t('modal.actions.copy')), 900);
      } catch {
        // ignore
      }
    });
  }

  // Share (native if available; fallback: copy deep link)
  const shareBtn = $('#shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const title = item?.name || 'Bodensee Segler';
      const text = item?.location ? `${item.name} – ${item.location}` : item?.name;
      try {
        if (navigator.share) {
          await navigator.share({ title, text, url: shareAbs });
        } else {
          await navigator.clipboard.writeText(shareAbs);
          shareBtn.textContent = '✓';
          setTimeout(() => (shareBtn.textContent = t('modal.actions.share')), 900);
        }
      } catch {
        try {
          await navigator.clipboard.writeText(shareAbs);
          shareBtn.textContent = '✓';
          setTimeout(() => (shareBtn.textContent = t('modal.actions.share')), 900);
        } catch {
          window.location.href = share;
        }
      }
    });
  }

  // pan map
  if (state.map && lat != null && lng != null) {
    state.map.setView([lat, lng], Math.max(state.map.getZoom(), 12), { animate: true });
  }
}

function kv(k, v) {
  return `<div class="kv"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v || '—')}</div></div>`;
}

function closeModal() {
  $('#modalBackdrop').classList.remove('open');
}

function initModal() {
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function initLakeSelector() {
  const wrapper = document.getElementById('lakeSelector');
  const btn = document.getElementById('lakeSelectorBtn');
  const label = document.getElementById('lakeSelectorLabel');
  const menu = document.getElementById('lakeSelectorMenu');
  const logo = document.getElementById('lakeLogo');
  if (!wrapper || !btn || !menu) return;

  const lakes = state.lakesIndex || [];

  // Build menu items
  menu.innerHTML = lakes.map(l =>
    `<li role="option" data-lake="${escapeHtml(l.id)}"${l.id === state.lakeId ? ' aria-selected="true"' : ''}>${escapeHtml(l.name)}</li>`
  ).join('');

  // Set initial label + logo
  const current = lakes.find(x => x.id === state.lakeId) || lakes[0];
  if (label && current) label.textContent = current.name;
  if (logo && current?.name) logo.textContent = current.name;

  // Mobile bottom-sheet: portal menu + backdrop to document.body
  // (nav has will-change:transform which breaks position:fixed children)
  let backdrop = document.getElementById('lakeSelectorBackdrop');
  let mobileSheet = document.getElementById('lakeSelectorSheet');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'lakeSelectorBackdrop';
    backdrop.className = 'lake-selector-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => close());
  }
  if (!mobileSheet) {
    mobileSheet = document.createElement('ul');
    mobileSheet.id = 'lakeSelectorSheet';
    mobileSheet.className = 'lake-selector-sheet';
    mobileSheet.setAttribute('role', 'listbox');
    document.body.appendChild(mobileSheet);
  }

  const isMobile = () => window.innerWidth <= 768;

  const syncSheet = () => {
    mobileSheet.innerHTML = menu.innerHTML;
    mobileSheet.querySelectorAll('li').forEach(li => li.setAttribute('tabindex', '-1'));
    mobileSheet.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-lake]');
      if (!li) return;
      const id = li.dataset.lake;
      close();
      const pref = localStorage.getItem('bs_lang');
      const u = new URL(window.location.href);
      u.searchParams.set('lake', id);
      if (pref) u.searchParams.set('lang', pref);
      u.hash = '';
      window.location.href = u.toString();
    }, { once: true });
  };

  const open = () => {
    wrapper.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    if (isMobile()) {
      syncSheet();
      backdrop.classList.add('active');
      mobileSheet.classList.add('active');
    }
  };
  const close = () => {
    wrapper.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    backdrop.classList.remove('active');
    mobileSheet.classList.remove('active');
  };
  const isOpen = () => wrapper.classList.contains('open');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });

  menu.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-lake]');
    if (!li) return;
    const id = li.dataset.lake;
    close();
    const pref = localStorage.getItem('bs_lang');
    const u = new URL(window.location.href);
    u.searchParams.set('lake', id);
    if (pref) u.searchParams.set('lang', pref);
    u.hash = '';
    window.location.href = u.toString();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (isOpen() && !wrapper.contains(e.target)) close();
  });

  // Keyboard support
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !isOpen()) {
      e.preventDefault();
      open();
      const first = menu.querySelector('li');
      if (first) first.focus();
    }
  });

  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('li')];
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement?.click(); }
    if (e.key === 'Escape') { close(); btn.focus(); }
  });

  // Make items focusable
  menu.querySelectorAll('li').forEach(li => li.setAttribute('tabindex', '-1'));
}

function initNav() {
  window.addEventListener('scroll', () => {
    $('nav').classList.toggle('scrolled', window.scrollY > 50);
  });

  // Mobile menu toggle
  const menuBtn = $('#menuBtn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Smooth scroll for nav links
  $$('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = $(this.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });

      // close mobile menu after navigation
      if (document.body.classList.contains('nav-open')) {
        document.body.classList.remove('nav-open');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // close menu on outside click
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('nav-open')) return;
    const nav = $('#mobileNav');
    if (!nav) return;
    if (nav.contains(e.target) || (menuBtn && menuBtn.contains(e.target))) return;
    document.body.classList.remove('nav-open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  });

  // Language toggle
  $$('#langToggle button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang = btn.dataset.lang;
      state.i18n = await loadJSON(`./i18n/${lang}.json`);
      setLang(lang);
    });
  });
}

function loadLayerPrefs() {
  try {
    const raw = localStorage.getItem('bs_layers');
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const k of ['harbors','anchors','rentals','gastros','zones']) {
      if (typeof obj?.[k] === 'boolean') state.mapLayers[k] = obj[k];
    }
  } catch {
    // ignore
  }
}

function saveLayerPrefs() {
  try {
    localStorage.setItem('bs_layers', JSON.stringify(state.mapLayers));
  } catch {
    // ignore
  }
}

function renderLegendToggles() {
  $$('.map-legend [data-layer]').forEach(btn => {
    const layer = btn.getAttribute('data-layer');
    const on = !!state.mapLayers[layer];
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}



function initZonesInfo() {
  const btn = document.getElementById('zonesInfoBtn');
  const box = document.getElementById('zonesInfo');
  if (!btn || !box) return;

  function close() {
    box.hidden = true;
  }

  function open() {
    const active = (state.zoneLayers || []).map(l => l?._cfg).filter(Boolean);
    const label = [
      active.some(s => (s.name || '').startsWith('CH:')) ? 'CH' : null,
      active.some(s => (s.name || '').startsWith('DE:')) ? 'DE' : null,
      active.some(s => (s.name || '').startsWith('AT:')) ? 'AT' : null
    ].filter(Boolean).join('+');

    function layerSwatch(cfg) {
      if (!cfg) return '#60a5fa';
      const id = (cfg.id || '').toLowerCase();
      // Best-effort mapping to the official-looking palette seen on the map.
      // (WMS styles are provider-defined; we surface a simple "color => layer" key.)
      if (id.includes('ramsar')) return '#7dd3fc';
      if (id.includes('bird')) return '#a78bfa';
      if (id.includes('floodplains') || id.includes('auen')) return '#22d3ee';
      if (id.includes('moor')) return '#f472b6';
      if (id.includes('vorarlberg') || id.startsWith?.('at_')) return '#34d399';
      if (id.includes('bayern') || id.includes('de_by')) return '#fca5a5';
      if (id.includes('lubw') || id.includes('de_bw')) return '#fbbf24';
      if (id.includes('natura2000') || id.includes('eu_natura')) return '#60a5fa';
      return '#60a5fa';
    }

    const legendItems = active.slice(0, 8).map(cfg => {
      const sw = layerSwatch(cfg);
      const title = cfg.name || cfg.id;
      return `<div class="zi-legend-chip"><span class="zi-swatch" style="background:${sw}"></span><span>${escapeHtml(title)}</span></div>`;
    }).join('');

    box.innerHTML = `
      <button class="zi-close" type="button" aria-label="Close">x</button>
      <div class="zi-title">Zonen</div>
      <div>Amtliche Schutzgebiets Layer (CH, DE, AT) inkl. Natura 2000. Aktuell aktiv: ${escapeHtml(label || '—')}.</div>
      <div class="zi-sub">Farben (Key):</div>
      ${legendItems || ''}
      <div style="margin-top:8px">Details und Links: <a href="#sources">Quellen</a></div>
    `;
    box.hidden = false;
    const c = box.querySelector('.zi-close');
    if (c) c.onclick = close;
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (box.hidden) open();
    else close();
  });

  document.addEventListener('click', (e) => {
    if (box.hidden) return;
    if (box.contains(e.target) || btn.contains(e.target)) return;
    close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}


function initLocationLayer() {
  if (!navigator.geolocation) return;
  state._loc = state._loc || { watchId: null, marker: null, circle: null };

  async function enable() {
    try {
      toast('Standort: frage Berechtigung…', 1400);
      if (state._loc.watchId != null) return;
      state._loc.watchId = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latlng = [latitude, longitude];
        if (!state._loc.marker) {
          const icon = makeIcon('#93c5fd', 14);
          state._loc.marker = L.marker(latlng, { icon }).addTo(state.map);
        } else {
          state._loc.marker.setLatLng(latlng);
        }

        if (!state._loc.circle) {
          state._loc.circle = L.circle(latlng, {
            radius: Math.max(accuracy || 20, 20),
            color: '#93c5fd',
            weight: 2,
            fillColor: '#93c5fd',
            fillOpacity: 0.10
          }).addTo(state.map);
        } else {
          state._loc.circle.setLatLng(latlng);
          state._loc.circle.setRadius(Math.max(accuracy || 20, 20));
        }
      }, (err) => {
        toast('Standort: nicht erlaubt', 2000);
        state.mapLayers.location = false;
        saveLayerPrefs();
        renderLegendToggles();
  hideZonesIfUnavailable();
        disable();
      }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 });
    } catch {
      toast('Standort: Fehler', 2000);
    }
  }

  function disable() {
    try {
      if (state._loc.watchId != null) {
        navigator.geolocation.clearWatch(state._loc.watchId);
        state._loc.watchId = null;
      }
      if (state._loc.marker) { state._loc.marker.remove(); state._loc.marker = null; }
      if (state._loc.circle) { state._loc.circle.remove(); state._loc.circle = null; }
    } catch {}
  }

  // Hook into layer toggles
  const orig = renderAll;
  if (!state._loc._patched) {
    state._loc._patched = true;
    window.requestAnimationFrame(() => {
      // no-op, just ensure patching happens after init
    });
  }

  // expose for renderAll usage
  state._locEnable = enable;
  state._locDisable = disable;
}

function hideZonesIfUnavailable() {
  try {
    const has = Array.isArray(state.data.layers) && state.data.layers.length;
    const zoneControls = document.querySelector('.legend-zones');
    if (zoneControls) zoneControls.style.display = has ? '' : 'none';
    if (!has) {
      state.mapLayers.zones = false;
      try {
        (state.zoneLayers || []).forEach(l => l.remove());
        state.zoneLayers = [];
        if (state.zoneLayer) { state.zoneLayer.remove(); state.zoneLayer = null; }
      } catch {}
      const info = document.getElementById('zonesInfo');
      if (info) info.hidden = true;
    }
  } catch {}
}

function initLegendToggles() {
  $$('.map-legend [data-layer]').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.getAttribute('data-layer');
      state.mapLayers[layer] = !state.mapLayers[layer];
      saveLayerPrefs();
      renderAll();
    });
  });
  renderLegendToggles();
  hideZonesIfUnavailable();
}

function initMap() {
  // Leaflet provided globally
  state.map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false,
    // Mobile UX: avoid accidental one-finger map panning while scrolling
    dragging: !L.Browser.touch
  });

  const c = state.lakeMeta?.center || [47.58, 9.45];
  const z = state.lakeMeta?.zoom || 10;
  state.map.setView(c, z);

  L.control.zoom({ position: 'topright' }).addTo(state.map);

  // Desktop: Ctrl+Scroll to zoom the map
  if (!L.Browser.touch) {
    const mapEl = state.map.getContainer();
    let hintTimer;
    const hint = document.createElement('div');
    hint.className = 'map-scroll-hint';
    hint.textContent = 'Strg + Scrollen zum Zoomen';
    hint.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;padding:10px 18px;border-radius:8px;font-size:0.85rem;pointer-events:none;opacity:0;transition:opacity 0.3s;z-index:1000;';
    mapEl.style.position = 'relative';
    mapEl.appendChild(hint);

    mapEl.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        state.map.scrollWheelZoom.enable();
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => state.map.scrollWheelZoom.disable(), 800);
      } else {
        hint.style.opacity = '1';
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => { hint.style.opacity = '0'; }, 1500);
      }
    }, { passive: false });
  }

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CartoDB',
    maxZoom: 18
  }).addTo(state.map);

  // On touch devices: enable dragging only with two fingers
  if (L.Browser.touch) {
    const el = state.map.getContainer();
    let activeTouches = 0;

    const update = () => {
      if (activeTouches >= 2) state.map.dragging.enable();
      else state.map.dragging.disable();
    };

    el.addEventListener('touchstart', (e) => {
      activeTouches = e.touches ? e.touches.length : 0;
      update();
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      activeTouches = e.touches ? e.touches.length : 0;
      update();
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      activeTouches = e.touches ? e.touches.length : 0;
      update();
    }, { passive: true });

    // start disabled
    state.map.dragging.disable();
  }
}

function makeIcon(color, size = 14) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:3px solid #0c1929;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function clearMarkers() {
  // remove individual markers
  Object.values(state.markers).flat().forEach(m => { try { m.remove(); } catch {} });
  state.markers = { harbors: [], anchors: [], rentals: [], gastros: [] };

  // remove cluster layers
  try {
    Object.values(state.markerClusters || {}).forEach(g => { if (g && state.map) state.map.removeLayer(g); });
  } catch {}
  state.markerClusters = { harbors: null, anchors: null, rentals: null, gastros: null };
}

function makeClusterGroup() {
  // If markercluster is not available, return null and we will fall back to plain markers.
  try {
    if (!window.L || !L.markerClusterGroup) return null;
    return L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 46,
      chunkedLoading: true
    });
  } catch {
    return null;
  }
}

function redrawMarkers({ harbors, anchors, rentals, gastros }) {
  if (!state.map) return;
  clearMarkers();

  // Skip entries without valid coordinates
  const hasCoords = x => x.lat != null && x.lng != null && isFinite(x.lat) && isFinite(x.lng);
  harbors = harbors.filter(hasCoords);
  anchors = anchors.filter(hasCoords);
  rentals = rentals.filter(hasCoords);
  gastros = gastros.filter(hasCoords);

  // Zones layers
  try {
    (state.zoneLayers || []).forEach(l => l.remove());
    state.zoneLayers = [];
    if (state.zoneLayer) {
      state.zoneLayer.remove();
      state.zoneLayer = null;
    }
  } catch {
    // ignore
  }

  const harborIcon = makeIcon('#c9a962', 16);
  const harborGroup = makeClusterGroup();
  const anchorGroup = makeClusterGroup();
  const rentalGroup = makeClusterGroup();
  const gastroGroup = makeClusterGroup();

  if (harborGroup) { harborGroup.addTo(state.map); state.markerClusters.harbors = harborGroup; }
  if (anchorGroup) { anchorGroup.addTo(state.map); state.markerClusters.anchors = anchorGroup; }
  if (rentalGroup) { rentalGroup.addTo(state.map); state.markerClusters.rentals = rentalGroup; }
  if (gastroGroup) { gastroGroup.addTo(state.map); state.markerClusters.gastros = gastroGroup; }

  const anchorIcon = makeIcon('#4ade80', 14);
  const rentalIcon = makeIcon('#f472b6', 14);
  const gastroIcon = makeIcon('#fb923c', 14);

  harbors.forEach(h => {
    const popup = `
      <div class="popup-name">${escapeHtml(h.name)}</div>
      <div class="popup-location">${escapeHtml(h.region || '')}</div>
    `;
    const m = L.marker([h.lat, h.lng], { icon: harborIcon }).bindPopup(popup, { maxWidth: 280 });
    if (harborGroup) harborGroup.addLayer(m); else m.addTo(state.map);
    m.on('click', () => openModal('harbor', h));
    state.markers.harbors.push(m);
  });

  anchors.forEach(a => {
    const popup = `
      <div class="popup-name">${escapeHtml(a.name)}</div>
      <div class="popup-location">${escapeHtml(a.region || '')}</div>
    `;
    const m = L.marker([a.lat, a.lng], { icon: anchorIcon }).bindPopup(popup, { maxWidth: 280 });
    if (anchorGroup) anchorGroup.addLayer(m); else m.addTo(state.map);
    m.on('click', () => openModal('anchor', a));
    state.markers.anchors.push(m);
  });

  rentals.forEach(r => {
    const popup = `
      <div class="popup-name">${escapeHtml(r.name)}</div>
      <div class="popup-location">${escapeHtml(r.location || '')}</div>
    `;
    const m = L.marker([r.lat, r.lng], { icon: rentalIcon }).bindPopup(popup, { maxWidth: 280 });
    if (rentalGroup) rentalGroup.addLayer(m); else m.addTo(state.map);
    m.on('click', () => openModal('rental', r));
    state.markers.rentals.push(m);
  });

  gastros.forEach(g => {
    const popup = `
      <div class="popup-name">${escapeHtml(g.name)}</div>
      <div class="popup-location">${escapeHtml(g.location || '')}</div>
    `;
    const m = L.marker([g.lat, g.lng], { icon: gastroIcon }).bindPopup(popup, { maxWidth: 280 });
    if (gastroGroup) gastroGroup.addLayer(m); else m.addTo(state.map);
    m.on('click', () => openModal('gastro', g));
    state.markers.gastros.push(m);
  });

  // Add zones overlay if enabled
  if (state.mapLayers.zones) {
    const layers = (state.data.layers || []).filter(x => (x.kind === 'wms' && x.wmsBaseUrl && x.wmsLayers) || (x.kind === 'geojson' && x.path));
    if (!layers.length) {
      toast('Zonen: keine Layer konfiguriert');
      return;
    }

    // make sure zones are above basemap + markers but below modal/nav
    // and force a consistent visual language (providers use different default colors)
    try {
      if (!state.map.getPane('zonesPane')) state.map.createPane('zonesPane');
      const pane = state.map.getPane('zonesPane');
      pane.style.zIndex = '350';
      // No global recolor/filter here: provider styles are shown as-is.
    } catch {
      // ignore
    }

    toast('Zonen: lädt…');

    function wmsFeatureInfoUrl(layer, latlng) {
      try {
        const map = state.map;
        const point = map.latLngToContainerPoint(latlng, map.getZoom());
        const size = map.getSize();
        const version = layer?.wmsParams?.version || '1.3.0';
        const is130 = String(version).startsWith('1.3');

        const params = {
          request: 'GetFeatureInfo',
          service: 'WMS',
          version,
          // keep it simple; most services accept EPSG:4326
          crs: 'EPSG:4326',
          srs: 'EPSG:4326',
          styles: layer.wmsParams.styles,
          transparent: layer.wmsParams.transparent,
          format: layer.wmsParams.format,
          bbox: map.getBounds().toBBoxString(),
          height: size.y,
          width: size.x,
          layers: layer.wmsParams.layers,
          query_layers: layer.wmsParams.layers,
          info_format: 'text/plain'
        };
        if (is130) {
          params.i = Math.round(point.x);
          params.j = Math.round(point.y);
        } else {
          params.x = Math.round(point.x);
          params.y = Math.round(point.y);
        }

        const url = layer._url + L.Util.getParamString(params, layer._url, true);
        return url;
      } catch {
        return null;
      }
    }

    async function hasFeatureInView(layer) {
      // sample a few points inside the current view
      const b = state.map.getBounds();
      const pts = [
        state.map.getCenter(),
        b.getNorthWest(),
        b.getNorthEast(),
        b.getSouthWest(),
        b.getSouthEast()
      ];

      for (const p of pts) {
        const u = wmsFeatureInfoUrl(layer, p);
        if (!u) continue;
        try {
          const res = await fetch(u, { cache: 'no-store' });
          const txt = await res.text();
          if (txt && txt.trim().length > 40) return true;
        } catch {
          // ignore
        }
      }
      return false;
    }

    // Build layers and keep them enabled; only drop layers that are unreachable.
    // Reason: GetFeatureInfo checks are often blocked by CORS on some providers, which made AT/DE disappear even though tiles load.
    const desired = layers.map(cfg => {
      if (cfg.kind === 'geojson') {
        const layer = L.geoJSON(null, {
          pane: 'zonesPane',
          style: {
            color: '#60a5fa',
            weight: 2,
            fillColor: '#60a5fa',
            fillOpacity: 0.18
          }
        });
        layer._cfg = cfg;
        layer._everTileError = false;
        layer._loaded = false;
        // async load
        loadJSON(`./${cfg.path}`).then(fc => {
          layer.addData(fc);
          layer._loaded = true;
        }).catch(() => {
          layer._everTileError = true;
        });
        return layer;
      }

      const w = L.tileLayer.wms(cfg.wmsBaseUrl, {
        layers: cfg.wmsLayers,
        format: cfg.wmsFormat || 'image/png',
        transparent: cfg.wmsTransparent !== false,
        attribution: '© ' + (cfg.wmsBaseUrl.includes('geo.admin.ch') ? 'geo.admin.ch' : (cfg.wmsBaseUrl.includes('vogis') ? 'VOGIS' : 'WMS')),
        pane: 'zonesPane',
        opacity: 0.75,
        version: cfg.wmsVersion || '1.3.0'
      });
      w._cfg = cfg;
      w._everTileError = false;
      w._loaded = false;
      w.on('tileerror', () => { w._everTileError = true; });
      w.on('load', () => { w._loaded = true; });
      return w;
    });

    desired.forEach(w => w.addTo(state.map));
    state.zoneLayers = desired;
    state.zoneLayer = desired[0] || null;

    // after a short wait, drop only unreachable layers and report what is active
    setTimeout(() => {
      const kept = [];
      const ok = [];
      const err = [];
      const pending = [];

      for (const w of desired) {
        const cfg = w._cfg || {};
        if (w._everTileError) {
          err.push(cfg.name || cfg.id || 'WMS');
          try { w.remove(); } catch {}
          continue;
        }
        kept.push(w);
        ok.push(cfg.name || cfg.id || 'WMS');
        if (!w._loaded) pending.push(cfg.name || cfg.id || 'WMS');
      }

      state.zoneLayers = kept;
      state.zoneLayer = kept[0] || null;

      if (!kept.length) {
        toast('Zonen: Dienste nicht erreichbar');
        return;
      }

      const label = [
        ok.some(s => s.startsWith('CH:')) ? 'CH' : null,
        ok.some(s => s.startsWith('DE:')) ? 'DE' : null,
        ok.some(s => s.startsWith('AT:')) ? 'AT' : null
      ].filter(Boolean).join('+');

      const extra = err.length ? ' (einige Dienste down)' : (pending.length ? ' (lädt noch…)': '');
      toast('Zonen: aktiv (' + (label || 'WMS') + ')' + extra);
    }, 1600);

  }
}

async function main() {
  // Lakes
  const lakesIndex = await loadJSON('./data/lakes.json').catch(() => []);
  state.lakesIndex = lakesIndex;

  const requested = (getUrlParam('lake') || 'bodensee').toLowerCase();
  const lake = lakesIndex.find(l => l.id === requested)
    || lakesIndex.find(l => l.id === 'bodensee')
    || lakesIndex[0]
    || { id: 'bodensee', name: 'Bodensee', center: [47.58, 9.45], zoom: 10 };

  state.lakeId = lake.id;
  state.lakeMeta = lake;

  // Data (per lake)
  const base = `./data/lakes/${lake.id}`;
  const [harbors, anchors, rentals, gastros, services, layersCfg] = await Promise.all([
    loadJSON(`${base}/harbors.json`).catch(() => []),
    loadJSON(`${base}/anchors.json`).catch(() => []),
    loadJSON(`${base}/rentals.json`).catch(() => []),
    loadJSON(`${base}/gastros.json`).catch(() => []),
    loadJSON(`${base}/services.json`).catch(() => []),
    loadJSON(`${base}/layers.json`).catch(() => [])
  ]);

  state.data.harbors = harbors;
  state.data.anchors = anchors;
  state.data.rentals = rentals;
  state.data.gastros = gastros;
  state.data.services = services;
  state.data.layers = layersCfg;

  // Language + i18n FIRST (before UI init, so translations are always available)
  const urlLang = getUrlParam('lang');
  const pref = localStorage.getItem('bs_lang');
  const pick = (urlLang === 'en' || urlLang === 'de') ? urlLang : pref;
  const lang = (pick === 'en' || pick === 'de') ? pick : 'de';
  state.i18n = await loadJSON(`./i18n/${lang}.json`).catch(() => ({}));
  const lakeName = state.lakeMeta?.name || 'Bodensee';
  if (lang === 'de') replaceAllStrings(state.i18n, 'Bodensee', lakeName);
  if (lang === 'en') replaceAllStrings(state.i18n, 'Lake Constance', lakeName);
  setLang(lang);
  applyLakeBranding();

  // Init UI (each wrapped in try-catch so one failure doesn't break the rest)
  const safeInit = (fn, name) => { try { fn(); } catch (e) { console.error(`${name} failed:`, e); } };
  safeInit(initNav, 'initNav');
  safeInit(initLakeSelector, 'initLakeSelector');
  safeInit(initModal, 'initModal');
  safeInit(setUpFilterBars, 'setUpFilterBars');
  safeInit(initScenarioPresets, 'initScenarioPresets');
  safeInit(loadLayerPrefs, 'loadLayerPrefs');
  safeInit(initMap, 'initMap');
  safeInit(initLegendToggles, 'initLegendToggles');
  safeInit(initZonesInfo, 'initZonesInfo');
  safeInit(initLocationLayer, 'initLocationLayer');
  safeInit(initShareSection, 'initShareSection');

  renderLakeLinks();
  // Deep link open
  handleDeepLinkOpen();

  window.addEventListener('popstate', () => {
    // allow back/forward deep-links
    handleDeepLinkOpen();
  });
}

main().catch(err => {
  console.error('App init failed:', err);
});
