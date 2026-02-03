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
    services: []
  },
  filters: {
    q: '',
    country: 'ALL',
    overnight: 'ANY',
    minDepth: '',
    minDraft: ''
  },
  map: null,
  markers: { harbors: [], anchors: [], rentals: [], gastros: [] }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function t(key) {
  return state.i18n?.[key] ?? key;
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

function applyFilters(list, type) {
  const f = state.filters;
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
      const md = Number(f.minDepth);
      if (!Number.isNaN(md)) out = out.filter(x => (x.depthMaxM ?? x.depthMinM ?? 0) >= md);
    }
  }

  if (type === 'harbors') {
    if (f.minDraft) {
      const d = Number(f.minDraft);
      if (!Number.isNaN(d)) out = out.filter(x => (x.maxDraftM ?? 0) >= d);
    }
  }

  return out;
}

function updateChips(extra = []) {
  const chips = [];
  const f = state.filters;
  if (f.q) chips.push(`${f.q}`);
  if (f.country !== 'ALL') chips.push(`${t('filter.country')}: ${f.country}`);
  if (f.overnight !== 'ANY') chips.push(`${t('filter.overnight')}: ${f.overnight === 'YES' ? t('filter.overnight.yes') : t('filter.overnight.no')}`);
  if (f.minDepth) chips.push(`${t('filter.minDepth')}: ${f.minDepth}m`);
  if (f.minDraft) chips.push(`${t('filter.minDraft')}: ${f.minDraft}m`);
  extra.forEach(x => chips.push(x));

  const row = $('#chips');
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

function setUpFilterBar() {
  const q = $('#filterSearch');
  const country = $('#filterCountry');
  const overnight = $('#filterOvernight');
  const minDepth = $('#filterMinDepth');
  const minDraft = $('#filterMinDraft');

  const onChange = () => {
    state.filters.q = q.value.trim();
    state.filters.country = country.value;
    state.filters.overnight = overnight.value;
    state.filters.minDepth = minDepth.value;
    state.filters.minDraft = minDraft.value;
    renderAll();
  };

  ['input', 'change'].forEach(evt => {
    q.addEventListener(evt, onChange);
    country.addEventListener(evt, onChange);
    overnight.addEventListener(evt, onChange);
    minDepth.addEventListener(evt, onChange);
    minDraft.addEventListener(evt, onChange);
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

  updateChips();

  wireCardClicks();
  redrawMarkers({ harbors, anchors, rentals, gastros });
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
    }, { once: true });
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

  const actions = [];
  if (gm) actions.push(`<a class="action-btn" href="${gm}" target="_blank" rel="noreferrer">${t('modal.actions.route')}</a>`);
  if (coords) actions.push(`<button class="action-btn" id="copyCoordsBtn">${t('modal.actions.copy')}</button>`);

  body.innerHTML = `
    <div class="modal-grid">${rows.join('')}</div>
    <div class="modal-actions">${actions.join('')}</div>
  `;

  backdrop.classList.add('open');

  // Copy
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
}

async function main() {
  // Data
  const [harbors, anchors, rentals, gastros, services] = await Promise.all([
    loadJSON('./data/harbors.json'),
    loadJSON('./data/anchors.json'),
    loadJSON('./data/rentals.json'),
    loadJSON('./data/gastros.json'),
    loadJSON('./data/services.json')
  ]);

  state.data.harbors = harbors;
  state.data.anchors = anchors;
  state.data.rentals = rentals;
  state.data.gastros = gastros;
  state.data.services = services;

  // Init
  initNav();
  initModal();
  setUpFilterBar();
  initMap();

  // Language default
  const pref = localStorage.getItem('bs_lang');
  const lang = (pref === 'en' || pref === 'de') ? pref : 'de';
  state.i18n = await loadJSON(`./i18n/${lang}.json`);
  setLang(lang);
}

main().catch(err => {
  console.error(err);
});
