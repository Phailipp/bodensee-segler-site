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
  zoneLayer: null,
  zoneLayers: [],
  mapLayers: {
    harbors: true,
    anchors: true,
    rentals: true,
    gastros: true,
    zones: false
  },
  showUnverified: false,
  activePreset: null
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function t(key) {
  return state.i18n?.[key] ?? key;
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
  const list = {
    harbor: state.data.harbors,
    anchor: state.data.anchors,
    rental: state.data.rentals,
    gastro: state.data.gastros,
    service: state.data.services
  }[type];
  if (!list) return null;
  return list.find(x => x.id === id) || null;
}

function handleDeepLinkOpen() {
  const o = parseOpenParam();
  if (!o) return;
  const item = findItemByTypeAndId(o.type, o.id);
  if (!item) return;

  const sectionId = {
    harbor: 'haefen',
    anchor: 'anker',
    rental: 'vermietung',
    gastro: 'gastro',
    service: 'service'
  }[o.type];

  if (sectionId) {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  setTimeout(() => openModal(o.type, item), 250);
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

function applyFilters(list, type) {
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
  return `
    <div class="harbor-card" data-open="harbor" data-id="${h.id}">
      <div class="harbor-image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20 L12 4 L22 20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        <span class="harbor-country">${formatCountry(h.country)}</span>
      </div>
      <div class="harbor-content">
        <h3 class="harbor-name">${escapeHtml(h.name)}</h3>
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
  return `
    <div class="harbor-card" data-open="rental" data-id="${r.id}">
      <div class="harbor-image" style="background: linear-gradient(135deg, #1a2d42 0%, #2d1a42 100%);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20 L12 4 L22 20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        <span class="harbor-country">${formatCountry(r.country)}</span>
      </div>
      <div class="harbor-content">
        <h3 class="harbor-name">${escapeHtml(r.name)}</h3>
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
  return `
    <div class="anchor-item" data-open="gastro" data-id="${g.id}">
      <div>
        <h3 class="anchor-name">${escapeHtml(g.name)}</h3>
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
        ? `<a class="candidate-link" href="${escapeHtml(item.candidateUrl)}" target="_blank" rel="noreferrer">Candidate</a>`
        : '';
      const open = item.id ? `<a class="candidate-link" href="./?open=${encodeURIComponent(s.key + ':' + item.id)}">Open</a>` : '';
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

  el.innerHTML = `
    <div class="backlog-header">${escapeHtml(t('backlog.title'))}</div>
    <p class="coverage-note">${escapeHtml(t('backlog.note'))}</p>
    <div class="backlog-grid">${blocks || `<div class="coverage-note">${escapeHtml(t('backlog.none'))}</div>`}</div>
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
  // Harbors
  const harbors = applyFilters(state.data.harbors, 'harbors');
  $('#harborsGrid').innerHTML = harbors.length ? harbors.map(cardHarbor).join('') : emptyState();

  // Anchors
  const anchors = applyFilters(state.data.anchors, 'anchors');
  $('#anchorsList').innerHTML = anchors.length ? anchors.map(rowAnchor).join('') : emptyState(true);

  // Rentals
  const rentals = applyFilters(state.data.rentals, 'rentals');
  $('#rentalsGrid').innerHTML = rentals.length ? rentals.map(cardRental).join('') : emptyState();

  // Gastro
  const gastros = applyFilters(state.data.gastros, 'gastros');
  $('#gastroList').innerHTML = gastros.length ? gastros.map(rowGastro).join('') : emptyState(true);

  // Service
  const services = applyFilters(state.data.services, 'services');
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
  const share = `./?open=${encodeURIComponent(type + ':' + (item.id || ''))}`;
  const shareAbs = `${window.location.origin}${window.location.pathname}?open=${encodeURIComponent(type + ':' + (item.id || ''))}`;

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
  if (hasSource) rows.push(kv(t('modal.k.source'), item.source));
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
  if (gm) actions.push(`<a class="action-btn" href="${gm}" target="_blank" rel="noreferrer">${t('modal.actions.route')}</a>`);
  if (coords) actions.push(`<button class="action-btn" id="copyCoordsBtn">${t('modal.actions.copy')}</button>`);

  // Search + report / contribute
  const q = [item.name, item.location, item.region, 'Bodensee'].filter(Boolean).join(' ');
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
}

function initMap() {
  // Leaflet provided globally
  state.map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false,
    // Mobile UX: avoid accidental one-finger map panning while scrolling
    dragging: !L.Browser.touch
  }).setView([47.58, 9.45], 10);

  L.control.zoom({ position: 'topright' }).addTo(state.map);

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
  Object.values(state.markers).flat().forEach(m => m.remove());
  state.markers = { harbors: [], anchors: [], rentals: [], gastros: [] };
}

