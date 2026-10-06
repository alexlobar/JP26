/* ============================================================
   views-common.js — Piezas compartidas por las pantallas:
   navegación, estado de filtros en memoria y tarjetas de
   dominio (timeline, lugares, restaurantes, gastos, reservas…).
   ============================================================ */
window.JT = window.JT || {};

JT.views = {};
JT.forms = {};
JT.actions = {};
/* Estado efímero de la interfaz (filtros, pestañas). No se guarda. */
JT.uiState = { places: {}, food: {}, expenses: { tab: 'summary' }, map: { layers: ['itinerary', 'hotels', 'favorites'] }, notes: {}, reservations: {}, phrases: {}, planner: {} };

JT.go = function (path) {
  const target = '#/' + String(path || '').replace(/^#?\/?/, '');
  if (location.hash === target) JT.app.render(); else location.hash = target;
};

JT.cards = (function () {
  'use strict';

  const U = JT.utils, D = JT.data, S = JT.store, UI = JT.ui;
  const esc = U.esc;
  const units = () => S.get().settings.units;

  function q(params) {
    return Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  }

  function sampleBanner() {
    return S.get().trip.isSample
      ? UI.banner('warn', 'flag', 'Datos de ejemplo', 'Viaje ficticio para probar la app. Bórralo en Ajustes cuando quieras empezar el tuyo.', { data: { act: 'go', to: 'settings' } })
      : '';
  }

  function offlineBanner(feature) {
    return JT.services.online() ? '' : UI.banner('neutral', 'offline', 'Sin conexión', feature + ' necesita Internet. Tus datos guardados siguen disponibles.');
  }

  /* ── Timeline ─────────────────────────────────────────────── */

  function isNow(a, minutes, next) {
    if (!a.startTime || a.status === 'done') return false;
    const s = U.toMin(a.startTime);
    const e = a.endTime ? U.toMin(a.endTime) : next && next.startTime ? U.toMin(next.startTime) : s + 60;
    return minutes >= s && minutes < e;
  }

  function timelineItem(a, loc, o) {
    const s = S.get();
    const r = a.reservationId && s.reservations[a.reservationId];
    const done = a.status === 'done';
    const cat = D.ACTIVITY[a.category];
    const badges = [
      o.now ? UI.pill('Ahora', 'accent') : '',
      r ? UI.pill(r.confirmationCode ? 'Reserva ' + r.confirmationCode : 'Reservado', 'info') : '',
      a.estimatedCost ? UI.pill(U.money(a.estimatedCost, a.costCurrency || 'JPY')) : ''
    ].join('');
    return '<div class="tl' + (o.now ? ' tl--now' : '') + (done ? ' tl--done' : '') + '">' +
      '<div class="tl__time"><span class="mono">' + (a.startTime || '··:··') + '</span>' + (a.endTime ? '<small>' + a.endTime + '</small>' : '') + '</div>' +
      '<div class="tl__line"><button type="button" class="tl__dot" role="checkbox" aria-checked="' + done + '" aria-label="' + esc((done ? 'Marcar pendiente: ' : 'Marcar hecha: ') + a.title) + '" data-act="toggleDone" data-id="' + a.id + '">' + (done ? U.icon('check', 10) : '') + '</button>' + (o.last ? '' : '<span class="tl__rail"></span>') + '</div>' +
      '<div class="tl__card card--tap" tabindex="0" data-act="go" data-to="activity/' + a.id + '" data-hold="activityMenu" data-id="' + a.id + '">' +
      '<div class="tl__top"><span class="tl__emoji" aria-hidden="true">' + cat[1] + '</span><div class="grow"><strong class="tl__title">' + esc(a.title) + '</strong>' +
      (loc.name && loc.name !== a.title ? '<small class="muted">📍 ' + esc(loc.name) + '</small>' : '') + '</div>' +
      (a.priority === 'high' && !done ? '<span class="accent">' + U.icon('flag', 14) + '</span>' : '') + '</div>' +
      (badges ? '<div class="pills">' + badges + '</div>' : '') + '</div></div>';
  }

  /** Tramo entre dos actividades: distancia, tiempo estimado y medio. Toca para abrir la ruta real. */
  function travelLeg(from, to, mode) {
    if (!from.coords || !to.coords) return '<div class="tl-gap"></div>';
    const e = U.estimateTravel(from.coords, to.coords, mode);
    if (e.straightKm < 0.05) return '<div class="tl-gap"></div>';
    const m = D.MODE[e.mode] || D.MODE.train;
    const url = U.directionsUrl(to, from.coords, e.mode);
    return '<a class="tl-leg" href="' + esc(url) + '" target="_blank" rel="noopener" aria-label="' + esc(m[0] + ', unos ' + U.fmtDur(e.minutes) + '. Abrir ruta') + '">' +
      '<span class="tl-leg__rail"></span><span class="muted small">' + m[1] + ' ' + m[0] + ' · ~' + U.fmtDur(e.minutes) + ' · ' + U.fmtKm(e.routeKm, units()) + '</span>' + U.icon('nav', 12) + '</a>';
  }

  function timeline(dayId, opts) {
    opts = opts || {};
    const list = S.dayActivities(dayId);
    const locs = list.map(S.resolveLocation);
    const n = S.now();
    const day = S.get().days[dayId];
    const today = day && n.date === day.date;
    return list.map((a, i) => (i > 0 ? travelLeg(locs[i - 1], locs[i], a.transportMode) : '') +
      timelineItem(a, locs[i], { now: today && isNow(a, n.minutes, list[i + 1]), last: i === list.length - 1 })).join('');
  }

  /* ── Tarjetas ─────────────────────────────────────────────── */

  function placeCard(p, km) {
    const s = S.get(), c = D.PLACE[p.category], city = p.cityId && s.cities[p.cityId];
    return '<div class="item card card--tap" tabindex="0" data-act="go" data-to="place/' + p.id + '">' +
      '<span class="item__emoji" aria-hidden="true">' + c[1] + '</span><div class="item__body"><strong' + (p.status === 'visited' ? ' class="muted"' : '') + '>' + esc(p.name) + '</strong>' +
      '<small class="muted">' + esc([c[0], p.neighborhood, city && city.name, km !== undefined ? U.fmtKm(km, units()) : ''].filter(Boolean).join(' · ')) + '</small>' +
      '<div class="pills">' + (p.status === 'visited' ? UI.pill('Visitado', 'success', 'check') : '') + (p.priority === 'high' && p.status !== 'visited' ? UI.pill('Prioridad alta', 'accent') : '') + UI.openBadge(p.hours) + '</div></div>' +
      '<button type="button" class="iconbtn fav' + (p.favorite ? ' is-on' : '') + '" aria-pressed="' + !!p.favorite + '" aria-label="Favorito" data-act="fav" data-col="places" data-id="' + p.id + '">' + U.icon('heart', 20) + '</button></div>';
  }

  function restaurantCard(r, km) {
    const s = S.get(), c = D.CUISINE[r.cuisine], city = r.cityId && s.cities[r.cityId];
    return '<div class="item card card--tap" tabindex="0" data-act="go" data-to="restaurant/' + r.id + '">' +
      '<span class="item__emoji" aria-hidden="true">' + c[1] + '</span><div class="item__body"><strong>' + esc(r.name) + '</strong>' +
      '<small class="muted">' + esc([c[0], r.priceLevel ? D.PRICE[r.priceLevel] : '', r.neighborhood || (city && city.name), km !== undefined ? U.fmtKm(km, units()) : ''].filter(Boolean).join(' · ')) + '</small>' +
      '<div class="pills">' + (r.status === 'tried' ? UI.pill('Probado', 'success', 'check') : r.status === 'want' ? UI.pill('Quiero ir', 'accent') : '') + UI.openBadge(r.hours) + (r.rating ? UI.stars(r.rating) : '') + '</div></div>' +
      '<button type="button" class="iconbtn fav' + (r.favorite ? ' is-on' : '') + '" aria-pressed="' + !!r.favorite + '" aria-label="Favorito" data-act="fav" data-col="restaurants" data-id="' + r.id + '">' + U.icon('heart', 20) + '</button></div>';
  }

  function expenseRow(e, mainValue) {
    const s = S.get(), c = D.EXPENSE[e.category], payer = e.paidById && s.travelers[e.paidById];
    const meta = [U.fmtShort(e.date), e.placeName, payer ? 'pagó ' + payer.name : '', (e.splitWithIds || []).length > 1 ? '÷' + e.splitWithIds.length : ''].filter(Boolean).join(' · ');
    return '<div class="swipe" data-swipe>' +
      '<div class="swipe__actions"><button type="button" class="swipe__btn" data-act="dupExpense" data-id="' + e.id + '">' + U.icon('copy', 18) + 'Duplicar</button>' +
      '<button type="button" class="swipe__btn swipe__btn--danger" data-act="delExpense" data-id="' + e.id + '">' + U.icon('trash', 18) + 'Eliminar</button></div>' +
      '<div class="swipe__content exp card--tap" tabindex="0" data-act="editExpense" data-id="' + e.id + '">' +
      '<span class="exp__emoji" aria-hidden="true">' + c[1] + '</span><div class="grow"><strong>' + esc(e.description || c[0]) + '</strong><small class="muted">' + esc(meta) + '</small></div>' +
      '<div class="exp__amount"><strong class="mono">' + U.money(e.amount, e.currency) + '</strong>' + (mainValue ? '<small class="muted">' + esc(mainValue) + '</small>' : '') + '</div></div></div>';
  }

  function reservationCard(r) {
    const t = D.RESERVATION[r.type];
    return '<div class="item card card--tap" tabindex="0" data-act="go" data-to="reservation/' + r.id + '"><span class="item__emoji" aria-hidden="true">' + t[1] + '</span>' +
      '<div class="item__body"><strong>' + esc(r.name) + '</strong><small class="muted">' + esc([U.fmtDay(r.date), r.time, r.endDate ? '→ ' + U.fmtShort(r.endDate) : ''].filter(Boolean).join(' · ')) + '</small>' +
      (r.location && r.location.name ? '<small class="faint">📍 ' + esc(r.location.name) + '</small>' : '') + '</div>' + (r.confirmationCode ? UI.pill(r.confirmationCode, 'info') : '') + '</div>';
  }

  function transportCard(t) {
    const k = D.TRANSPORT[t.kind], stops = t.stops || [], L = JT.logic;
    const plusDays = t.arriveDate ? Math.round((Date.parse(t.arriveDate) - Date.parse(t.date)) / 86400000) : 0;
    const wait = L.totalWait(t);
    const stopRows = stops.map(function (st) {
      const w = L.stopWait(st);
      return '<div class="stops__row"><small class="grow"><b>Escala en ' + esc(st.place) + '</b><span class="muted block">Llegas ' + esc(st.arriveTime) + (st.departDate !== st.arriveDate ? ' (' + esc(U.fmtShort(st.arriveDate)) + ')' : '') +
        ' · sales ' + esc(st.departTime) + ' (' + esc(U.fmtShort(st.departDate)) + ')' + (st.number ? ' · ' + esc(st.number) : '') + '</span></small>' + UI.pill('⏳ ' + U.fmtDur(Math.max(0, w)), w >= 180 ? 'warn' : 'neutral') + '</div>';
    }).join('');
    return '<div class="card card--tap" tabindex="0" data-act="editTransport" data-id="' + t.id + '"><div class="row"><span aria-hidden="true">' + k[1] + '</span><strong class="grow">' + esc(t.origin + ' → ' + t.destination) + '</strong>' +
      (t.cost ? '<strong class="mono">' + U.money(t.cost, t.currency || 'JPY') + '</strong>' : '') + '</div>' +
      '<div class="row row--between"><small class="muted">' + esc([k[0], t.number, U.fmtDay(t.date)].filter(Boolean).join(' · ')) + '</small><span class="mono">' + (t.departTime || '--:--') + ' → ' + (t.arriveTime || '--:--') + (plusDays > 0 ? '<sup>+' + plusDays + '</sup>' : '') + '</span></div>' +
      (stops.length ? '<div class="stops">' + stopRows + '</div>' : '') +
      '<div class="pills">' + (stops.length ? UI.pill(stops.length + (stops.length === 1 ? ' escala' : ' escalas') + ' · ' + U.fmtDur(wait) + ' de espera', 'info') : '') +
      (t.durationMinutes ? UI.pill(U.fmtDur(t.durationMinutes), 'neutral', 'clock') : '') + (t.seat ? UI.pill(t.seat) : '') + (t.bookingCode ? UI.pill(t.bookingCode, 'info') : '') + '</div></div>';
  }

  function noteRef(n) {
    const s = S.get();
    if (n.scope === 'city') return s.cities[n.refId] && s.cities[n.refId].name;
    if (n.scope === 'place') return s.places[n.refId] && s.places[n.refId].name;
    if (n.scope === 'restaurant') return s.restaurants[n.refId] && s.restaurants[n.refId].name;
    if (n.scope === 'day') return s.days[n.refId] && U.fmtDay(s.days[n.refId].date);
    return '';
  }

  function noteCard(n, showScope) {
    return '<div class="card card--tap' + (n.pinned ? ' card--warn' : '') + '" tabindex="0" data-act="editNote" data-id="' + n.id + '">' +
      (showScope !== false || n.pinned ? '<div class="row row--between"><small class="muted">' + (showScope !== false ? D.NOTE_SCOPE[n.scope][1] + ' ' + esc(noteRef(n) || D.NOTE_SCOPE[n.scope][0]) : '') + '</small>' + (n.pinned ? '<span class="warn">📌</span>' : '') + '</div>' : '') +
      (n.title ? '<strong>' + esc(n.title) + '</strong>' : '') + '<p class="pre clamp4">' + esc(n.body) + '</p></div>';
  }

  /** Accesos rápidos grandes. items: [[emoji, label, data]] */
  function quick(items) {
    return '<div class="quick">' + items.map((it) => '<button type="button" class="quick__btn"' + UI.dataAttrs(it[2]) + '><span aria-hidden="true">' + it[0] + '</span><small>' + esc(it[1]) + '</small></button>').join('') + '</div>';
  }

  function cityOptions() {
    return Object.values(S.get().cities).map((c) => ({ value: c.id, label: c.name }));
  }

  /** Total en moneda principal + texto de lo no convertible. */
  function moneySum(items) {
    const main = S.get().trip.mainCurrency;
    const r = U.sumIn(items, main, JT.services.rates());
    const extra = Object.keys(r.unconverted).map((c) => U.money(r.unconverted[c], c)).join(' + ');
    return { total: r.total, text: U.money(r.total, main), extra: extra, main: main };
  }

  /* ── Campo de coordenadas (pegar "lat, lng" o buscar por nombre) ── */

  function parseCoords(text) {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text || '');
    if (!m) return undefined;
    const c = { lat: Number(m[1]), lng: Number(m[2]) };
    return U.validCoords(c) ? c : undefined;
  }

  function coordsField(coords) {
    return '<div class="stack coords">' +
      UI.field('Coordenadas', UI.input('coords', coords ? coords.lat + ', ' + coords.lng : '', { placeholder: '34.9671, 135.7727', inputmode: 'decimal' }), { optional: true, hint: 'Para el mapa, las distancias y «restaurantes cerca». Pégalas de Google Maps o búscalas.' }) +
      '<div class="row">' + UI.btn('Buscar por nombre', { icon: 'search', size: 'sm', variant: 'secondary', data: { geocode: '1' } }) + '<small class="muted geo-status"></small></div>' +
      '<div class="geo-results"></div></div>';
  }

  /** Activa el botón de búsqueda. getQuery() devuelve el texto a geocodificar. */
  function bindCoords(root, getQuery) {
    const b = root.querySelector('[data-geocode]');
    if (!b) return;
    const out = root.querySelector('.geo-results'), status = root.querySelector('.geo-status');
    b.addEventListener('click', async function () {
      const query = getQuery();
      if (!query) { status.textContent = 'Escribe primero el nombre'; return; }
      if (!JT.services.online()) { status.textContent = 'Requiere conexión'; return; }
      status.textContent = 'Buscando…';
      try {
        const res = await JT.services.geocode(query);
        status.textContent = res.length ? '' : 'Sin resultados; prueba otro nombre o pega las coordenadas';
        out.innerHTML = res.map((r, i) => '<button type="button" class="lr lr--tap" data-i="' + i + '"><span class="lr__icon">' + U.icon('pin', 18) + '</span><span class="lr__text"><span class="lr__title">' + esc(r.name) + '</span><span class="lr__sub">' + esc(r.display) + '</span></span></button>').join('');
        out.querySelectorAll('[data-i]').forEach((x) => x.addEventListener('click', function () {
          const r = res[+x.dataset.i];
          root.querySelector('[name="coords"]').value = r.coords.lat.toFixed(6) + ', ' + r.coords.lng.toFixed(6);
          const addr = root.querySelector('[name="address"]');
          if (addr && !addr.value) addr.value = r.display.split(',').slice(0, 4).join(',');
          out.innerHTML = '';
          status.textContent = '✓ Coordenadas añadidas';
        }));
      } catch (e) { status.textContent = e.message; }
    });
  }

  return { q, sampleBanner, offlineBanner, isNow, timelineItem, travelLeg, timeline, placeCard, restaurantCard, expenseRow, reservationCard, transportCard, noteCard, noteRef, quick, cityOptions, moneySum, parseCoords, coordsField, bindCoords };
})();
