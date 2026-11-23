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
    // Sitios = lugares para visitar + restaurantes, en una sola pestaña.
    [/^sites$/, 'sites', 'sites'], [/^places$/, 'places', 'sites'], [/^place\/([\w-]+)$/, 'place', 'sites'],
    [/^food$/, 'food', 'sites'], [/^dishes$/, 'dishes', 'sites'], [/^stamps$/, 'stamps', 'sites'], [/^restaurant\/([\w-]+)$/, 'restaurant', 'sites'],
    // Sin pestaña «Más»: Planificar está en el Itinerario e Importar en Sitios y en el botón (+). #/more antiguo → Inicio.
    [/^expenses$/, 'expenses', 'expenses'], [/^import$/, 'import', 'sites'], [/^emergency$/, 'emergency', 'home'],
    // Se abren desde Inicio («Tu viaje» y los iconos de arriba): la pestaña marcada es Inicio.
    [/^cities$/, 'cities', 'home'], [/^city\/([\w-]+)$/, 'city', 'home'], [/^reservations$/, 'reservations', 'home'], [/^reservation\/([\w-]+)$/, 'reservation', 'home'],
    [/^transport$/, 'transport', 'home'], [/^notes$/, 'notes', 'home'], [/^checklist$/, 'checklist', 'home'], [/^info$/, 'info', 'home'],
    [/^phrases$/, 'phrases', 'home'], [/^documents$/, 'documents', 'home'], [/^search$/, 'search', 'home'], [/^settings$/, 'settings', 'home'],
    [/^ready$/, 'ready', 'home'], [/^diary$/, 'diary', 'home'], [/^gifts$/, 'gifts', 'home'], [/^learn$/, 'learn', 'home'], [/^summary$/, 'summary', 'home'], [/^book$/, 'book', 'home']
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
    document.body.dataset.view = r.view;
    document.querySelectorAll('.tabbar__item').forEach((t) => {
      const on = t.dataset.tab === r.tab;
      t.classList.toggle('is-on', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    toneHeader(r.view);
    updateFab();
    // Al pasar de un día a otro (botones o deslizando), entra con un pequeño desplazamiento lateral.
    if (JT.uiState.daySlide) {
      const cls = 'slide-in-' + JT.uiState.daySlide;
      JT.uiState.daySlide = null;
      main.classList.remove('slide-in-next', 'slide-in-prev');
      void main.offsetWidth; // reinicia la animación
      main.classList.add(cls);
      setTimeout(() => main.classList.remove(cls), 300);
    }
    if (res.mount) res.mount(main);
    // Euros en pequeño junto a cada importe en yenes.
    try { if (JT.cards.addEur) JT.cards.addEur(main); } catch (e) { console.error(e); }
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

  function refreshRates() { SV.refreshRatesIfStale().then((changed) => changed && scheduleRender()).catch(() => {}); }

  /* ── Toque de color en la cabecera: el mismo icono y color que su cuadro en «Tu viaje» ── */
  const VIEW_ICON = { cities: 'city', city: 'city', reservations: 'ticket', reservation: 'ticket', transport: 'train', notes: 'note', checklist: 'checklist', documents: 'doc', info: 'info', phrases: 'chat', learn: 'chat', gifts: 'gift' };
  function toneHeader(view) {
    const icon = VIEW_ICON[view], h1 = icon && main.querySelector('.hdr h1');
    if (!h1) return;
    const badge = document.createElement('span');
    badge.className = 'hdr__badge tone-' + JT.cards.TONE[icon];
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = JT.utils.icon(icon, 16);
    h1.classList.add('hdr__toned');
    h1.insertBefore(badge, h1.firstChild);
  }

  /* ── Botón (+): se aparta al bajar para no tapar tarjetas, vuelve al subir o al final ── */
  let lastY = 0;
  function onScrollFab() {
    const fab = document.querySelector('.fab');
    if (!fab) return;
    const y = window.scrollY, atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
    if (y < 80 || atEnd || y < lastY - 6) fab.classList.remove('is-away');
    else if (y > lastY + 6) fab.classList.add('is-away');
    if (Math.abs(y - lastY) > 6) lastY = y;
  }

  /** Re-render agrupado tras cambios del store (no interrumpe si hay una hoja abierta). */
  function scheduleRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; render(); });
  }

  function applyTheme() {
    const t = S.get().settings.theme, size = S.get().settings.textSize;
    // Tamaño de letra: zoom de toda la app (ver styles.css, [data-text]).
    if (size === 'large' || size === 'xl') document.documentElement.setAttribute('data-text', size); else document.documentElement.removeAttribute('data-text');
    if (S.get().settings.contrast === 'high') document.documentElement.setAttribute('data-contrast', 'high'); else document.documentElement.removeAttribute('data-contrast');
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

  /* El botón (+) según la pantalla: si la pantalla tiene su propio «Nuevo…» arriba (Frases, Regalos,
     Reservas, Notas, Sitios…), el (+) hace eso mismo; en Gastos, un gasto; en un día, una actividad
     de ese día. En Inicio y el resto, el menú con todo. */
  function fabTarget() {
    const v = document.body.dataset.view, own = main && main.querySelector('.hdr .iconbtn[data-act^="new"]');
    if (own) return { label: own.getAttribute('aria-label'), run: () => own.click() };
    if (v === 'expenses') return { label: 'Nuevo gasto', run: () => JT.forms.expense(null, {}) };
    if (v === 'day') { const id = parseHash().path.split('/')[1]; return { label: 'Nueva actividad en este día', run: () => JT.forms.activity(null, { dayId: id }) }; }
    if (v === 'itinerary') { const t = S.today(); return { label: 'Nueva actividad', run: () => JT.forms.activity(null, { dayId: t.phase === 'during' && t.day ? t.day.id : undefined }) }; }
    return null;
  }
  function updateFab() {
    const fab = document.querySelector('.fab');
    if (!fab) return;
    const t = fabTarget(), label = t ? t.label : 'Añadir: gasto, actividad, restaurante, lugar, nota, reserva o trayecto';
    fab.setAttribute('aria-label', label);
    fab.title = t ? t.label : 'Añadir';
  }

  A.quickAdd = function () {
    const ctx = fabTarget();
    if (ctx) return ctx.run();
    const t = S.today();
    const dayId = t.phase === 'during' && t.day ? t.day.id : undefined;
    UI.menu('Añadir', [
      { icon: 'wallet', label: 'Gasto', hint: 'Importe, categoría y listo', run: () => JT.forms.expense(null, {}) },
      { icon: 'calendar', label: 'Actividad', hint: dayId ? 'En el día de hoy' : 'Elige el día', run: () => JT.forms.activity(null, { dayId: dayId }) },
      { icon: 'food', label: 'Restaurante', run: () => JT.forms.restaurant(null, { cityId: t.phase === 'during' && t.city ? t.city.id : undefined }) },
      { icon: 'pin', label: 'Lugar', run: () => JT.forms.place(null, { cityId: t.phase === 'during' && t.city ? t.city.id : undefined }) },
      { icon: 'note', label: 'Nota', run: () => JT.forms.note(null, {}) },
      { icon: 'ticket', label: 'Reserva', hint: 'Hotel, restaurante, entradas', run: () => JT.forms.reservation(null, {}) },
      { icon: 'train', label: 'Trayecto', hint: 'Vuelo, tren, bus', run: () => JT.forms.transport(null) },
      { icon: 'clipboard', label: 'Pegar enlace o texto', hint: 'Google Maps, web o confirmación', run: () => JT.go('import') }
    ]);
  };

  /* ── Avisos y refrescos periódicos ────────────────────────── */

  function tick() {
    // Los recordatorios por notificación se quitaron en la v1.6.0 (no se usaban): los avisos útiles
    // (tren de mañana, reserva en menos de 3 h, check-out) salen en Inicio.
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

  /* Instalar desde la propia app. En Chrome para Android (hasta la v157) el menú ⋮ → «Instalar app»
     responde «ya está instalada» si hay OTRA app instalada en el mismo dominio (alexlobar.github.io),
     aunque esté en otra carpeta. El aviso beforeinstallprompt sí mira la carpeta: lo guardamos y lo
     ofrecemos con un botón propio en Inicio y en Ajustes. */
  function listenInstall() {
    window.addEventListener('beforeinstallprompt', function (ev) { ev.preventDefault(); JT.uiState.installPrompt = ev; scheduleRender(); });
    window.addEventListener('appinstalled', function () {
      JT.uiState.installPrompt = null;
      UI.toast('App instalada: búscala entre tus aplicaciones');
      persist(); // al instalarla es cuando Chrome suele aceptar proteger los datos
      scheduleRender();
    });
  }

  /** Pide que el navegador no borre los datos y, si Ajustes está a la vista, repinta su estado (🔒 / ⚠️). */
  function persist() {
    SV.requestPersist().then(function () { if (document.body.dataset.view === 'settings') scheduleRender(); });
  }

  /* Compartir desde Google Maps (u otra app) → Japón Travel. El manifest declara share_target,
     así que Android abre index.html?title=…&text=…&url=…: se lleva a Importar como un solo sitio. */
  function takeShared() {
    const q = new URLSearchParams(location.search);
    if (!q.has('title') && !q.has('text') && !q.has('url')) return;
    const sh = { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '' };
    history.replaceState(null, '', location.pathname + '#/import');
    JT.uiState.import = { text: [sh.title, sh.text, sh.url].filter(Boolean).join('\n'), shared: JT.logic.parseShared(sh) };
  }

  /* ── Arranque ─────────────────────────────────────────────── */

  function init() {
    main = document.getElementById('main');
    const build = document.documentElement.dataset.build;
    if (build && build !== U.VERSION) console.warn('index.html (' + build + ') y js (' + U.VERSION + ') son de versiones distintas: recarga la página.');
    S.load();
    applyTheme();
    S.subscribe(function () { applyTheme(); scheduleRender(); });
    // Red de seguridad: ningún formulario se envía «a la antigua» (recargaría la página y pondría los datos en la URL).
    // Cada formulario tiene su propio manejador, que sigue funcionando igual.
    document.addEventListener('submit', (ev) => ev.preventDefault(), true);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    window.addEventListener('hashchange', () => render());
    // Punto «sin conexión» junto al título: lo que ves es lo guardado en el móvil.
    const markOnline = () => document.body.classList.toggle('is-offline', navigator.onLine === false);
    markOnline();
    window.addEventListener('offline', markOnline);
    window.addEventListener('online', function () { markOnline(); scheduleRender(); refreshRates(); });
    // Tipo de cambio al día: además de al abrir, al volver a la app (las PWA suelen reanudarse sin recargar)
    // y cada hora si se queda abierta. Sólo descarga si lo guardado tiene más de 6 h.
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refreshRates(); });
    setInterval(refreshRates, 3600000);
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
    window.addEventListener('scroll', onScrollFab, { passive: true });
    takeShared();
    render();
    listenInstall();
    linkManifest();
    registerServiceWorker();
    // Pedir que el navegador no borre los datos; se repite en cada arranque mientras no lo conceda.
    persist();
    refreshRates();
    setInterval(tick, 30000);
    setTimeout(tick, 2000);
  }

  return { init: init, render: render, focusAfter: null };
})();

document.addEventListener('DOMContentLoaded', JT.app.init);
