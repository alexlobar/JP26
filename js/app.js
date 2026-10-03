/* ============================================================
   app.js — Orquestación: router por hash (#/day/ID…), render,
   delegación de eventos (data-act / data-input / data-change),
   pulsación larga, deslizar, botón (+), avisos, tema y arranque.
   ============================================================ */
window.JT = window.JT || {};

JT.app = (function () {
  'use strict';

  const U = JT.utils, S = JT.store, UI = JT.ui, SV = JT.services, A = JT.actions, V = JT.views;

  /* ruta → [vista, pestaña activa] */
  const ROUTES = [
    [/^$/, 'home', 'home'], [/^itinerary$/, 'itinerary', 'itinerary'], [/^day\/([\w-]+)$/, 'day', 'itinerary'],
    [/^activity\/([\w-]+)$/, 'activity', 'itinerary'], [/^planner$/, 'planner', 'itinerary'],
    [/^map$/, 'map', 'map'], [/^food$/, 'food', 'food'], [/^restaurant\/([\w-]+)$/, 'restaurant', 'food'], [/^nearby$/, 'nearby', 'food'],
    [/^expenses$/, 'expenses', 'expenses'], [/^more$/, 'more', 'more'], [/^places$/, 'places', 'more'], [/^place\/([\w-]+)$/, 'place', 'more'],
    [/^cities$/, 'cities', 'more'], [/^city\/([\w-]+)$/, 'city', 'more'], [/^reservations$/, 'reservations', 'more'], [/^reservation\/([\w-]+)$/, 'reservation', 'more'],
    [/^transport$/, 'transport', 'more'], [/^notes$/, 'notes', 'more'], [/^checklist$/, 'checklist', 'more'], [/^info$/, 'info', 'more'],
    [/^phrases$/, 'phrases', 'more'], [/^documents$/, 'documents', 'more'], [/^search$/, 'search', 'more'], [/^import$/, 'import', 'more'], [/^settings$/, 'settings', 'more']
  ];

  let main, lastPath = null, pending = false;
  const scrollByPath = {};

  function parseHash() {
    const raw = decodeURI(location.hash.replace(/^#\/?/, ''));
    const qi = raw.indexOf('?');
    const path = qi > -1 ? raw.slice(0, qi) : raw;
    const query = {};
    if (qi > -1) new URLSearchParams(raw.slice(qi + 1)).forEach((v, k) => (query[k] = v));
    return { path: path, query: query, full: raw };
  }

  function resolve(path) {
    for (const r of ROUTES) { const m = r[0].exec(path); if (m) return { view: r[1], tab: r[2], params: { id: m[1] } }; }
    return { view: 'home', tab: 'home', params: {} };
  }

  /* ── Render ───────────────────────────────────────────────── */

  function render(opts) {
    opts = opts || {};
    const h = parseHash(), r = resolve(h.path);
    const same = lastPath === h.full;
    if (!same && lastPath !== null) scrollByPath[lastPath] = window.scrollY;

    // Conserva el foco y el cursor de un buscador mientras se escribe.
    const ae = document.activeElement;
    const focusKey = opts.keepFocus && ae && ae.dataset && ae.dataset.input ? '[data-input="' + ae.dataset.input + '"]' : null;
    const caret = focusKey && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;

    let res;
    try { res = V[r.view](r.params, h.query); } catch (e) {
      console.error(e);
      res = { html: UI.header({ title: 'Algo ha fallado', back: true }) + UI.empty('⚠️', 'No se pudo mostrar esta pantalla', String(e && e.message)) };
    }
    main.innerHTML = res.html;
    main.classList.toggle('main--bleed', !!res.fullBleed);
    document.body.dataset.view = r.view;
    document.querySelectorAll('.tabbar__item').forEach((t) => {
      const on = t.dataset.tab === r.tab;
      t.classList.toggle('is-on', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (res.mount) res.mount(main);
    // Que el filtro elegido quede a la vista en las filas de chips desplazables.
    main.querySelectorAll('.chips--scroll .is-on').forEach(function (c) {
      const row = c.parentElement;
      row.scrollLeft = Math.max(0, c.offsetLeft - row.clientWidth / 2 + c.clientWidth / 2);
    });

    if (focusKey) {
      const el = main.querySelector(focusKey);
      if (el) { el.focus(); if (caret !== null) try { el.setSelectionRange(caret, caret); } catch (e) { /* type=search */ } }
    }
    if (JT.app.focusAfter) { const el = main.querySelector(JT.app.focusAfter); JT.app.focusAfter = null; if (el) el.focus(); }

    if (!same) {
      window.scrollTo(0, opts.restore !== false && scrollByPath[h.full] ? scrollByPath[h.full] : 0);
      const t = main.querySelector('h1');
      document.title = (t ? t.textContent + ' · ' : '') + 'Japón Travel';
    }
    lastPath = h.full;
  }

  /** Re-render agrupado tras cambios del store (no interrumpe si hay una hoja abierta). */
  function scheduleRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; render(); });
  }

  function applyTheme() {
    const t = S.get().settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#111113' : '#F7F5F0');
  }

  /* ── Delegación de eventos ────────────────────────────────── */

  let suppressClick = false;

  function onClick(ev) {
    if (suppressClick) { suppressClick = false; ev.preventDefault(); ev.stopPropagation(); return; }
    const sw = ev.target.closest('.swipe.is-open');
    if (sw && !ev.target.closest('.swipe__actions')) { closeSwipes(); ev.preventDefault(); return; }
    closeSwipes();
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A') return; // los enlaces reales siguen su curso
    ev.preventDefault();
    fn(el, ev);
  }

  function onKey(ev) {
    if (ev.key === 'Escape' && UI.closeTopSheet()) return;
    // Tarjetas con data-act y tabindex: Enter/espacio las activan.
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-act][tabindex]') && ev.target.tagName !== 'BUTTON') {
      ev.preventDefault();
      const fn = A[ev.target.dataset.act];
      if (fn) fn(ev.target, ev);
    }
  }

  function onInput(ev) {
    const el = ev.target.closest('[data-input]');
    if (el && JT.changes[el.dataset.input]) JT.changes[el.dataset.input](el, ev);
  }
  function onChange(ev) {
    const el = ev.target.closest('[data-change]');
    if (el && JT.changes[el.dataset.change]) JT.changes[el.dataset.change](el, ev);
  }

  /* Pulsación larga (data-hold="accion") → menú contextual. */
  let holdTimer = null, holdStart = null;
  function onPointerDown(ev) {
    const el = ev.target.closest('[data-hold]');
    if (!el || ev.button > 0) return;
    holdStart = { x: ev.clientX, y: ev.clientY };
    holdTimer = setTimeout(function () {
      holdTimer = null;
      suppressClick = true;
      if (navigator.vibrate) navigator.vibrate(10);
      A[el.dataset.hold](el);
      setTimeout(() => (suppressClick = false), 600);
    }, 500);
  }
  function cancelHold(ev) {
    if (!holdTimer) return;
    if (ev && ev.type === 'pointermove' && holdStart && Math.hypot(ev.clientX - holdStart.x, ev.clientY - holdStart.y) < 8) return;
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  function onContextMenu(ev) {
    const el = ev.target.closest('[data-hold]');
    if (!el) return;
    ev.preventDefault();
    cancelHold();
    A[el.dataset.hold](el);
  }

  /* Deslizar a la izquierda en filas [data-swipe] para ver acciones. */
  let swipe = null;
  function closeSwipes(except) {
    document.querySelectorAll('.swipe.is-open').forEach((s) => { if (s !== except) { s.classList.remove('is-open'); s.querySelector('.swipe__content').style.transform = ''; } });
  }
  function onTouchStart(ev) {
    const row = ev.target.closest('[data-swipe]');
    if (!row) return;
    const t = ev.touches[0];
    swipe = { row: row, x: t.clientX, y: t.clientY, dx: 0, active: false, content: row.querySelector('.swipe__content'), base: row.classList.contains('is-open') ? -160 : 0 };
  }
  function onTouchMove(ev) {
    if (!swipe) return;
    const t = ev.touches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    if (!swipe.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
      if (Math.abs(dx) < 10) return;
      swipe.active = true;
      cancelHold();
      closeSwipes(swipe.row);
    }
    swipe.dx = dx;
    swipe.content.style.transition = 'none';
    swipe.content.style.transform = 'translateX(' + U.clamp(swipe.base + dx, -180, 0) + 'px)';
  }
  function onTouchEnd() {
    if (!swipe) return;
    const s = swipe;
    swipe = null;
    if (!s.active) return;
    s.content.style.transition = '';
    const open = s.base + s.dx < -60;
    s.row.classList.toggle('is-open', open);
    s.content.style.transform = open ? 'translateX(-160px)' : '';
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 300);
  }

  /* ── Botón (+) ────────────────────────────────────────────── */

  A.quickAdd = function () {
    const t = S.today();
    const dayId = t.phase === 'during' && t.day ? t.day.id : undefined;
    UI.menu('Añadir', [
      { emoji: '💰', label: 'Gasto', hint: 'Importe, categoría y listo', run: () => JT.forms.expense(null, {}) },
      { emoji: '🗓️', label: 'Actividad', hint: dayId ? 'En el día de hoy' : 'Elige el día', run: () => JT.forms.activity(null, { dayId: dayId }) },
      { emoji: '🍜', label: 'Restaurante', run: () => JT.forms.restaurant(null, { cityId: t.phase === 'during' && t.city ? t.city.id : undefined }) },
      { emoji: '📍', label: 'Lugar', run: () => JT.forms.place(null, { cityId: t.phase === 'during' && t.city ? t.city.id : undefined }) },
      { emoji: '🗒️', label: 'Nota', run: () => JT.forms.note(null, {}) },
      { emoji: '🎫', label: 'Reserva', run: () => JT.forms.reservation(null, {}) },
      { emoji: '📋', label: 'Pegar enlace o texto', hint: 'Google Maps, web o confirmación', run: () => JT.go('import') }
    ]);
  };

  /* ── Avisos y refrescos periódicos ────────────────────────── */

  function tick() {
    SV.dueReminders().forEach(function (r) {
      if (!SV.showSystemNotification(r)) UI.toast('🔔 ' + r.title + ' — ' + r.body);
    });
    // Las pantallas que dependen de la hora se refrescan si no estás escribiendo ni en una hoja.
    const v = document.body.dataset.view;
    const busy = document.querySelector('.sheet-wrap') || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    if (!busy && (v === 'home' || v === 'day')) render({ restore: false });
  }

  /* ── PWA ──────────────────────────────────────────────────── */

  /** En file:// el origen es "null" y el manifest daría un error de CORS: sólo se enlaza en http(s). */
  function linkManifest() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.json';
    document.head.appendChild(link);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    // Al cambiar de versión, recargar una vez deja index.html y los .js de la misma versión.
    if (navigator.serviceWorker.controller) {
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (!reloading) { reloading = true; location.reload(); } });
    }
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado:', e));
  }

  /* ── Arranque ─────────────────────────────────────────────── */

  function init() {
    main = document.getElementById('main');
    const build = document.documentElement.dataset.build;
    if (build && build !== U.VERSION) console.warn('index.html (' + build + ') y js (' + U.VERSION + ') son de versiones distintas: recarga la página.');
    S.load();
    applyTheme();
    S.subscribe(function () { applyTheme(); scheduleRender(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    window.addEventListener('hashchange', () => render());
    window.addEventListener('online', scheduleRender);
    window.addEventListener('offline', scheduleRender);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', cancelHold);
    document.addEventListener('pointercancel', cancelHold);
    document.addEventListener('pointermove', cancelHold);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    render();
    linkManifest();
    registerServiceWorker();
    SV.refreshRatesIfStale().then((changed) => changed && scheduleRender()).catch(() => {});
    setInterval(tick, 30000);
    setTimeout(tick, 2000);
  }

  return { init: init, render: render, focusAfter: null };
})();

document.addEventListener('DOMContentLoaded', JT.app.init);
