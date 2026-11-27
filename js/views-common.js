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
JT.uiState = { sites: { kind: 'visit' }, places: {}, food: {}, expenses: { tab: 'summary' }, notes: {}, reservations: {}, phrases: {}, planner: {} };

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
    const head = '<div class="tl' + (o.now ? ' tl--now' : '') + (done ? ' tl--done' : '') + '">' +
      '<div class="tl__time"><span class="mono">' + (a.startTime || '··:··') + '</span>' + (a.endTime ? '<small>' + a.endTime + '</small>' : '') + '</div>' +
      '<div class="tl__line"><button type="button" class="tl__dot" role="checkbox" aria-checked="' + done + '" aria-label="' + esc((done ? 'Marcar pendiente: ' : 'Marcar hecha: ') + a.title) + '" data-act="toggleDone" data-id="' + a.id + '">' + (done ? U.icon('check', 10) : '') + '</button>' + (o.last ? '' : '<span class="tl__rail"></span>') + '</div>';
    // Vuelos, trenes y autobuses: como billete también dentro del día.
    const tr = a.transportId && s.transports[a.transportId];
    if (tr && TICKET_TONE[tr.kind]) {
      const k = D.TRANSPORT[tr.kind], plus = tr.arriveDate ? Math.round((Date.parse(tr.arriveDate) - Date.parse(tr.date)) / 86400000) : 0;
      return head + '<div class="tl__card card--tap ticket ticket--tl tone-' + TICKET_TONE[tr.kind] + '" tabindex="0" data-act="go" data-to="activity/' + a.id + '" data-hold="activityMenu" data-id="' + a.id + '">' +
        '<div class="ticket__top"><span class="ticket__kind">' + k[1] + ' ' + esc((k[0] + (tr.number ? ' · ' + tr.number : '')).toUpperCase()) + '</span>' + (o.now ? UI.pill('Ahora', 'accent') : '') + (tr.bookingCode || tr.seat ? ticketBtn('transports', tr.id) : '') + '</div>' +
        '<div class="ticket__route"><div class="ticket__end"><span class="ticket__time mono">' + esc(tr.departTime || '--:--') + '</span><span class="ticket__place">' + esc(tr.origin) + '</span></div>' +
          '<div class="ticket__line" aria-hidden="true"><span>' + k[1] + '</span>' + (tr.durationMinutes ? '<small>' + esc(U.fmtDur(tr.durationMinutes)) + '</small>' : '') + '</div>' +
          '<div class="ticket__end ticket__end--to"><span class="ticket__time mono">' + esc(tr.arriveTime || '--:--') + (plus > 0 ? '<sup>+' + plus + '</sup>' : '') + '</span><span class="ticket__place">' + esc(tr.destination) + '</span></div></div>' +
        (tr.seat || tr.bookingCode ? '<div class="ticket__stub">' + stubCell('ASIENTO', tr.seat) + stubCell('CÓDIGO', tr.bookingCode, 'code') + '</div>' : '') + '</div></div>';
    }
    return head +
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
    // Más de 50 km: entre medias hay un tren o un vuelo (p. ej. Shinkansen Tokio → Kioto); no es un tramo en metro.
    if (e.straightKm < 0.05 || e.straightKm > 50) return '<div class="tl-gap"></div>';
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

  /** Vista en cuadrícula de Sitios: emoji grande, nombre y una línea; ♥ y ✓ en la esquina. */
  function siteTile(x, isRest) {
    const cat = isRest ? D.CUISINE[x.cuisine] : D.PLACE[x.category];
    const done = isRest ? x.status === 'tried' : x.status === 'visited';
    const sub = isRest ? [cat[0], x.priceLevel ? D.PRICE[x.priceLevel] : ''].filter(Boolean).join(' · ') : [cat[0], x.neighborhood].filter(Boolean).join(' · ');
    return '<button type="button" class="tile' + (done ? ' is-done' : '') + '" data-act="go" data-to="' + (isRest ? 'restaurant/' : 'place/') + x.id + '">' +
      '<span class="tile__emoji" aria-hidden="true">' + cat[1] + '</span><span class="tile__name">' + esc(x.name) + '</span><small class="tile__sub">' + esc(sub) + '</small>' +
      '<span class="tile__badges">' + (x.favorite ? '<span class="tile__fav" aria-label="Favorito">♥</span>' : '') + (done ? '<span class="tile__done" aria-label="' + (isRest ? 'Probado' : 'Visitado') + '">✓</span>' : '') + '</span></button>';
  }

  function restaurantCard(r, km) {
    const s = S.get(), c = D.CUISINE[r.cuisine], city = r.cityId && s.cities[r.cityId];
    return '<div class="item card card--tap" tabindex="0" data-act="go" data-to="restaurant/' + r.id + '">' +
      '<span class="item__emoji" aria-hidden="true">' + c[1] + '</span><div class="item__body"><strong>' + esc(r.name) + '</strong>' +
      '<small class="muted">' + esc([c[0], r.priceLevel ? D.PRICE[r.priceLevel] : '', r.neighborhood || (city && city.name), km !== undefined ? U.fmtKm(km, units()) : ''].filter(Boolean).join(' · ')) + '</small>' +
      '<div class="pills">' + (r.status === 'tried' ? UI.pill('Probado', 'success', 'check') : r.status === 'want' ? UI.pill('Quiero ir', 'accent') : '') + UI.openBadge(r.hours) + (r.rating ? UI.stars(r.rating) : '') + '</div></div>' +
      '<button type="button" class="iconbtn fav' + (r.favorite ? ' is-on' : '') + '" aria-pressed="' + !!r.favorite + '" aria-label="Favorito" data-act="fav" data-col="restaurants" data-id="' + r.id + '">' + U.icon('heart', 20) + '</button></div>';
  }

  /** Fila de gasto con todo el detalle: categoría, ciudad y lugar; cómo se pagó, quién y cuánto toca a cada uno; notas.
      Los de días anteriores llevan 🔒 (se abren bloqueados). */
  function expenseRow(e, mainValue) {
    const s = S.get(), c = D.EXPENSE[e.category] || ['Gasto', '•'], payer = e.paidById && s.travelers[e.paidById];
    const pay = e.paymentMethod && D.PAYMENT[e.paymentMethod], city = e.cityId && s.cities[e.cityId];
    const parts = (e.splitWithIds || []).filter((id) => s.travelers[id]), multi = Object.keys(s.travelers).length > 1;
    const line1 = [c[0], city ? city.name : '', e.placeName].filter(Boolean).join(' · ');
    const line2 = [pay ? pay[1] + ' ' + pay[0] : '', multi && payer ? 'pagó ' + payer.name : '', parts.length > 1 ? 'entre ' + parts.length + ': ' + U.money(e.amount / parts.length, e.currency) + ' c/u' : ''].filter(Boolean).join(' · ');
    const locked = e.date < S.today().now.date;
    const cov = JT.cards && JT.cards.coveredOf ? JT.cards.coveredOf(e) : null; // dinero recibido para este gasto
    const meta = '<small class="muted block">' + esc(line1) + '</small>' + (line2 ? '<small class="muted block">' + esc(line2) + '</small>' : '') +
      (e.notes ? '<small class="exp__note">' + esc(e.notes) + '</small>' : '') +
      (e.taxFree || locked || cov ? '<small class="exp__tags">' + (cov ? '<span class="pill pill--success">💝 ' + (cov.full ? 'Pagado' : 'Cubierto ' + U.money(cov.amount, e.currency)) + (cov.from ? ' · ' + esc(cov.from) : '') + '</span>' : '') + (e.taxFree ? '<span class="pill pill--neutral">🛍️ Tax free</span>' : '') + (locked ? '<span class="exp__lock" title="Bloqueado: de un día anterior">🔒</span>' : '') + '</small>' : '');
    return '<div class="swipe" data-swipe>' +
      '<div class="swipe__actions"><button type="button" class="swipe__btn" data-act="dupExpense" data-id="' + e.id + '">' + U.icon('copy', 18) + 'Duplicar</button>' +
      '<button type="button" class="swipe__btn swipe__btn--danger" data-act="delExpense" data-id="' + e.id + '">' + U.icon('trash', 18) + 'Eliminar</button></div>' +
      '<div class="swipe__content exp card--tap" tabindex="0" data-act="editExpense" data-id="' + e.id + '">' +
      '<span class="exp__emoji tone-' + (CAT_TONE[e.category] || 'slate') + '" aria-hidden="true">' + c[1] + '</span><div class="grow"><strong>' + esc(e.description || c[0]) + '</strong>' + meta + '</div>' +
      '<div class="exp__amount"><strong class="mono">' + U.money(e.amount, e.currency) + '</strong>' + (mainValue ? '<small class="muted" data-noeur>' + esc(mainValue) + '</small>' : '') + '</div></div></div>';
  }

  /* Billetes: vuelos y trenes con aspecto de billete (origen → destino en grande, hora, asiento y código),
     más fáciles de leer en la estación o el aeropuerto. Color de la franja: vuelo azul, tren verde azulado, bus ámbar. */
  const TICKET_TONE = { flight: 'blue', shinkansen: 'teal', train: 'teal', bus: 'amber', ferry: 'blue' };
  /** Billete a pantalla completa: el código en grande y debajo el trayecto, la hora y el asiento (para el control o el revisor). */
  function showTicket(col, id) {
    const x = S.get()[col][id];
    if (!x) return;
    const isT = col === 'transports', k = isT ? D.TRANSPORT[x.kind] : D.RESERVATION[x.type];
    const code = isT ? x.bookingCode : x.confirmationCode, seat = isT ? x.seat : '';
    const lines = [
      k[1] + ' ' + k[0] + (isT && x.number ? ' ' + x.number : ''),
      isT ? x.origin + ' → ' + x.destination : x.name,
      U.fmtDay(x.date) + ' · ' + (isT ? (x.departTime || '--:--') + ' → ' + (x.arriveTime || '--:--') : (x.time || '')),
      seat ? 'Asiento ' + seat : ''
    ].filter(Boolean).join('\n');
    showcase({ ja: code || seat || '—', sub: lines, es: code ? 'Código de reserva' : 'Sin código: añádelo editando el billete', lang: 'none', noSpeak: true });
  }
  JT.actions.showTicket = (el) => showTicket(el.dataset.col, el.dataset.id);
  const ticketBtn = (col, id) => '<button type="button" class="iconbtn ticket__show" data-act="showTicket" data-col="' + col + '" data-id="' + id + '" aria-label="Enseñar billete a pantalla completa" title="Enseñar billete">' + U.icon('expand', 18) + '</button>';

  const stubCell = (label, value, cls) => (value ? '<div><small>' + label + '</small><b class="' + (cls || '') + '">' + esc(value) + '</b></div>' : '');

  function reservationCard(r) {
    const t = D.RESERVATION[r.type];
    if (r.type === 'flight' || r.type === 'train' || r.type === 'bus') {
      return '<div class="card card--tap ticket tone-' + (r.type === 'flight' ? 'blue' : r.type === 'bus' ? 'amber' : 'teal') + '" tabindex="0" data-act="go" data-to="reservation/' + r.id + '">' +
        '<div class="ticket__top"><span class="ticket__kind">' + t[1] + ' ' + esc(t[0].toUpperCase()) + '</span><span class="ticket__date">' + esc(U.fmtDay(r.date)) + '</span>' + (r.confirmationCode ? ticketBtn('reservations', r.id) : '') + '</div>' +
        '<strong class="ticket__name">' + esc(r.name) + '</strong>' +
        '<div class="ticket__stub">' + stubCell('HORA', r.time) + stubCell('CÓDIGO', r.confirmationCode, 'code') + (!r.time && !r.confirmationCode ? '<div><small>SIN CÓDIGO</small><b>—</b></div>' : '') + '</div></div>';
    }
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
    const actions = '<div class="row row--wrap">' + UI.btn('Añadir a Google Calendar', { icon: 'calendar', size: 'sm', variant: 'ghost', data: { act: 'gcal', col: 'transports', id: t.id } }) +
      (t.cost ? (JT.cards.costExpense && JT.cards.costExpense('transports', t.id) ? '<small class="success">✓ En Gastos</small>' : UI.btn('Apuntar en Gastos', { icon: 'wallet', size: 'sm', variant: 'ghost', data: { act: 'costToExpense', col: 'transports', id: t.id } })) : '') + '</div>';
    if (TICKET_TONE[t.kind]) {
      return '<div class="card card--tap ticket tone-' + TICKET_TONE[t.kind] + '" tabindex="0" data-act="editTransport" data-id="' + t.id + '">' +
        '<div class="ticket__top"><span class="ticket__kind">' + k[1] + ' ' + esc((k[0] + (t.number ? ' · ' + t.number : '')).toUpperCase()) + '</span><span class="ticket__date">' + esc(U.fmtDay(t.date)) + '</span>' + (t.bookingCode || t.seat ? ticketBtn('transports', t.id) : '') + '</div>' +
        '<div class="ticket__route"><div class="ticket__end"><span class="ticket__time mono">' + esc(t.departTime || '--:--') + '</span><span class="ticket__place">' + esc(t.origin) + '</span></div>' +
          '<div class="ticket__line" aria-hidden="true"><span>' + k[1] + '</span>' + (t.durationMinutes ? '<small>' + esc(U.fmtDur(t.durationMinutes)) + '</small>' : '') + '</div>' +
          '<div class="ticket__end ticket__end--to"><span class="ticket__time mono">' + esc(t.arriveTime || '--:--') + (plusDays > 0 ? '<sup>+' + plusDays + '</sup>' : '') + '</span><span class="ticket__place">' + esc(t.destination) + '</span></div></div>' +
        (stops.length ? '<div class="stops">' + stopRows + '</div>' + UI.pill(stops.length + (stops.length === 1 ? ' escala' : ' escalas') + ' · ' + U.fmtDur(wait) + ' de espera', 'info') : '') +
        '<div class="ticket__stub">' + stubCell('ASIENTO', t.seat) + stubCell('CÓDIGO', t.bookingCode, 'code') + stubCell('PRECIO', t.cost ? U.money(t.cost, t.currency || 'JPY') : '') +
          (!t.seat && !t.bookingCode && !t.cost ? '<div><small>ASIENTO · CÓDIGO</small><b class="faint">Toca para añadirlos</b></div>' : '') + '</div>' + actions + '</div>';
    }
    return '<div class="card card--tap" tabindex="0" data-act="editTransport" data-id="' + t.id + '"><div class="row"><span aria-hidden="true">' + k[1] + '</span><strong class="grow">' + esc(t.origin + ' → ' + t.destination) + '</strong>' +
      (t.cost ? '<strong class="mono">' + U.money(t.cost, t.currency || 'JPY') + '</strong>' : '') + '</div>' +
      '<div class="row row--between"><small class="muted">' + esc([k[0], t.number, U.fmtDay(t.date)].filter(Boolean).join(' · ')) + '</small><span class="mono">' + (t.departTime || '--:--') + ' → ' + (t.arriveTime || '--:--') + (plusDays > 0 ? '<sup>+' + plusDays + '</sup>' : '') + '</span></div>' +
      (stops.length ? '<div class="stops">' + stopRows + '</div>' : '') +
      '<div class="pills">' + (stops.length ? UI.pill(stops.length + (stops.length === 1 ? ' escala' : ' escalas') + ' · ' + U.fmtDur(wait) + ' de espera', 'info') : '') +
      (t.durationMinutes ? UI.pill(U.fmtDur(t.durationMinutes), 'neutral', 'clock') : '') + (t.seat ? UI.pill(t.seat) : '') + (t.bookingCode ? UI.pill(t.bookingCode, 'info') : '') + '</div>' +
      actions + '</div>';
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
  /** Cuadritos de acceso: [icono de línea, texto, data-*, subtítulo opcional]. */
  /* Cada apartado tiene su color, el mismo en todas partes (Frases siempre rosa, Notas siempre ámbar…),
     para reconocerlo de un vistazo sin leer. Los tonos están en styles.css (.tone-*). */
  const TONE = {
    city: 'violet', ticket: 'red', train: 'blue', note: 'amber', checklist: 'green', doc: 'slate', info: 'teal', chat: 'pink',
    calendar: 'indigo', wallet: 'green', food: 'orange', bed: 'violet', gift: 'indigo', car: 'violet', card: 'green', cash: 'amber'
  };
  function quick(items, variant) {
    return '<div class="quick' + (variant ? ' quick--' + variant : '') + '">' + items.map((it) => '<button type="button" class="quick__btn tone-' + (TONE[it[0]] || 'red') + '"' + UI.dataAttrs(it[2]) + '><span class="quick__icon">' + U.icon(it[0], 22) + '</span><small>' + esc(it[1]) + '</small>' +
      (it[3] ? '<span class="quick__sub">' + esc(it[3]) + '</span>' : '') + '</button>').join('') + '</div>';
  }

  /* ── Pantalla completa para enseñar una frase ─────────────────
     Letra tan grande como quepa (se ajusta al girar el móvil). Si se abre
     con un toque, pide pantalla completa y gira a horizontal (Android);
     si el navegador no deja, queda igual a pantalla completa dentro de la app. */
  let showcaseOpen = null;
  function showcase(o, opts) {
    opts = opts || {};
    if (showcaseOpen) showcaseOpen();
    const ov = document.createElement('div');
    ov.className = 'showcase';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', o.es || 'Frase a pantalla completa');
    ov.innerHTML = '<button type="button" class="showcase__text" data-close aria-label="Cerrar"><span class="showcase__ja' + (o.lang === 'none' ? ' showcase__ja--code" translate="no"' : '" lang="ja"') + '>' + esc(o.ja) + '</span>' +
      (o.sub ? '<span class="showcase__sub">' + esc(o.sub) + '</span>' : '') + '</button>' +
      '<div class="showcase__bar"><span class="showcase__es">' + esc(o.es || '') + '</span>' +
      (JT.services.canSpeak() && !o.noSpeak ? '<button type="button" class="iconbtn" data-say aria-label="Escuchar">' + U.icon('speaker', 22) + '</button>' : '') +
      '<button type="button" class="btn btn--secondary btn--sm" data-close>' + U.icon('x', 16) + '<span>Cerrar</span></button></div>';
    document.body.appendChild(ov);
    document.body.classList.add('has-showcase');
    const text = ov.querySelector('.showcase__text'), ja = ov.querySelector('.showcase__ja');
    // Prueba tamaños de mayor a menor hasta que el japonés quepa entero.
    const fit = function () {
      let size = Math.min(240, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.6));
      ja.style.fontSize = size + 'px';
      while (size > 18 && (text.scrollHeight > text.clientHeight + 1 || ja.scrollWidth > text.clientWidth + 1)) { size -= 4; ja.style.fontSize = size + 'px'; }
    };
    fit();
    window.addEventListener('resize', fit);
    let entered = false;
    const close = function () {
      if (!ov.isConnected) return;
      window.removeEventListener('resize', fit);
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('hashchange', close);
      UI.backForget(close);
      ov.remove();
      document.body.classList.remove('has-showcase');
      showcaseOpen = null;
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* sin bloqueo */ }
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      if (opts.onClose) opts.onClose();
    };
    // Si sales de la pantalla completa con «atrás», se cierra también.
    const onFs = function () { if (entered && !document.fullscreenElement) close(); };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('hashchange', close);
    UI.backPush(close); // «atrás» del móvil: cierra la pantalla completa sin salir de donde estás
    ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    const say = ov.querySelector('[data-say]');
    if (say) say.addEventListener('click', () => JT.services.speak(o.speak || o.ja));
    if (opts.fullscreen !== false && ov.requestFullscreen) {
      // Tiene que ir en el mismo toque: nada de esperas antes.
      ov.requestFullscreen({ navigationUI: 'hide' }).then(function () {
        entered = true;
        if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape').catch(() => {});
      }).then(fit).catch(() => {});
    }
    showcaseOpen = close;
    return close;
  }
  JT.actions.showcase = (el) => showcase({ ja: el.dataset.ja, sub: el.dataset.sub, es: el.dataset.es });

  /* ── Elegir tipo con buscador (y crear uno nuevo) ──────────────
     Escribes «onsen» y se quedan sólo los que coinciden; Intro elige el primero.
     Si no existe, «Crear «onsen»» lo añade a tus tipos propios y queda elegido. */
  function typePicker(name, catalog, value, kind) {
    let chips = UI.chips(name, D.options(catalog), value);
    // Gastos: cada categoría con su color (el mismo que en las barras y la leyenda).
    if (kind === 'expense') chips = chips.replace(/<label class="chip"><input type="radio" name="([^"]+)" value="([^"]*)"/g, (m, n, v) => '<label class="chip chip--tone" style="--chip:' + catColor(v) + '"><input type="radio" name="' + n + '" value="' + v + '"');
    return '<div class="tpick" data-kind="' + (kind || '') + '" data-name="' + name + '">' +
      '<label class="search tpick__search"><span class="search__icon">' + U.icon('search', 16) + '</span><input class="input" type="search" placeholder="Buscar tipo…" data-input="tpickFilter" aria-label="Buscar tipo" autocomplete="off" enterkeyhint="done"></label>' +
      chips +
      '<small class="muted tpick__none" hidden>Ningún tipo coincide.</small>' +
      (kind ? '<button type="button" class="btn btn--ghost btn--sm tpick__new" data-act="tpickCreate" data-kind="' + kind + '">' + U.icon('plus', 16) + '<span>Crear un tipo nuevo</span></button>' : '') + '</div>';
  }

  JT.changes = JT.changes || {};
  JT.changes.tpickFilter = function (el) {
    const box = el.closest('.tpick'), q = U.normalize(el.value.trim());
    let shown = 0;
    box.querySelectorAll('label.chip').forEach(function (chip) {
      const match = !q || U.normalize(chip.textContent).indexOf(q) > -1;
      chip.hidden = !match && !chip.querySelector('input').checked; // el elegido sigue a la vista
      if (match) shown++;
    });
    box.querySelector('.tpick__none').hidden = shown > 0;
    const nb = box.querySelector('.tpick__new span');
    if (nb) nb.textContent = el.value.trim() ? 'Crear «' + el.value.trim() + '»' : 'Crear un tipo nuevo';
  };
  // Intro en el buscador elige el primer tipo visible (y no envía el formulario).
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || !ev.target.matches || !ev.target.matches('[data-input="tpickFilter"]')) return;
    ev.preventDefault();
    const first = Array.from(ev.target.closest('.tpick').querySelectorAll('label.chip')).find((c) => !c.hidden);
    if (first) { first.querySelector('input').checked = true; ev.target.value = ''; JT.changes.tpickFilter(ev.target); }
  });

  /** Hoja para crear o editar un tipo propio. onDone(key) al guardar. */
  function customTypeSheet(kind, opts) {
    opts = opts || {};
    const KIND_LABEL = { place: 'sitio', cuisine: 'comida', expense: 'gasto', activity: 'actividad', reservation: 'reserva' };
    const SUGGEST = ['⭐', '📍', '🏯', '🎌', '🎐', '🍶', '🍵', '🧋', '🛍️', '🎮', '📷', '🚶', '🧳', '💡', '🎨', '🧘'];
    const close = UI.sheet({
      title: opts.key ? 'Editar tipo de ' + KIND_LABEL[kind] : 'Nuevo tipo de ' + KIND_LABEL[kind],
      body: '<form id="fType" class="stack" novalidate>' + UI.field('Nombre', UI.input('label', opts.label || '', { placeholder: 'p.ej. Karaoke', autofocus: true })) +
        UI.field('Emoji', UI.input('emoji', opts.emoji || '⭐', { placeholder: '⭐' }), { hint: 'Escríbelo con el teclado del móvil o elige uno:' }) +
        '<div class="chips">' + SUGGEST.map((e) => '<button type="button" class="chip chip--btn" data-emoji="' + e + '"><span>' + e + '</span></button>').join('') + '</div>' +
        '<p class="error" hidden></p></form>',
      footer: UI.btn(opts.key ? 'Guardar' : 'Crear tipo', { type: 'submit', form: 'fType', block: true }),
      onMount: function (root) {
        const form = root.querySelector('#fType');
        root.querySelectorAll('[data-emoji]').forEach((b) => b.addEventListener('click', () => { form.emoji.value = b.dataset.emoji; }));
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          if (!f.label) { err.textContent = 'Escribe un nombre'; err.hidden = false; return; }
          let key = opts.key;
          if (key) S.updateCustomType(kind, key, f.label, f.emoji); else key = S.addCustomType(kind, f.label, f.emoji);
          close();
          if (opts.onDone) opts.onDone(key, f.label, f.emoji || '⭐');
        });
      }
    });
  }

  JT.actions.tpickCreate = function (el) {
    const box = el.closest('.tpick'), kind = el.dataset.kind, input = box.querySelector('[data-input="tpickFilter"]');
    customTypeSheet(kind, {
      label: input.value.trim(),
      onDone: function (key, label, emoji) {
        // Añade el chip nuevo al formulario abierto y déjalo elegido.
        const chips = box.querySelector('.chips');
        chips.insertAdjacentHTML('beforeend', '<label class="chip"><input type="radio" name="' + box.dataset.name + '" value="' + esc(key) + '" checked><span>' + esc(emoji) + ' ' + esc(label) + '</span></label>');
        input.value = '';
        JT.changes.tpickFilter(input);
        UI.toast('Tipo «' + label + '» creado');
      }
    });
  };

  /** Botón 🔊 que lee un texto en japonés con la voz del móvil (vacío si el navegador no puede). */
  function speakBtn(text, label) {
    if (!JT.services.canSpeak() || !text) return '';
    return '<button type="button" class="iconbtn speak" aria-label="' + esc(label || 'Escuchar en japonés') + '" title="' + esc(label || 'Escuchar en japonés') + '" data-act="speak" data-text="' + esc(text) + '">' + U.icon('speaker', 20) + '</button>';
  }

  /* Color de cada categoría de gasto (mismos tonos que los apartados). */
  const CAT_TONE = { flights: 'blue', hotel: 'violet', transport: 'teal', food: 'orange', shopping: 'pink', tickets: 'red', cafe: 'amber', gifts: 'indigo', health: 'red', laundry: 'teal', internet: 'blue', other: 'slate' };
  const catColor = (cat) => 'var(--t-' + (CAT_TONE[cat] || 'slate') + ')';

  /** Total por categoría en la moneda principal, de mayor a menor: [[cat, valor]]. */
  function byCategory(list) {
    const main = S.get().trip.mainCurrency, rates = JT.services.rates(), m = {};
    list.forEach((e) => { const v = U.convert(e.amount, e.currency, main, rates); if (v !== null) m[e.category] = (m[e.category] || 0) + v; });
    return Object.keys(m).map((k) => [k, m[k]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  }

  /** Barra apilada con el reparto del gasto por categoría y su leyenda (legend: cuántas categorías nombrar). */
  function catStack(list, legend) {
    const cats = byCategory(list), total = cats.reduce((a, x) => a + x[1], 0);
    if (!total) return '';
    const pct = (v) => pctText(v, total);
    const shown = legend ? cats.slice(0, legend) : [];
    return '<div class="catstack" role="img" aria-label="' + esc('Reparto por categoría: ' + cats.map((x) => D.EXPENSE[x[0]][0] + ' ' + pct(x[1])).join(', ')) + '">' +
      // Cada color se puede tocar: abre Gastos → Lista con esa categoría.
      cats.map((x) => '<span data-act="expFilter" data-k="category" data-v="' + esc(x[0]) + '" title="' + esc(D.EXPENSE[x[0]][0] + ' ' + pct(x[1])) + '" style="width:' + (x[1] / total) * 100 + '%;background:' + catColor(x[0]) + '"></span>').join('') + '</div>' +
      (shown.length ? '<div class="catlegend">' + shown.map((x) => '<button type="button" class="catlegend__item" data-act="expFilter" data-k="category" data-v="' + esc(x[0]) + '"><i style="background:' + catColor(x[0]) + '"></i>' + esc(D.EXPENSE[x[0]][0]) + ' <b>' + pct(x[1]) + '</b></button>').join('') +
        (shown.length < cats.length ? '<button type="button" class="catlegend__item faint" data-act="expSummary">+' + (cats.length - shown.length) + ' más</button>' : '') + '</div>' : '');
  }

  /** «48%», o «<1%» si es muy poco pero no cero. */
  function pctText(v, total) {
    const p = Math.round((v / total) * 100);
    return p === 0 && v > 0 ? '<1%' : p + '%';
  }

  /** Doble reloj: la hora en Japón (la de la app, también al simular) y la de España, con «ayer» si allí aún es el día anterior. */
  function clocks(n) {
    if (!n || !n.time) return '';
    const ts = U.localToTs(n.date, n.time, S.get().trip.timezoneOffsetMinutes || 540);
    let es = '', esDate = '';
    try {
      es = new Date(ts).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      esDate = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    } catch (e) { return ''; }
    const when = esDate < n.date ? 'ayer' : esDate > n.date ? 'mañana' : '';
    // v1.13.0: dos recuadros grandes (antes era una línea pequeña), con el día debajo y la diferencia en medio.
    const dayOf = (tz) => { try { return new Date(ts).toLocaleDateString('es-ES', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, ''); } catch (e) { return ''; } };
    const diff = Math.round(((S.get().trip.timezoneOffsetMinutes || 540) - madridOffset(ts)) / 60);
    return '<div class="clocks" role="group" aria-label="' + esc('Hora en Japón ' + n.time + '; en España ' + es + (when ? ', ' + when : '')) + '">' +
      '<div class="clock clock--jp"><small>JAPÓN</small><b class="mono">' + esc(n.time) + '</b><span>' + esc(dayOf('Asia/Tokyo')) + '</span></div>' +
      '<div class="clocks__diff" aria-hidden="true">' + (diff > 0 ? '+' : '') + diff + ' h</div>' +
      '<div class="clock clock--es"><small>ESPAÑA</small><b class="mono">' + esc(es) + '</b><span>' + esc(when ? when + ' · ' + dayOf('Europe/Madrid') : dayOf('Europe/Madrid')) + '</span></div></div>';
  }
  /** Minutos de diferencia de Madrid con UTC en ese momento (60 en invierno, 120 en verano). */
  function madridOffset(ts) {
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ts));
      const g = (t) => Number(p.find((x) => x.type === t).value);
      return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - ts) / 60000);
    } catch (e) { return 60; }
  }

  /* Nombre de la ciudad en japonés: el que pusiste en la ciudad o, si no, el de esta lista (ciudades habituales). */
  const CITY_JA = {
    tokyo: '東京', tokio: '東京', kyoto: '京都', kioto: '京都', osaka: '大阪', nara: '奈良', takayama: '高山', kanazawa: '金沢',
    hiroshima: '広島', miyajima: '宮島', hakone: '箱根', nikko: '日光', kamakura: '鎌倉', yokohama: '横浜', kobe: '神戸',
    nagoya: '名古屋', fukuoka: '福岡', sapporo: '札幌', uji: '宇治', himeji: '姫路', matsumoto: '松本', 'shirakawa-go': '白川郷',
    shirakawago: '白川郷', okinawa: '沖縄', naha: '那覇', sendai: '仙台', nagano: '長野', kawaguchiko: '河口湖', fuji: '富士'
  };
  function cityJa(c) {
    if (!c) return '';
    if (c.nameJa) return c.nameJa;
    const k = U.normalize(c.name).replace(/\s+/g, '');
    return CITY_JA[k] || CITY_JA[k.replace(/-/g, '')] || '';
  }

  /** Fechas de una ciudad en el viaje: «19 nov – 25 nov» (y otro tramo si vuelves: « · 14 dic – 16 dic»). */
  function cityRanges(cityId) {
    const out = [];
    let cur = null;
    S.sortedDays().forEach(function (d) {
      if (d.cityId === cityId) { if (cur) cur[1] = d.date; else out.push((cur = [d.date, d.date])); } else cur = null;
    });
    return out.map((r) => U.fmtShort(r[0]) + (r[1] !== r[0] ? ' – ' + U.fmtShort(r[1]) : '')).join(' · ');
  }

  /** Lista agrupada por ciudad, en el orden en que las visitas (luego las que no están en el viaje y «Sin ciudad»).
      Cabecera con el color de la ciudad, sus fechas y cuántos hay; se queda fija arriba al bajar. */
  function byCityGroups(items, render, wrapCls) {
    const s = S.get(), groups = {}, order = [];
    items.forEach((x) => { const k = x.cityId && s.cities[x.cityId] ? x.cityId : ''; (groups[k] = groups[k] || []).push(x); });
    S.sortedDays().forEach((d) => { if (d.cityId && groups[d.cityId] && order.indexOf(d.cityId) === -1) order.push(d.cityId); });
    Object.keys(groups).filter((k) => k && order.indexOf(k) === -1).forEach((k) => order.push(k));
    if (groups['']) order.push('');
    return '<div class="itin">' + order.map(function (k) {
      const c = s.cities[k], dates = c ? cityRanges(k) : '';
      return '<section class="section"><div class="section__hdr citygrp"><h2 class="section__title"><span class="dot" style="background:' + esc(c ? c.color || 'var(--accent)' : 'var(--border)') + '"></span>' + esc(c ? c.name : 'Sin ciudad') + (cityJa(c) ? ' <span class="ja-name" lang="ja">' + esc(cityJa(c)) + '</span>' : '') + '</h2>' +
        '<small class="muted">' + esc((dates ? dates + ' · ' : '') + groups[k].length) + '</small></div>' + (wrapCls ? '<div class="' + wrapCls + '">' : '') + groups[k].map(render).join('') + (wrapCls ? '</div>' : '') + '</section>';
    }).join('') + '</div>';
  }

  /** Franja con todos los días del viaje coloreados por ciudad y una marca en «hoy». Toca → Itinerario. */
  function cityStrip(today) {
    const s = S.get(), days = S.sortedDays();
    if (days.length < 2) return '';
    const groups = [];
    days.forEach(function (d) {
      const last = groups[groups.length - 1], cid = d.cityId || '';
      if (last && last.cityId === cid) last.n++; else groups.push({ cityId: cid, n: 1 });
    });
    const idx = days.findIndex((d) => d.date === today), total = days.length;
    const name = (g) => (s.cities[g.cityId] ? s.cities[g.cityId].name : 'Libre');
    // Si el tramo es corto no cabe el nombre: sus dos primeras letras (el nombre completo va en aria-label).
    const label = (g) => (g.n / total >= 0.14 ? name(g) : name(g).slice(0, g.n / total >= 0.07 ? 2 : 1));
    return '<button type="button" class="strip" data-act="go" data-to="itinerary" aria-label="' + esc('Recorrido: ' + groups.map((g) => name(g) + ' ' + g.n + (g.n === 1 ? ' día' : ' días')).join(', ') + (idx > -1 ? '. Hoy es el día ' + (idx + 1) : '')) + '">' +
      '<span class="strip__bar"><span class="strip__segs">' + groups.map((g) => '<span style="flex:' + g.n + ';background:' + esc(s.cities[g.cityId] ? s.cities[g.cityId].color || 'var(--accent)' : 'var(--border)') + '"></span>').join('') + '</span>' +
        (idx > -1 ? '<span class="strip__past" style="width:' + (idx / total) * 100 + '%"></span><span class="strip__now" style="left:' + ((idx + 0.5) / total) * 100 + '%"></span>' : '') + '</span>' +
      // En los tramos largos, debajo del nombre, el kanji (東京, 京都…) para reconocerlo en carteles.
      '<span class="strip__labels">' + groups.map((g) => '<span style="flex:' + g.n + '">' + esc(label(g)) + (g.n / total >= 0.14 && cityJa(s.cities[g.cityId]) ? '<i lang="ja">' + esc(cityJa(s.cities[g.cityId])) + '</i>' : '') + '</span>').join('') + '</span>' +
      stripLeft(groups, days, idx, today, name) + '</button>';
  }

  /** Debajo de la franja: cuántos días te quedan en la ciudad en la que estás y adónde vas después. */
  function stripLeft(groups, days, idx, today, name) {
    if (idx < 0) {
      if (!days.length || today > days[days.length - 1].date) return '';
      const g = groups[0];
      return '<span class="strip__left"><b>' + esc(name(g)) + '</b> · ' + g.n + (g.n === 1 ? ' día' : ' días') + (groups[1] ? ' · después ' + esc(name(groups[1])) : '') + '</span>';
    }
    let start = 0, k = 0;
    for (; k < groups.length; k++) { if (idx < start + groups[k].n) break; start += groups[k].n; }
    const g = groups[k], next = groups[k + 1], lastIdx = start + g.n - 1, left = lastIdx - idx;
    const where = g.cityId ? esc(name(g)) : 'Días libres';
    const txt = left === 0 ? (next ? 'último día · mañana <b>' + esc(name(next)) + '</b>' : 'último día del viaje')
      : (left === 1 ? '1 día más' : left + ' días más') + ' (hasta el ' + esc(U.fmtShort(days[lastIdx].date)) + ')' + (next ? ' · después <b>' + esc(name(next)) + '</b>' : '');
    return '<span class="strip__left' + (left === 0 ? ' is-last' : '') + '">📍 <b>' + where + '</b>: ' + txt + '</span>';
  }

  /** Conversor rápido yen ⇄ moneda principal para el Modo viaje. Recuerda el importe y la dirección. */
  function quickConverter() {
    const st = JT.uiState.conv || (JT.uiState.conv = { dir: 'jpy', value: '' });
    const main = S.get().trip.mainCurrency, other = main === 'JPY' ? 'EUR' : main;
    const from = st.dir === 'jpy' ? 'JPY' : other, to = st.dir === 'jpy' ? other : 'JPY';
    const rates = JT.services.rates(), rate = U.convert(1, from, to, rates);
    if (!rate) return UI.card('<small class="eyebrow muted">CONVERSOR</small><p class="muted small">Sin tipo de cambio: conéctate una vez (se guarda para usarlo sin conexión).</p>', { cls: 'stack-sm' });
    const n = U.parseAmount(st.value || '') || 0;
    const sym = { JPY: '¥', EUR: '€', USD: '$' };
    return UI.card('<div class="row row--between"><small class="eyebrow muted">CONVERSOR</small><small class="faint">1 ' + (from === 'JPY' ? other : from) + ' = ' + esc(U.money(U.convert(1, from === 'JPY' ? other : from, 'JPY', rates), 'JPY')) + '</small></div>' +
      '<div class="conv"><span class="conv__sym" aria-hidden="true">' + (sym[from] || from) + '</span>' +
        '<input class="input input--lg conv__in" inputmode="decimal" placeholder="' + (from === 'JPY' ? '1000' : '10') + '" value="' + esc(st.value || '') + '" data-input="quickConv" data-rate="' + rate + '" data-to="' + to + '" aria-label="Importe en ' + from + '" autocomplete="off">' +
        UI.iconBtn('swap', 'Cambiar ' + from + ' ⇄ ' + to, { act: 'convSwap' }) + '</div>' +
      '<div class="conv__out" id="qconvOut">' + (n ? '≈ ' + esc(U.money(n * rate, to)) : 'Escribe un importe en ' + from) + '</div>' +
      '<div class="conv__ja" id="qconvJa">' + jaPrice(from === 'JPY' ? n : n * rate) + '</div>', { cls: 'stack-sm' });
  }
  JT.changes = JT.changes || {};
  JT.changes.quickConv = function (el) {
    JT.uiState.conv.value = el.value;
    const n = U.parseAmount(el.value) || 0, out = document.getElementById('qconvOut'), ja = document.getElementById('qconvJa');
    if (out) out.textContent = n ? '≈ ' + U.money(n * Number(el.dataset.rate), el.dataset.to) : 'Escribe un importe';
    if (ja) ja.innerHTML = jaPrice(el.dataset.to === 'JPY' ? n * Number(el.dataset.rate) : n);
  };

  /* ── Precios en japonés: cómo se dice «1.500 ¥» (せんごひゃくえん · sen gohyaku en) ──
     Con los cambios de sonido de siempre: 300 sanbyaku, 600 roppyaku, 800 happyaku, 3.000 sanzen, 8.000 hassen;
     «sen» sola para 1.000 e «issen» delante de man/oku; 4 ¥ = yo en. */
  const JA_D = [['', ''], ['ichi', 'いち'], ['ni', 'に'], ['san', 'さん'], ['yon', 'よん'], ['go', 'ご'], ['roku', 'ろく'], ['nana', 'なな'], ['hachi', 'はち'], ['kyū', 'きゅう']];
  const JA_100 = { 1: ['hyaku', 'ひゃく'], 3: ['sanbyaku', 'さんびゃく'], 6: ['roppyaku', 'ろっぴゃく'], 8: ['happyaku', 'はっぴゃく'] };
  const JA_1000 = { 1: ['sen', 'せん'], 3: ['sanzen', 'さんぜん'], 8: ['hassen', 'はっせん'] };
  function jaBlock(n, big) {
    const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), t = Math.floor((n % 100) / 10), o = n % 10, out = [];
    if (th) out.push(th === 1 && big ? ['issen', 'いっせん'] : JA_1000[th] || [JA_D[th][0] + 'sen', JA_D[th][1] + 'せん']);
    if (h) out.push(JA_100[h] || [JA_D[h][0] + 'hyaku', JA_D[h][1] + 'ひゃく']);
    if (t) out.push(t === 1 ? ['jū', 'じゅう'] : [JA_D[t][0] + 'jū', JA_D[t][1] + 'じゅう']);
    if (o) out.push(JA_D[o]);
    return out;
  }
  /** [romaji, hiragana] de un número entero (hasta 9.999 oku). */
  function jaNumber(num) {
    const n = Math.round(Math.abs(num));
    if (!n) return ['zero', 'ゼロ'];
    const oku = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4), rest = n % 1e4, words = [];
    const add = (parts, suf) => { if (!parts.length) return; const r = parts.map((p) => p[0]), k = parts.map((p) => p[1]).join(''); if (suf) r[r.length - 1] += suf[0]; words.push([r.join(' '), k + (suf ? suf[1] : '')]); };
    add(oku ? jaBlock(oku, true) : [], ['oku', 'おく']);
    add(man ? jaBlock(man, true) : [], ['man', 'まん']);
    add(rest ? jaBlock(rest, false) : [], null);
    return [words.map((w) => w[0]).join(' '), words.map((w) => w[1]).join('')];
  }
  function jaPrice(yen) {
    const n = Math.round(yen || 0);
    if (!n) return '';
    const r = jaNumber(n);
    let rom = r[0] + ' en', kana = r[1] + 'えん';
    if (n % 10 === 4) { rom = rom.replace(/yon en$/, 'yo en'); kana = kana.replace(/よんえん$/, 'よえん'); }
    const digits = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
    return '<div class="jap"><div class="grow"><small class="eyebrow muted block">ASÍ SE DICE</small><span class="jap__digits mono" lang="ja">' + digits + '</span>' +
      '<span class="jap__kana" lang="ja">' + esc(kana) + '</span><span class="jap__rom">' + esc(rom) + '</span></div>' + speakBtn(n + '円', 'Escuchar el precio en japonés') + '</div>';
  }
  JT.actions.convSwap = function () {
    const st = JT.uiState.conv;
    st.dir = st.dir === 'jpy' ? 'main' : 'jpy';
    st.value = '';
    JT.app.focusAfter = '.conv__in';
    JT.app.render();
  };

  function giftCount() {
    const g = Object.values(S.get().gifts), bought = g.filter((x) => x.bought).length;
    return !g.length ? 'Vacío' : bought === g.length ? 'Todo comprado' : bought + ' de ' + g.length + ' comprados';
  }

  /** «Tu viaje» en Inicio: ciudades, reservas, notas…, con cuántos hay de cada uno. */
  function tripHub() {
    const s = S.get(), n = (k) => Object.keys(s[k]).length;
    const pending = Object.values(s.checklistItems).filter((i) => !i.done).length;
    const count = (k, one, many) => (n(k) ? n(k) + ' ' + (n(k) === 1 ? one : many) : 'Vacío');
    return UI.section('Tu viaje', quick([
      ['city', 'Ciudades', { act: 'go', to: 'cities' }, count('cities', 'ciudad', 'ciudades')],
      ['ticket', 'Reservas', { act: 'go', to: 'reservations' }, count('reservations', 'reserva', 'reservas')],
      ['train', 'Transporte', { act: 'go', to: 'transport' }, count('transports', 'trayecto', 'trayectos')],
      ['note', 'Notas', { act: 'go', to: 'notes' }, count('notes', 'nota', 'notas')],
      ['checklist', 'Checklist', { act: 'go', to: 'checklist' }, pending ? pending + ' pendientes' : 'Todo listo'],
      ['doc', 'Documentos', { act: 'go', to: 'documents' }, count('docs', 'dato', 'datos')],
      ['info', 'Info útil', { act: 'go', to: 'info' }, 'Enchufes, 110…'],
      ['chat', 'Frases', { act: 'go', to: 'phrases' }, 'Sin conexión'],
      ['gift', 'Regalos', { act: 'go', to: 'gifts' }, giftCount()]
    ], 'hub'));
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
      UI.field('Coordenadas', UI.input('coords', coords ? coords.lat + ', ' + coords.lng : '', { placeholder: '34.9671, 135.7727', inputmode: 'decimal' }), { optional: true, hint: 'Para «Cómo llegar», las distancias y «restaurantes cerca». Pégalas de Google Maps o búscalas.' }) +
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

  /* ── Euros en pequeño junto a cada importe en yenes (o dólares) ──
     Se hace al pintar cada pantalla y cada hoja: busca «¥1.234» / «$12.50» en el texto y añade «≈ 6,93 €»
     con el tipo de cambio de la app (BCE con tu redondeo). No toca lo que ya habla de euros
     (textos con €, EUR, = o ≈) ni lo marcado con data-noeur. */
  const AMT_RE = /(¥\d[\d.]*|\$\d[\d,]*(?:\.\d+)?)/g;
  function eurOf(v, cur) {
    if (cur === 'EUR' || !v || isNaN(v)) return ''; // ¥0 no necesita traducción
    const e = U.convert(Math.abs(v), cur, 'EUR', JT.services.rates());
    return e === null || e === undefined ? '' : '≈ ' + U.money(e, 'EUR');
  }
  /* Tocar un importe alterna en toda la app: yenes en grande y euros en pequeño, o al revés (settings.moneyView).
     En los formularios siempre manda el yen, que es lo que escribes. */
  JT.actions.moneyToggle = function () {
    const eur = S.get().settings.moneyView !== 'eur';
    S.setSettings({ moneyView: eur ? 'eur' : 'jpy' });
    UI.toast(eur ? 'Importes en euros (el yen, en pequeño)' : 'Importes en yenes (el euro, en pequeño)');
  };
  // Tocar un importe que no esté dentro de un botón o una tarjeta que ya haga algo (ésos abren lo suyo).
  document.addEventListener('click', function (ev) {
    const a = ev.target.closest && ev.target.closest('.amt, .eur');
    if (!a || !a.parentElement || a.parentElement.closest('[data-act], button, a, label, input, form, .swipe')) return;
    JT.actions.moneyToggle();
  });
  function addEur(root) {
    if (!root || !JT.services.rates()) return;
    const eurBig = S.get().settings.moneyView === 'eur';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      const t = n.nodeValue;
      if (!t || (t.indexOf('¥') < 0 && t.indexOf('$') < 0) || /EUR|€|≈|=/.test(t)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      return !p || p.closest('.amt, .eur, [data-noeur], script, style, textarea, option, title') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      const t = n.nodeValue, frag = document.createDocumentFragment();
      let last = 0, m, any = false;
      AMT_RE.lastIndex = 0;
      while ((m = AMT_RE.exec(t))) {
        const s = m[1], cur = s[0] === '¥' ? 'JPY' : 'USD';
        const v = cur === 'JPY' ? Number(s.slice(1).replace(/\./g, '')) : Number(s.slice(1).replace(/,/g, ''));
        const e = eurOf(v, cur);
        if (!e) continue;
        any = true;
        frag.appendChild(document.createTextNode(t.slice(last, m.index)));
        const a = document.createElement('span'); a.className = 'amt'; a.textContent = s;
        const sm = document.createElement('small'); sm.className = 'eur'; sm.textContent = e;
        if (eurBig && !n.parentElement.closest('form')) {
          a.textContent = e.replace('≈ ', ''); a.classList.add('amt--eur');
          const pre = t.slice(0, m.index), sign = /[-−]$/.test(pre) ? pre.slice(-1) : '';
          sm.textContent = sign + s; sm.classList.add('eur--yen');
        }
        frag.appendChild(a); frag.appendChild(sm);
        last = m.index + s.length;
      }
      if (!any) return;
      frag.appendChild(document.createTextNode(t.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }

  return { q, sampleBanner, offlineBanner, isNow, timelineItem, travelLeg, timeline, placeCard, restaurantCard, expenseRow, reservationCard, transportCard, noteCard, noteRef, quick, tripHub, speakBtn, showcase, typePicker, customTypeSheet, TONE, catColor, byCategory, catStack, pctText, cityStrip, quickConverter, cityRanges, byCityGroups, cityJa, clocks, siteTile, cityOptions, moneySum, parseCoords, coordsField, bindCoords, eurOf, addEur, jaPrice, jaNumber };
})();
