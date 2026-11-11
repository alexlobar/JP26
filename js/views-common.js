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
    const pay = e.paymentMethod && D.PAYMENT[e.paymentMethod];
    const meta = [U.fmtShort(e.date), pay ? pay[1] + ' ' + pay[0] : '', e.placeName, payer ? 'pagó ' + payer.name : '', (e.splitWithIds || []).length > 1 ? '÷' + e.splitWithIds.length : ''].filter(Boolean).join(' · ');
    return '<div class="swipe" data-swipe>' +
      '<div class="swipe__actions"><button type="button" class="swipe__btn" data-act="dupExpense" data-id="' + e.id + '">' + U.icon('copy', 18) + 'Duplicar</button>' +
      '<button type="button" class="swipe__btn swipe__btn--danger" data-act="delExpense" data-id="' + e.id + '">' + U.icon('trash', 18) + 'Eliminar</button></div>' +
      '<div class="swipe__content exp card--tap" tabindex="0" data-act="editExpense" data-id="' + e.id + '">' +
      '<span class="exp__emoji tone-' + (CAT_TONE[e.category] || 'slate') + '" aria-hidden="true">' + c[1] + '</span><div class="grow"><strong>' + esc(e.description || c[0]) + '</strong><small class="muted">' + esc(meta) + '</small></div>' +
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
      (t.durationMinutes ? UI.pill(U.fmtDur(t.durationMinutes), 'neutral', 'clock') : '') + (t.seat ? UI.pill(t.seat) : '') + (t.bookingCode ? UI.pill(t.bookingCode, 'info') : '') + '</div>' +
      '<div class="row row--wrap">' + UI.btn('Añadir a Google Calendar', { icon: 'calendar', size: 'sm', variant: 'ghost', data: { act: 'gcal', col: 'transports', id: t.id } }) +
        (t.cost ? (JT.cards.costExpense && JT.cards.costExpense('transports', t.id) ? '<small class="success">✓ En Gastos</small>' : UI.btn('Apuntar en Gastos', { icon: 'wallet', size: 'sm', variant: 'ghost', data: { act: 'costToExpense', col: 'transports', id: t.id } })) : '') + '</div></div>';
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
    calendar: 'indigo', wallet: 'green', food: 'orange', bed: 'violet'
  };
  function quick(items, variant) {
    return '<div class="quick' + (variant ? ' quick--' + variant : '') + '">' + items.map((it) => '<button type="button" class="quick__btn tone-' + (TONE[it[0]] || 'red') + '"' + UI.dataAttrs(it[2]) + '><span class="quick__icon">' + U.icon(it[0], 22) + '</span><small>' + esc(it[1]) + '</small>' +
      (it[3] ? '<span class="quick__sub">' + esc(it[3]) + '</span>' : '') + '</button>').join('') + '</div>';
  }

  /** Botón 🔊 que lee un texto en japonés con la voz del móvil (vacío si el navegador no puede). */
  function speakBtn(text, label) {
    if (!JT.services.canSpeak() || !text) return '';
    return '<button type="button" class="iconbtn speak" aria-label="' + esc(label || 'Escuchar en japonés') + '" title="' + esc(label || 'Escuchar en japonés') + '" data-act="speak" data-text="' + esc(text) + '">' + U.icon('speaker', 20) + '</button>';
  }

  /* Color de cada categoría de gasto (mismos tonos que los apartados). */
  const CAT_TONE = { flights: 'blue', hotel: 'violet', transport: 'teal', food: 'orange', shopping: 'pink', tickets: 'red', cafe: 'amber', gifts: 'indigo', other: 'slate' };
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
      cats.map((x) => '<span style="width:' + (x[1] / total) * 100 + '%;background:' + catColor(x[0]) + '"></span>').join('') + '</div>' +
      (shown.length ? '<div class="catlegend">' + shown.map((x) => '<span><i style="background:' + catColor(x[0]) + '"></i>' + esc(D.EXPENSE[x[0]][0]) + ' <b>' + pct(x[1]) + '</b></span>').join('') +
        (shown.length < cats.length ? '<span class="faint">+' + (cats.length - shown.length) + ' más</span>' : '') + '</div>' : '');
  }

  /** «48%», o «<1%» si es muy poco pero no cero. */
  function pctText(v, total) {
    const p = Math.round((v / total) * 100);
    return p === 0 && v > 0 ? '<1%' : p + '%';
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
      '<span class="strip__labels">' + groups.map((g) => '<span style="flex:' + g.n + '">' + esc(label(g)) + '</span>').join('') + '</span></button>';
  }

  /** Conversor rápido yen ⇄ moneda principal para el Modo viaje. Recuerda el importe y la dirección. */
  function quickConverter() {
    const st = JT.uiState.conv || (JT.uiState.conv = { dir: 'jpy', value: '' });
    const main = S.get().trip.mainCurrency, other = main === 'JPY' ? 'EUR' : main;
    const from = st.dir === 'jpy' ? 'JPY' : other, to = st.dir === 'jpy' ? other : 'JPY';
    const rates = JT.services.rates(), rate = U.convert(1, from, to, rates);
    if (!rate) return UI.card('<small class="eyebrow muted">CONVERSOR</small><p class="muted small">Sin tipo de cambio: conéctate una vez (se guarda para usarlo sin conexión) o defínelo en Ajustes.</p>', { cls: 'stack-sm' });
    const n = U.parseAmount(st.value || '') || 0;
    const sym = { JPY: '¥', EUR: '€', USD: '$' };
    return UI.card('<div class="row row--between"><small class="eyebrow muted">CONVERSOR</small><small class="faint">1 ' + (from === 'JPY' ? other : from) + ' = ' + esc(U.money(U.convert(1, from === 'JPY' ? other : from, 'JPY', rates), 'JPY')) + '</small></div>' +
      '<div class="conv"><span class="conv__sym" aria-hidden="true">' + (sym[from] || from) + '</span>' +
        '<input class="input input--lg conv__in" inputmode="decimal" placeholder="' + (from === 'JPY' ? '1000' : '10') + '" value="' + esc(st.value || '') + '" data-input="quickConv" data-rate="' + rate + '" data-to="' + to + '" aria-label="Importe en ' + from + '" autocomplete="off">' +
        UI.iconBtn('swap', 'Cambiar ' + from + ' ⇄ ' + to, { act: 'convSwap' }) + '</div>' +
      '<div class="conv__out" id="qconvOut">' + (n ? '≈ ' + esc(U.money(n * rate, to)) : 'Escribe un importe en ' + from) + '</div>', { cls: 'stack-sm' });
  }
  JT.changes = JT.changes || {};
  JT.changes.quickConv = function (el) {
    JT.uiState.conv.value = el.value;
    const n = U.parseAmount(el.value) || 0, out = document.getElementById('qconvOut');
    if (out) out.textContent = n ? '≈ ' + U.money(n * Number(el.dataset.rate), el.dataset.to) : 'Escribe un importe';
  };
  JT.actions.convSwap = function () {
    const st = JT.uiState.conv;
    st.dir = st.dir === 'jpy' ? 'main' : 'jpy';
    st.value = '';
    JT.app.focusAfter = '.conv__in';
    JT.app.render();
  };

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
      ['chat', 'Frases', { act: 'go', to: 'phrases' }, 'Sin conexión']
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

  return { q, sampleBanner, offlineBanner, isNow, timelineItem, travelLeg, timeline, placeCard, restaurantCard, expenseRow, reservationCard, transportCard, noteCard, noteRef, quick, tripHub, speakBtn, TONE, catColor, byCategory, catStack, pctText, cityStrip, quickConverter, cityOptions, moneySum, parseCoords, coordsField, bindCoords };
})();