function redrawMarkers({ harbors, anchors, rentals, gastros }) {
  if (!state.map) return;
  clearMarkers();

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
  const anchorIcon = makeIcon('#4ade80', 14);
  const rentalIcon = makeIcon('#f472b6', 14);
  const gastroIcon = makeIcon('#fb923c', 14);

  harbors.forEach(h => {
    const popup = `
      <div class="popup-name">${escapeHtml(h.name)}</div>
      <div class="popup-location">${escapeHtml(h.region || '')}</div>
    `;
    const m = L.marker([h.lat, h.lng], { icon: harborIcon }).addTo(state.map).bindPopup(popup, { maxWidth: 280 });
    m.on('click', () => openModal('harbor', h));
    state.markers.harbors.push(m);
  });

  anchors.forEach(a => {
    const popup = `
      <div class="popup-name">${escapeHtml(a.name)}</div>
      <div class="popup-location">${escapeHtml(a.region || '')}</div>
    `;
    const m = L.marker([a.lat, a.lng], { icon: anchorIcon }).addTo(state.map).bindPopup(popup, { maxWidth: 280 });
    m.on('click', () => openModal('anchor', a));
    state.markers.anchors.push(m);
  });

  rentals.forEach(r => {
    const popup = `
      <div class="popup-name">${escapeHtml(r.name)}</div>
      <div class="popup-location">${escapeHtml(r.location || '')}</div>
    `;
    const m = L.marker([r.lat, r.lng], { icon: rentalIcon }).addTo(state.map).bindPopup(popup, { maxWidth: 280 });
    m.on('click', () => openModal('rental', r));
    state.markers.rentals.push(m);
  });

  gastros.forEach(g => {
    const popup = `
      <div class="popup-name">${escapeHtml(g.name)}</div>
      <div class="popup-location">${escapeHtml(g.location || '')}</div>
    `;
    const m = L.marker([g.lat, g.lng], { icon: gastroIcon }).addTo(state.map).bindPopup(popup, { maxWidth: 280 });
    m.on('click', () => openModal('gastro', g));
    state.markers.gastros.push(m);
  });

  // Add zones overlay if enabled
  if (state.mapLayers.zones) {
    const layers = (state.data.layers || []).filter(x => x.kind === 'wms' && x.wmsBaseUrl && x.wmsLayers);
    if (!layers.length) {
      toast('Zonen: keine Layer konfiguriert');
      return;
    }

    // make sure zones are above basemap + markers but below modal/nav
    try {
      if (!state.map.getPane('zonesPane')) state.map.createPane('zonesPane');
      state.map.getPane('zonesPane').style.zIndex = '350';
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

    // Build layers, then keep only the ones that are actually relevant in this view.
    const desired = layers.map(cfg => {
      const w = L.tileLayer.wms(cfg.wmsBaseUrl, {
        layers: cfg.wmsLayers,
        format: cfg.wmsFormat || 'image/png',
        transparent: cfg.wmsTransparent !== false,
        attribution: '© ' + (cfg.wmsBaseUrl.includes('geo.admin.ch') ? 'geo.admin.ch' : (cfg.wmsBaseUrl.includes('vogis') ? 'VOGIS' : 'WMS')),
        pane: 'zonesPane',
        opacity: 0.92,
        version: cfg.wmsVersion || '1.3.0'
      });
      w._cfg = cfg;
      w._everTileError = false;
      w.on('tileerror', () => { w._everTileError = true; });
      return w;
    });

    // add all quickly (so map can start requesting)
    desired.forEach(w => w.addTo(state.map));
    state.zoneLayers = desired;
    state.zoneLayer = desired[0] || null;

    // after a short wait, evaluate relevance and prune
    setTimeout(async () => {
      const kept = [];
      const ok = [];
      const nohit = [];
      const err = [];

      for (const w of desired) {
        const cfg = w._cfg || {};
        // if tiles errored, treat as unreachable and drop
        if (w._everTileError) {
          err.push(cfg.name || cfg.id || 'WMS');
          try { w.remove(); } catch {}
          continue;
        }

        const hit = await hasFeatureInView(w);
        if (hit) {
          kept.push(w);
          ok.push(cfg.name || cfg.id || 'WMS');
        } else {
          nohit.push(cfg.name || cfg.id || 'WMS');
          try { w.remove(); } catch {}
        }
      }

      state.zoneLayers = kept;
      state.zoneLayer = kept[0] || null;

      if (!kept.length) {
        const extra = err.length ? ' (einige Dienste nicht erreichbar)' : '';
        toast('Zonen: keine Treffer im aktuellen Ausschnitt' + extra);
        return;
      }

      // keep it short: just show that it now includes DE/AT when relevant
      const label = [
        ok.some(s => s.startsWith('CH:')) ? 'CH' : null,
        ok.some(s => s.startsWith('DE:')) ? 'DE' : null,
        ok.some(s => s.startsWith('AT:')) ? 'AT' : null
      ].filter(Boolean).join('+');

      toast('Zonen: aktiv (' + (label || 'WMS') + ')');
    }, 1200);

  }
}

async function main() {
  // Data
  const [harbors, anchors, rentals, gastros, services, layersCfg] = await Promise.all([
    loadJSON('./data/harbors.json'),
    loadJSON('./data/anchors.json'),
    loadJSON('./data/rentals.json'),
    loadJSON('./data/gastros.json'),
    loadJSON('./data/services.json'),
    loadJSON('./data/layers.json').catch(() => [])
  ]);

  state.data.harbors = harbors;
  state.data.anchors = anchors;
  state.data.rentals = rentals;
  state.data.gastros = gastros;
  state.data.services = services;
  state.data.layers = layersCfg;

  // Init
  initNav();
  initModal();
  setUpFilterBars();
  initScenarioPresets();
  loadLayerPrefs();
  initMap();
  initLegendToggles();
  initShareSection();

  // Language default
  const pref = localStorage.getItem('bs_lang');
  const lang = (pref === 'en' || pref === 'de') ? pref : 'de';
  state.i18n = await loadJSON(`./i18n/${lang}.json`);
  setLang(lang);
  // Deep link open
  handleDeepLinkOpen();

  window.addEventListener('popstate', () => {
    // allow back/forward deep-links
    handleDeepLinkOpen();
  });
}

main().catch(err => {
  console.error(err);
});
