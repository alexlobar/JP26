/* ============================================================
   utils.js — Funciones puras: fechas (hora de Japón), dinero,
   distancias, horarios de apertura, DOM e iconos.
   No depende de nada. Orden de carga:
   utils → data → store → logic → services → ui → views-* → app
   ============================================================ */
window.JT = window.JT || {};

JT.utils = (function () {
  'use strict';

  /* Tiene que coincidir con CACHE en sw.js y con data-build en index.html. */
  const VERSION = '1.0.2';

  /* ── Texto y DOM ──────────────────────────────────────────── */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escapa cualquier dato del usuario antes de meterlo en innerHTML. */
  function esc(v) {
    return v === undefined || v === null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Quita tildes y macrones: "Kyōto" → "kyoto". */
  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  /* ── Fechas ───────────────────────────────────────────────────
     Las fechas de calendario son strings YYYY-MM-DD y las horas HH:MM,
     en hora local de Japón (UTC+9, sin horario de verano). */

  const WD_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const WD_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const pad = (n) => String(n).padStart(2, '0');

  function parseDate(iso) {
    const p = String(iso).split('-').map(Number);
    return new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1, 12));
  }
  function toISO(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && toISO(parseDate(s)) === s; }
  function isTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s || ''); }
  function addDays(iso, n) { const d = parseDate(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
  function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function dateRange(a, b) { const out = []; const n = diffDays(a, b); for (let i = 0; i <= n && i < 400; i++) out.push(addDays(a, i)); return out; }
  function weekday(iso) { return parseDate(iso).getUTCDay(); }

  function fmtShort(iso) { const d = parseDate(iso); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()].slice(0, 3); }
  function fmtDay(iso) { const d = parseDate(iso); return WD_SHORT[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
  function fmtLong(iso) { const d = parseDate(iso); return WD_LONG[d.getUTCDay()] + ', ' + d.getUTCDate() + ' de ' + MONTHS[d.getUTCMonth()]; }
  function fmtRange(a, b) {
    const x = parseDate(a), y = parseDate(b);
    if (x.getUTCMonth() === y.getUTCMonth()) return x.getUTCDate() + ' → ' + y.getUTCDate() + ' ' + MONTHS[y.getUTCMonth()];
    return fmtShort(a) + ' → ' + fmtShort(b);
  }

  function toMin(t) { const p = String(t).split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); }
  function toTime(m) { const t = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(t / 60)) + ':' + pad(t % 60); }
  function fmtDur(m) {
    m = Math.max(0, Math.round(m));
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' h ' + r + ' min' : h + ' h';
  }
  function cmpTime(a, b) {
    if (a && b) return toMin(a) - toMin(b);
    if (a) return -1;
    if (b) return 1;
    return 0;
  }

  /**
   * "Ahora" en la zona horaria del viaje. Con fecha simulada (Ajustes) se
   * puede probar el Modo viaje antes de salir.
   */
  function tripNow(offsetMin, simDate, simTime, nowMs) {
    const ms = nowMs === undefined ? Date.now() : nowMs;
    const shifted = new Date(ms + offsetMin * 60000);
    const realDate = toISO(shifted);
    const realMin = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    const minutes = simTime && isTime(simTime) ? toMin(simTime) : realMin;
    const date = simDate && isISODate(simDate) ? simDate : realDate;
    return { date: date, minutes: minutes, time: toTime(minutes), ts: ms, simulated: !!simDate };
  }

  function localToTs(date, time, offsetMin) {
    const d = date.split('-').map(Number), t = time.split(':').map(Number);
    return Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - offsetMin * 60000;
  }

  /* ── Dinero ───────────────────────────────────────────────────
     Formato propio (no Intl) para que se vea igual en todos los navegadores. */

  const DECIMALS = { JPY: 0, EUR: 2, USD: 2 };

  function money(amount, cur, compact) {
    const sign = amount < 0 ? '-' : '';
    const fixed = Math.abs(amount).toFixed(compact ? 0 : DECIMALS[cur] || 0);
    const parts = fixed.split('.');
    if (cur === 'EUR') return sign + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (parts[1] ? ',' + parts[1] : '') + ' €';
    if (cur === 'USD') return sign + '$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] ? '.' + parts[1] : '');
    return sign + '¥' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /** Acepta "12.000", "12,5", "1.234,56", "1234.56". Devuelve null si no vale. */
  function parseAmount(input) {
    let s = String(input || '').trim().replace(/[¥€$\s]/g, '');
    if (!s) return null;
    const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c > -1) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (d > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /**
   * rates = { base, perUnit: { EUR: unidades de base por 1 EUR, ... }, date, source }
   * Nunca se inventan: vienen de la API (con fecha) o de un valor manual.
   */
  function convert(amount, from, to, rates) {
    if (from === to) return amount;
    if (!rates) return null;
    const toBase = from === rates.base ? amount : rates.perUnit[from] ? amount * rates.perUnit[from] : null;
    if (toBase === null) return null;
    if (to === rates.base) return toBase;
    return rates.perUnit[to] ? toBase / rates.perUnit[to] : null;
  }

  function sumIn(items, target, rates) {
    let total = 0;
    const unconverted = {};
    items.forEach(function (it) {
      const v = convert(it.amount, it.currency, target, rates);
      if (v === null) unconverted[it.currency] = (unconverted[it.currency] || 0) + it.amount;
      else total += v;
    });
    return { total: total, unconverted: unconverted };
  }

  /* ── Distancias y desplazamientos ─────────────────────────── */

  function haversine(a, b) {
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function fmtKm(km, unit) {
    if (unit === 'mi') { const mi = km * 0.621371; return mi < 0.2 ? Math.round(mi * 5280) + ' ft' : mi.toFixed(mi < 10 ? 1 : 0) + ' mi'; }
    if (km < 1) return Math.round(km * 100) * 10 + ' m';
    return km.toFixed(km < 10 ? 1 : 0) + ' km';
  }

  function validCoords(p) {
    return !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  }

  /**
   * Estimación offline (NO es un cálculo de rutas real):
   * rodeo ×1,3; a pie ≈4,5 km/h hasta ~1,3 km; tren urbano 25 km/h, regional 40,
   * exprés 65 (+10 min de acceso); Shinkansen >60 km en línea recta (≈180 km/h +20 min).
   */
  function estimateTravel(a, b, preferred) {
    const straight = haversine(a, b), route = straight * 1.3;
    let mode = preferred || (route <= 1.3 ? 'walk' : straight > 60 ? 'shinkansen' : 'train');
    if (mode === 'flight' || mode === 'other') mode = straight > 60 ? 'shinkansen' : 'train';
    let min;
    if (mode === 'walk') min = (route / 4.5) * 60;
    else if (mode === 'taxi') min = 5 + (route / 20) * 60;
    else if (mode === 'bus') min = 8 + (route / 15) * 60;
    else if (mode === 'shinkansen') min = 20 + (straight / 180) * 60;
    else if (mode === 'metro') min = 10 + (route / 25) * 60;
    else min = 10 + (route / (route < 15 ? 25 : route < 50 ? 40 : 65)) * 60;
    return { mode: mode, minutes: Math.max(1, Math.round(min)), routeKm: route, straightKm: straight };
  }

  const GMODE = { walk: 'walking', taxi: 'driving' };
  /** Enlace universal de Google Maps (abre la app si está instalada). */
  function directionsUrl(dest, origin, mode) {
    const d = dest.coords ? dest.coords.lat + ',' + dest.coords.lng : [dest.name, dest.address].filter(Boolean).join(', ');
    if (!d) return null;
    let url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(d) + '&travelmode=' + (GMODE[mode] || 'transit');
    if (origin) url += '&origin=' + origin.lat + ',' + origin.lng;
    return url;
  }
  function searchUrl(name, coords) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(coords ? coords.lat + ',' + coords.lng : name);
  }

  /* ── Horarios de apertura ─────────────────────────────────────
     Formato tipo OpenStreetMap: "24/7", "09:00-17:00", "Mo-Fr 11:00-14:00,17:00-22:00;
     Sa,Su 11:00-22:00", "Tu-Su 10:00-18:00; Mo off", "Lu-Vi 9:00-18:00" (español),
     "18:00-02:00" (pasada la medianoche). Si no se entiende → null y se muestra tal cual. */

  const DAYS = { su: 0, do: 0, mo: 1, lu: 1, tu: 2, ma: 2, we: 3, mi: 3, th: 4, ju: 4, fr: 5, vi: 5, sa: 6 };
  const WEEK = [1, 2, 3, 4, 5, 6, 0];

  function parseHHMM(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m || +m[1] > 24 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
  }

  function parseDays(sel) {
    const out = new Set();
    for (const raw of sel.split(',')) {
      const p = raw.trim().toLowerCase();
      if (!p || p === 'ph' || p === 'sh') continue;
      const r = /^([a-z]{2})\s*-\s*([a-z]{2})$/.exec(p);
      if (r) {
        if (DAYS[r[1]] === undefined || DAYS[r[2]] === undefined) return null;
        const i = WEEK.indexOf(DAYS[r[1]]);
        for (let k = 0; k < 7; k++) { const d = WEEK[(i + k) % 7]; out.add(d); if (d === DAYS[r[2]]) break; }
        continue;
      }
      if (DAYS[p] === undefined) return null;
      out.add(DAYS[p]);
    }
    return Array.from(out);
  }

  function parseHours(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    if (raw === '24/7') return [0, 1, 2, 3, 4, 5, 6].map(() => [[0, 1440]]);
    const week = [[], [], [], [], [], [], []];
    let any = false;
    for (const rule of raw.split(';')) {
      const r = rule.trim();
      if (!r) continue;
      let days, spec;
      const m = /^((?:[A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?\s*,?\s*)+)\s+(.+)$/.exec(r);
      if (/^\d/.test(r)) { days = [0, 1, 2, 3, 4, 5, 6]; spec = r; }
      else if (m) { days = parseDays(m[1]); spec = m[2].trim(); }
      else return null;
      if (!days) return null;
      if (!days.length) continue;
      if (/^(off|closed|cerrado)$/i.test(spec)) { days.forEach((d) => (week[d] = [])); any = true; continue; }
      const ints = [];
      for (const part of spec.replace(/\s+/g, '').split(',')) {
        const ab = part.split('-');
        if (ab.length !== 2) return null;
        const s = parseHHMM(ab[0]);
        let e = parseHHMM(ab[1].replace('+', ''));
        if (s === null || e === null) return null;
        if (e <= s) e += 1440;
        ints.push([s, e]);
      }
      days.forEach((d) => (week[d] = ints));
      any = true;
    }
    return any ? week : null;
  }

  function intervalsFor(week, wd) {
    const prev = week[(wd + 6) % 7] || [];
    const spill = prev.filter((x) => x[1] > 1440).map((x) => [0, x[1] - 1440]);
    return spill.concat((week[wd] || []).map((x) => [x[0], Math.min(x[1], 1800)]));
  }

  /** { state: 'open', closesAt } | { state: 'closed', opensAt } | { state: 'unknown' } */
  function openStatus(hours, wd, minutes) {
    const week = parseHours(hours);
    if (!week) return { state: 'unknown' };
    const ints = intervalsFor(week, wd);
    const cur = ints.find((x) => minutes >= x[0] && minutes < x[1]);
    if (cur) return { state: 'open', closesAt: toTime(cur[1]) };
    const next = ints.filter((x) => x[0] > minutes).sort((a, b) => a[0] - b[0])[0];
    return { state: 'closed', opensAt: next ? toTime(next[0]) : undefined };
  }

  function earliestOpen(hours, wd, from, dur) {
    const week = parseHours(hours);
    if (!week) return undefined;
    const ints = intervalsFor(week, wd).sort((a, b) => a[0] - b[0]);
    for (const x of ints) { const b = Math.max(x[0], from); if (b + dur <= x[1]) return b; }
    return undefined;
  }

  /* ── Iconos (SVG en línea, trazo de 2px) ──────────────────── */

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 6s1 4 3 4v8"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    share: '<path d="M4 12v8h16v-8M16 6l-4-4-4 4M12 2v14"/>',
    nav: '<path d="M3 11l18-8-8 18-2-8z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
    offline: '<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2-1.5M1.4 9a16 16 0 0 1 4.6-2.8M12 20h0"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
    locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0"/>',
    swap: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h0"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h0"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0"/>'
  };

  function icon(name, size) {
    const s = size || 20;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  return {
    VERSION, esc, $, $$, uid, normalize, clamp, debounce,
    parseDate, toISO, isISODate, isTime, addDays, diffDays, dateRange, weekday,
    fmtShort, fmtDay, fmtLong, fmtRange, toMin, toTime, fmtDur, cmpTime, tripNow, localToTs,
    money, parseAmount, convert, sumIn,
    haversine, fmtKm, validCoords, estimateTravel, directionsUrl, searchUrl,
    parseHours, openStatus, earliestOpen, icon
  };
})();
