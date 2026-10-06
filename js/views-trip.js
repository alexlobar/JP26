/* ============================================================
   views-trip.js — Inicio y Modo viaje, Itinerario, vista del
   día, detalle y formulario de actividad, planificación
   inteligente del día.
   ============================================================ */
(function () {
  'use strict';

  const U = JT.utils, D = JT.data, S = JT.store, L = JT.logic, UI = JT.ui, C = JT.cards, SV = JT.services;
  const esc = U.esc;
  const V = JT.views, F = JT.forms, A = JT.actions;

  /* ══ INICIO ══════════════════════════════════════════════════ */

  function nextUpCard(item, label, from, fromLabel) {
    const a = item.activity, loc = S.resolveLocation(a);
    let until = '';
    if (item.inProgress) until = 'Ahora';
    else if (item.minutesUntil !== undefined) until = item.minutesUntil < 60 ? 'En ' + Math.max(0, item.minutesUntil) + ' min' : 'En ' + U.fmtDur(item.minutesUntil);
    else if (!item.isToday) until = U.fmtDay(item.day.date);
    const est = from && loc.coords ? U.estimateTravel(from, loc.coords, a.transportMode) : null;
    const dirUrl = U.directionsUrl(loc, from, est ? est.mode : a.transportMode);
    return UI.card(
      '<div class="row row--between"><span class="eyebrow">' + (item.inProgress ? 'AHORA' : esc(label)) + '</span>' + (until ? UI.pill(until, item.inProgress ? 'accent' : 'neutral') : '') + '</div>' +
      '<div class="next"><span class="next__emoji" aria-hidden="true">' + D.ACTIVITY[a.category][1] + '</span><div><h2 class="title">' + esc(a.title) + '</h2>' +
      '<p class="muted">' + esc((a.startTime || 'Sin hora') + (a.endTime ? ' – ' + a.endTime : '') + (loc.name && loc.name !== a.title ? ' · ' + loc.name : '')) + '</p></div></div>' +
      (est ? '<p class="muted small">' + D.MODE[est.mode][1] + ' ~' + U.fmtDur(est.minutes) + ' · ' + U.fmtKm(est.routeKm, S.get().settings.units) + (fromLabel ? ' desde ' + esc(fromLabel) : '') + ' (estimado)</p>' : '') +
      '<div class="row row--wrap">' + (dirUrl ? '<a class="btn btn--primary btn--sm" href="' + esc(dirUrl) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Cómo llegar</span></a>' : '') +
        (loc.coords ? UI.btn('Comer cerca', { emoji: '🍜', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'nearby?' + C.q({ lat: loc.coords.lat, lng: loc.coords.lng, label: loc.name || a.title }) } }) : '') +
        // Marcarla como hecha (o saltarla) hace que la siguiente pase a primer plano.
        UI.btn('Hecha', { icon: 'check', size: 'sm', variant: 'ghost', data: { act: 'doneNext', id: a.id } }) + '</div>',
      { tone: item.inProgress ? 'accent' : '', data: { act: 'go', to: 'activity/' + a.id }, cls: 'stack' }
    );
  }

  function alerts(t) {
    const s = S.get(), out = [], n = t.now;
    if (t.phase === 'before') {
      const lists = Object.values(s.checklists).filter((c) => c.section === 'before').map((c) => c.id);
      const pending = Object.values(s.checklistItems).filter((i) => lists.indexOf(i.checklistId) > -1 && !i.done).length;
      if (pending) out.push(UI.banner('warn', 'check', pending + ' tareas pendientes antes del viaje', '', { data: { act: 'go', to: 'checklist' } }));
    }
    const tomorrow = U.addDays(n.date, 1);
    Object.values(s.transports).filter((x) => x.date === tomorrow && x.departTime).forEach((x) =>
      out.push(UI.banner('info', 'clock', 'Mañana: ' + D.TRANSPORT[x.kind][0] + ' a las ' + x.departTime, x.origin + ' → ' + x.destination, { data: { act: 'go', to: 'transport' } })));
    S.reservationsOn(n.date).forEach(function (r) {
      if (!r.time || r.type === 'hotel' || r.date !== n.date) return;
      const diff = U.toMin(r.time) - n.minutes;
      if (diff > 0 && diff <= 180) out.push(UI.banner('accent', 'bell', 'En ' + diff + ' min: ' + r.name, r.confirmationCode ? 'Reserva ' + r.confirmationCode : '', { data: { act: 'go', to: 'reservation/' + r.id } }));
    });
    if (Object.values(s.expenses).some((e) => e.currency !== s.trip.mainCurrency) && !SV.rates())
      out.push(UI.banner('neutral', 'swap', 'Sin tipo de cambio', 'Conéctate o define un tipo manual en Ajustes para sumar gastos en otras monedas.', { data: { act: 'go', to: 'settings' } }));
    const err = S.lastError();
    if (err) out.unshift(UI.banner('accent', 'alert', 'Aviso', err));
    return out.join('');
  }

  V.home = function () {
    const s = S.get(), t = S.today(), n = t.now, travel = S.travelModeActive();
    const head = UI.header({
      large: true, title: (s.trip.name + ' ' + (s.trip.emoji || '')).trim(), subtitle: U.fmtRange(s.trip.startDate, s.trip.endDate),
      actions: UI.iconBtn('search', 'Buscar', { act: 'go', to: 'search' }) + UI.iconBtn('settings', 'Ajustes', { act: 'go', to: 'settings' })
    });
    const seg = '<div class="seg" role="tablist">' +
      '<button type="button" role="tab" class="seg__item' + (!travel ? ' is-on' : '') + '" aria-selected="' + !travel + '" data-act="travelMode" data-value="off">Resumen</button>' +
      '<button type="button" role="tab" class="seg__item' + (travel ? ' is-on' : '') + '" aria-selected="' + travel + '" data-act="travelMode" data-value="on">🧭 Modo viaje</button></div>';
    return { html: head + C.sampleBanner() + seg + (travel ? travelMode(t) : overview(t)) };
  };

  function overview(t) {
    const s = S.get(), n = t.now;
    const up = S.upcoming(n, 6);
    const title = t.phase === 'before' ? (t.daysUntil === 1 ? 'Mañana empieza' : 'Faltan ' + t.daysUntil + ' días') : t.phase === 'after' ? 'Viaje terminado' : 'Hoy — ' + (t.city ? t.city.name : 'Día libre');
    const sub = t.phase === 'during' ? 'Día ' + t.dayNumber + ' de ' + t.totalDays + (t.nextCity ? ' · después: ' + t.nextCity.name : '') : t.phase === 'before' ? 'Primer destino: ' + (t.city ? t.city.name : '—') : 'Revisa tus gastos y exporta tus datos';
    const spent = C.moneySum(Object.values(s.expenses));
    const budget = s.trip.totalBudget;
    const dayList = t.day ? S.dayActivities(t.day.id) : [];
    let html = UI.card('<div class="eyebrow">' + (t.phase === 'during' ? esc(U.fmtDay(n.date).toUpperCase()) : t.phase === 'before' ? 'CUENTA ATRÁS' : 'FIN') + '</div><h2 class="display">' + esc(title) + '</h2><p class="muted">' + esc(sub) + '</p>' +
      (t.phase === 'before' ? '<div>' + UI.btn('Probar el Modo viaje', { icon: 'nav', size: 'sm', variant: 'secondary', data: { act: 'simulate' } }) + '</div>' : ''), { tone: t.phase === 'during' ? 'accent' : '', cls: 'stack' });
    html += alerts(t);
    if (up[0]) html += nextUpCard(up[0], up[0].isToday ? 'SIGUIENTE' : 'PRÓXIMA ACTIVIDAD');
    html += C.quick([
      ['🗓️', '+ Actividad', { act: 'newActivity', day: t.phase === 'during' && t.day ? t.day.id : '' }],
      ['💰', '+ Gasto', { act: 'newExpense' }],
      ['🍜', '+ Restaurante', { act: 'newRestaurant' }],
      ['🗒️', '+ Nota', { act: 'newNote' }]
    ]);
    if (t.day) {
      html += UI.section(t.phase === 'during' ? 'Resumen de hoy' : t.phase === 'before' ? 'Día 1 · ' + (t.city ? t.city.name : '') : 'Último día',
        UI.card(dayList.length ? '<div class="mini-tl">' + dayList.map((a) => '<div class="mini-tl__row' + (a.status === 'done' ? ' is-done' : '') + '"><span class="mono">' + (a.startTime || '··:··') + '</span><span>' + D.ACTIVITY[a.category][1] + ' ' + esc(a.title) + '</span></div>').join('') + '</div>' : '<p class="muted">Sin actividades. Toca para planificar.</p>', { data: { act: 'go', to: 'day/' + t.day.id } }),
        UI.btn('Ver día', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'day/' + t.day.id } }));
    }
    html += UI.section('Gastos', UI.card('<div class="stats">' + UI.stat('Gastado', spent.text, '', true) +
      (budget ? UI.stat('Restante', U.money(budget - spent.total, spent.main), 'de ' + U.money(budget, spent.main)) : UI.stat('Presupuesto', '—', 'Defínelo en Ajustes')) + '</div>' +
      (budget ? UI.progress(spent.total / budget, spent.total > budget ? 'accent' : 'info') : '') + (spent.extra ? '<small class="faint">+ ' + esc(spent.extra) + ' sin convertir</small>' : ''), { data: { act: 'go', to: 'expenses' }, cls: 'stack' }),
      UI.btn('Detalle', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'expenses' } }));
    if (up.length > 1) {
      html += UI.section('Próximos planes', UI.card('<div class="mini-tl">' + up.slice(1).map((u) => '<button type="button" class="mini-tl__row" data-act="go" data-to="activity/' + u.activity.id + '"><span class="mini-tl__when"><small class="muted">' + esc(u.isToday ? 'Hoy' : U.fmtDay(u.day.date).split(' ').slice(0, 2).join(' ')) + '</small><span class="mono">' + (u.activity.startTime || '··:··') + '</span></span><span>' + D.ACTIVITY[u.activity.category][1] + ' ' + esc(u.activity.title) + '</span></button>').join('') + '</div>'),
        UI.btn('Itinerario', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'itinerary' } }));
    }
    return html;
  }

  /* ── Modo viaje: lo que necesitas en 5 segundos en la calle ── */

  function travelMode(t) {
    const s = S.get(), n = t.now, day = t.day, city = t.city;
    const up = S.upcoming(n, 4);
    const gps = JT.uiState.gps;
    const here = gps || S.inferArea(day, n);
    const hereLabel = gps ? 'tu ubicación' : undefined;
    const current = up.find((u) => u.inProgress), next = up.find((u) => !u.inProgress);
    let html = '';
    if (n.simulated) html += UI.banner('warn', 'clock', 'Simulando ' + n.date + ' a las ' + n.time, 'Cámbialo o desactívalo en Ajustes → Modo viaje.', { data: { act: 'go', to: 'settings' } });
    if (current) html += nextUpCard(current, 'AHORA');
    if (next) html += nextUpCard(next, 'SIGUIENTE', here, hereLabel || (current ? 'la actividad actual' : 'tu última parada'));
    else if (!current) html += UI.empty('🍵', 'Nada más por hoy', 'Disfruta. Puedes buscar dónde cenar cerca o planificar mañana.');
    const nearTo = here || (city && city.coords);
    html += C.quick([
      ['💴', 'Gasto', { act: 'newExpense' }],
      ['🍜', 'Comer cerca', nearTo ? { act: 'go', to: 'nearby?' + C.q({ lat: nearTo.lat, lng: nearTo.lng, label: hereLabel || (city && city.name) }) } : { act: 'go', to: 'food' }],
      ['🗺️', 'Mapa hoy', { act: 'go', to: 'map' + (day ? '?day=' + day.id : '') }],
      ['🗣️', 'Frases', { act: 'go', to: 'phrases' }]
    ]);
    html += '<div class="row">' + UI.btn(gps ? 'Ubicación actualizada' : 'Usar mi ubicación', { icon: 'locate', size: 'sm', variant: 'soft', data: { act: 'locate' } }) + '</div>';
    const spentToday = C.moneySum(Object.values(s.expenses).filter((e) => e.date === n.date));
    const spentAll = C.moneySum(Object.values(s.expenses));
    const budget = s.trip.totalBudget;
    html += UI.card('<div class="stats">' + UI.stat('Hoy', spentToday.text, '', true) + UI.stat('Total viaje', spentAll.text, budget ? 'de ' + U.money(budget, spentAll.main) : '') + '</div>' + (budget ? UI.progress(spentAll.total / budget, spentAll.total > budget ? 'accent' : 'info') : ''), { cls: 'stack' });
    const resv = day ? S.reservationsOn(day.date) : [];
    if (resv.length) html += UI.section('Reservas de hoy', resv.map(C.reservationCard).join(''), UI.btn('Todas', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'reservations' } }));
    const near = here ? S.savedNear(here, 1.5).slice(0, 3) : [];
    html += UI.section(hereLabel ? 'Comer cerca de ti' : 'Comer cerca',
      near.length ? near.map((x) => C.restaurantCard(x.restaurant, x.km)).join('') : '<p class="muted small">Ningún restaurante guardado a menos de 1,5 km. Pulsa «Buscar más» para ver opciones cercanas (requiere conexión).</p>',
      nearTo ? UI.btn('Buscar más', { size: 'sm', variant: 'ghost', icon: 'search', data: { act: 'go', to: 'nearby?' + C.q({ lat: nearTo.lat, lng: nearTo.lng, label: hereLabel || (city && city.name) }) } }) : '');
    const later = day ? S.dayActivities(day.id).filter((a) => a.status !== 'done' && a !== (current && current.activity) && a !== (next && next.activity) && (!a.startTime || U.toMin(a.startTime) >= n.minutes)) : [];
    if (later.length) html += UI.section('Más tarde hoy', UI.card('<div class="mini-tl">' + later.map((a) => '<button type="button" class="mini-tl__row" data-act="go" data-to="activity/' + a.id + '"><span class="mono">' + (a.startTime || '··:··') + '</span><span>' + D.ACTIVITY[a.category][1] + ' ' + esc(a.title) + '</span></button>').join('') + '</div>'),
      UI.btn('Día completo', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'day/' + day.id } }));
    const notes = Object.values(s.notes).filter((x) => (city && x.scope === 'city' && x.refId === city.id) || (day && x.scope === 'day' && x.refId === day.id)).sort((a, b) => b.pinned - a.pinned).slice(0, 3);
    if (notes.length) html += UI.section('Notas · ' + (city ? city.name : 'hoy'), notes.map((x) => C.noteCard(x)).join(''), UI.btn('Todas', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'notes' } }));
    return html;
  }

  A.travelMode = function (el) {
    const on = el.dataset.value === 'on', phase = S.today().phase;
    S.setSettings({ travelMode: on ? 'on' : phase === 'during' ? 'off' : 'auto' });
  };

  A.simulate = function () {
    // El ejemplo trae un día de demostración (Fushimi Inari); en un viaje propio, el primer día con plan.
    const t = S.get().trip;
    const withPlan = S.sortedDays().find((d) => S.dayActivities(d.id).length);
    const date = (t.demoDate && t.isSample && t.demoDate) || (withPlan ? withPlan.date : t.startDate);
    S.setSettings({ simulatedDate: date, simulatedTime: '11:45', travelMode: 'auto' });
    UI.toast('Simulando el ' + U.fmtDay(date) + ' a las 11:45 (desactívalo en Ajustes)');
  };

  A.locate = async function () {
    UI.toast('Buscando tu ubicación…');
    try {
      JT.uiState.gps = await SV.locate();
      JT.app.render();
    } catch (e) { UI.toast(e.message); }
  };

  /* ══ ITINERARIO ══════════════════════════════════════════════ */

  function dayCard(d, num, isToday) {
    const list = S.dayActivities(d.id), done = list.filter((a) => a.status === 'done').length;
    return '<div class="card card--tap daycard' + (isToday ? ' card--accent' : '') + '" tabindex="0" data-act="go" data-to="day/' + d.id + '">' +
      '<div class="daycard__top"><span class="daynum' + (isToday ? ' is-today' : '') + '"><small>DÍA</small><strong>' + num + '</strong></span>' +
      '<div class="grow"><strong>' + esc(U.fmtDay(d.date)) + '</strong> ' + (isToday ? UI.pill('Hoy', 'accent') : '') + (d.title ? '<small class="muted block">' + esc(d.title) + '</small>' : '') + '</div>' +
      '<small class="faint">' + (list.length ? done + '/' + list.length : '') + '</small></div>' +
      (list.length ? '<div class="daycard__preview">' + list.slice(0, 4).map((a) => '<small class="' + (a.status === 'done' ? 'faint' : 'muted') + '"><b class="mono">' + (a.startTime || '··:··') + '</b>  ' + D.ACTIVITY[a.category][1] + ' ' + esc(a.title) + '</small>').join('') +
        (list.length > 4 ? '<small class="faint">+' + (list.length - 4) + ' más</small>' : '') + '</div>' : '<small class="faint daycard__preview">Sin actividades todavía</small>') + '</div>';
  }

  V.itinerary = function () {
    const s = S.get(), days = S.sortedDays(), t = S.today();
    const num = {};
    days.forEach((d, i) => (num[d.id] = i + 1));
    const todayId = t.phase === 'during' && t.day ? t.day.id : null;
    let html = UI.header({ title: 'Itinerario', subtitle: U.fmtRange(s.trip.startDate, s.trip.endDate) + ' · ' + days.length + ' días',
      actions: UI.iconBtn('search', 'Buscar', { act: 'go', to: 'search' }) + UI.iconBtn('sparkle', 'Planificar día', { act: 'go', to: 'planner' }) }) + C.sampleBanner();
    S.cityStays().forEach(function (st) {
      const c = s.cities[st.cityId];
      html += UI.section((c ? c.name : 'Ciudad') + ' · ' + U.fmtRange(st.start, st.end), st.dayIds.map((id) => dayCard(s.days[id], num[id], id === todayId)).join(''), '<small class="faint">' + st.nights + (st.nights === 1 ? ' noche' : ' noches') + '</small>');
    });
    const loose = days.filter((d) => !d.cityId);
    if (loose.length) html += UI.section('Días sin ciudad', loose.map((d) => dayCard(d, num[d.id], d.id === todayId)).join(''), UI.btn('Asignar', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'cities' } }));
    html += '<div class="row row--center">' + UI.btn('Ciudades', { icon: 'map', variant: 'secondary', data: { act: 'go', to: 'cities' } }) + UI.btn('Transporte', { emoji: '🚄', variant: 'secondary', data: { act: 'go', to: 'transport' } }) + '</div>';
    return { html: html };
  };

  /* ══ VISTA DEL DÍA ═══════════════════════════════════════════ */

  V.day = function (p) {
    const s = S.get(), day = s.days[p.id];
    if (!day) return { html: UI.header({ title: 'Día no encontrado', back: true }) + UI.empty('🗓️', 'Este día ya no existe') };
    const num = S.dayNumber(day.id), city = day.cityId && s.cities[day.cityId], n = S.now();
    const list = S.dayActivities(day.id), locs = list.map(S.resolveLocation);
    const spent = C.moneySum(Object.values(s.expenses).filter((e) => e.date === day.date));
    const est = C.moneySum(list.filter((a) => a.estimatedCost).map((a) => ({ amount: a.estimatedCost, currency: a.costCurrency || 'JPY' })));
    const resv = S.reservationsOn(day.date);
    const notes = Object.values(s.notes).filter((x) => (x.scope === 'day' && x.refId === day.id) || (city && x.scope === 'city' && x.refId === city.id));
    // Restaurantes guardados a menos de 1 km de alguna actividad del día (offline).
    const near = {};
    locs.forEach((l) => { if (l.coords) S.savedNear(l.coords, 1).forEach((x) => { if (!near[x.restaurant.id] || near[x.restaurant.id].km > x.km) near[x.restaurant.id] = x; }); });
    const used = new Set(list.map((a) => a.restaurantId));
    const nearList = Object.values(near).filter((x) => !used.has(x.restaurant.id)).sort((a, b) => a.km - b.km).slice(0, 4);
    const firstLoc = locs.find((l) => l.coords);

    let html = UI.header({ back: true, eyebrow: 'DÍA ' + num + (city ? ' · ' + city.name.toUpperCase() : '') + (n.date === day.date ? ' · HOY' : ''), title: U.fmtLong(day.date), subtitle: day.title,
      actions: UI.iconBtn('share', 'Compartir día', { act: 'shareDay', id: day.id }) + UI.iconBtn('map', 'Ver en el mapa', { act: 'go', to: 'map?day=' + day.id }) + UI.iconBtn('edit', 'Editar día', { act: 'editDay', id: day.id }) });
    html += UI.card('<div class="stats">' + UI.stat('Actividades', list.filter((a) => a.status === 'done').length + '/' + list.length) + UI.stat('Gastado', spent.text) + UI.stat('Estimado', est.total ? est.text : '—') + '</div>');
    html += '<div class="row row--wrap">' + UI.btn('Actividad', { icon: 'plus', size: 'sm', data: { act: 'newActivity', day: day.id } }) +
      UI.btn('Planificar', { icon: 'sparkle', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'planner?day=' + day.id } }) +
      UI.btn('Ordenar por hora', { icon: 'swap', size: 'sm', variant: 'secondary', data: { act: 'sortDay', id: day.id } }) + '</div>';
    if (resv.length) html += UI.section('Reservas del día', resv.map(C.reservationCard).join(''));
    html += UI.section('Timeline', list.length
      ? '<div class="timeline">' + C.timeline(day.id) + '</div><p class="faint small tl-hint">Mantén pulsada una actividad para más opciones (mover, duplicar, reordenar…). Tiempos de desplazamiento estimados.</p>'
      : UI.empty('🗓️', 'Día libre', 'Añade actividades o usa la planificación inteligente para ordenar varios sitios.', UI.btn('Añadir actividad', { data: { act: 'newActivity', day: day.id } })));
    html += UI.section('Comer cerca', nearList.length ? nearList.map((x) => C.restaurantCard(x.restaurant, x.km)).join('') : '<p class="muted small">No hay restaurantes guardados a menos de 1 km de las actividades del día.</p>',
      firstLoc ? UI.btn('Buscar', { size: 'sm', variant: 'ghost', icon: 'search', data: { act: 'go', to: 'nearby?' + C.q({ lat: firstLoc.coords.lat, lng: firstLoc.coords.lng, label: city && city.name }) } }) : '');
    html += UI.section('Notas', notes.length ? notes.map((x) => C.noteCard(x)).join('') : '<p class="muted small">Sin notas para este día.</p>', UI.btn('Nota', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newNote', scope: 'day', ref: day.id } }));
    return { html: html };
  };

  A.toggleDone = (el) => S.toggleDone(el.dataset.id);
  A.doneNext = (el) => { S.toggleDone(el.dataset.id); UI.toast('Hecha. Se deshace tocando su círculo en el día'); };
  A.sortDay = (el) => { S.sortDayByTime(el.dataset.id); UI.toast('Ordenado por hora'); };
  A.shareDay = async (el) => { const r = await SV.share(L.shareDay(el.dataset.id), 'Día'); if (r === 'copied') UI.toast('Copiado al portapapeles'); };

  A.editDay = function (el) {
    const s = S.get(), day = s.days[el.dataset.id];
    const close = UI.sheet({
      title: 'Editar día',
      body: '<form id="fDay" class="stack">' + UI.field('Título del día', UI.input('title', day.title || '', { placeholder: 'p.ej. Excursión a Nara' }), { optional: true }) +
        UI.field('Ciudad', UI.chips('cityId', C.cityOptions(), day.cityId, { allowNone: true, noneLabel: 'Sin ciudad' })) +
        UI.btn('Nueva ciudad', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newCity' } }) + '</form>',
      footer: UI.btn('Guardar', { type: 'submit', form: 'fDay', block: true }),
      onMount: (root) => root.querySelector('#fDay').addEventListener('submit', function (ev) {
        ev.preventDefault();
        const f = UI.formData(ev.target);
        S.update('days', day.id, { title: f.title || undefined, cityId: f.cityId || undefined });
        close();
      })
    });
  };

  /* ══ DETALLE DE ACTIVIDAD ═══════════════════════════════════ */

  V.activity = function (p) {
    const s = S.get(), a = s.activities[p.id];
    if (!a) return { html: UI.header({ title: 'Actividad no encontrada', back: true }) + UI.empty('🗓️', 'Esta actividad ya no existe') };
    const day = s.days[a.dayId], loc = S.resolveLocation(a), cat = D.ACTIVITY[a.category];
    const r = a.reservationId && s.reservations[a.reservationId];
    const place = a.placeId && s.places[a.placeId], rest = a.restaurantId && s.restaurants[a.restaurantId];
    const list = S.dayActivities(a.dayId), next = list[list.findIndex((x) => x.id === a.id) + 1];
    const nextLoc = next && S.resolveLocation(next);
    const leg = loc.coords && nextLoc && nextLoc.coords ? U.estimateTravel(loc.coords, nextLoc.coords, next.transportMode) : null;
    const done = a.status === 'done';
    const hours = (place && place.hours) || (rest && rest.hours);
    const dir = U.directionsUrl(loc, null, a.transportMode);

    let html = UI.header({ back: true, eyebrow: 'DÍA ' + S.dayNumber(a.dayId) + ' · ' + (day ? U.fmtDay(day.date).toUpperCase() : ''), title: a.title,
      subtitle: cat[1] + ' ' + cat[0] + (a.startTime ? ' · ' + a.startTime + (a.endTime ? '–' + a.endTime : '') : ''),
      actions: UI.iconBtn('edit', 'Editar', { act: 'editActivity', id: a.id }) + UI.iconBtn('more', 'Más opciones', { act: 'activityMenu', id: a.id }) });
    html += '<div class="row row--wrap">' + UI.btn(done ? 'Hecha' : 'Marcar hecha', { icon: 'check', size: 'sm', variant: done ? 'soft' : 'primary', data: { act: 'toggleDone', id: a.id } }) +
      (dir ? '<a class="btn btn--secondary btn--sm" href="' + esc(dir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Cómo llegar</span></a>' : '') +
      (loc.coords ? UI.btn('Restaurantes cerca', { emoji: '🍜', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'nearby?' + C.q({ lat: loc.coords.lat, lng: loc.coords.lng, label: loc.name || a.title }) } }) : '') +
      UI.btn('Gasto', { icon: 'plus', size: 'sm', variant: 'secondary', data: { act: 'newExpense', date: day && day.date, city: day && day.cityId, place: loc.name || a.title, activity: a.id } }) + '</div>';
    html += UI.card((loc.name ? UI.listRow({ icon: 'pin', title: loc.name, sub: loc.address || (loc.coords ? loc.coords.lat.toFixed(4) + ', ' + loc.coords.lng.toFixed(4) : 'Sin coordenadas'), data: place ? { act: 'go', to: 'place/' + place.id } : rest ? { act: 'go', to: 'restaurant/' + rest.id } : null }) : '<p class="muted">Sin ubicación</p>') +
      '<div class="pills">' + UI.pill('Prioridad ' + D.PRIORITY[a.priority][0].toLowerCase(), a.priority === 'high' ? 'accent' : 'neutral') + (a.estimatedCost ? UI.pill('≈ ' + U.money(a.estimatedCost, a.costCurrency || 'JPY')) : '') +
      (a.transportMode && D.MODE[a.transportMode] ? UI.pill(D.MODE[a.transportMode][1] + ' ' + D.MODE[a.transportMode][0]) : '') + UI.openBadge(hours) + '</div>' + (hours ? '<small class="faint">Horario: ' + esc(hours) + '</small>' : ''), { cls: 'stack' });
    if (next) html += UI.card('<small class="eyebrow muted">DESPUÉS</small><strong>' + esc((next.startTime ? next.startTime + ' · ' : '') + next.title) + '</strong>' + (leg ? '<small class="muted">' + D.MODE[leg.mode][1] + ' ~' + U.fmtDur(leg.minutes) + ' · ' + U.fmtKm(leg.routeKm, s.settings.units) + ' (estimado)</small>' : ''), { tone: 'muted', data: { act: 'go', to: 'activity/' + next.id }, cls: 'stack-sm' });
    if (r) html += UI.section('Reserva', C.reservationCard(r));
    if (a.description) html += UI.section('Descripción', '<p class="pre">' + esc(a.description) + '</p>');
    if (a.notes) html += UI.section('Notas', UI.card('<p class="pre">' + esc(a.notes) + '</p>', { tone: 'warn' }));
    if (a.url) html += UI.btn('Abrir enlace', { icon: 'link', variant: 'ghost', data: { act: 'openUrl', url: a.url } });
    const ex = Object.values(s.expenses).filter((e) => e.activityId === a.id);
    if (ex.length) html += UI.section('Gastos', ex.map((e) => C.expenseRow(e)).join(''));
    return { html: html };
  };

  A.openUrl = (el) => SV.openUrl(el.dataset.url);

  /** Menú contextual (pulsación larga en la timeline o «···»). */
  A.activityMenu = function (el) {
    const a = S.get().activities[el.dataset.id];
    if (!a) return;
    const loc = S.resolveLocation(a), done = a.status === 'done';
    const items = [
      { icon: 'check', label: done ? 'Marcar como pendiente' : 'Marcar como hecha', run: () => S.toggleDone(a.id) },
      { icon: 'edit', label: 'Editar', run: () => F.activity(a.id) },
      { icon: 'copy', label: 'Duplicar', run: () => { S.duplicateActivity(a.id); UI.toast('Actividad duplicada'); } },
      { icon: 'calendar', label: 'Mover a otro día', run: () => moveToDay(a) },
      // Con hora, el orden lo marca la hora (al cambiarla se recoloca sola); subir/bajar es para las que no tienen.
      { icon: 'up', label: 'Subir', hint: a.startTime ? 'Tiene hora: mejor cámbiala en Editar y se recoloca sola' : '', run: () => S.shiftActivity(a.id, -1) },
      { icon: 'down', label: 'Bajar', hint: a.startTime ? 'Tiene hora: mejor cámbiala en Editar y se recoloca sola' : '', run: () => S.shiftActivity(a.id, 1) }
    ];
    if (loc.coords) items.push({ emoji: '🍜', label: 'Restaurantes cerca', run: () => JT.go('nearby?' + C.q({ lat: loc.coords.lat, lng: loc.coords.lng, label: loc.name || a.title })) });
    const dir = U.directionsUrl(loc, null, a.transportMode);
    if (dir) items.push({ icon: 'nav', label: 'Cómo llegar', run: () => SV.openUrl(dir) });
    items.push({ icon: 'trash', label: 'Eliminar', destructive: true, run: async () => { if (await UI.confirm('¿Eliminar actividad?', a.title)) { S.remove('activities', a.id); UI.toast('Actividad eliminada'); if (location.hash.indexOf(a.id) > -1) history.back(); } } });
    UI.menu(a.title, items);
  };

  function moveToDay(a) {
    const days = S.sortedDays(), s = S.get();
    UI.menu('Mover a…', days.map((d, i) => ({ label: 'Día ' + (i + 1) + ' · ' + U.fmtDay(d.date) + (d.cityId && s.cities[d.cityId] ? ' · ' + s.cities[d.cityId].name : ''), icon: d.id === a.dayId ? 'check' : 'calendar', run: () => { S.updateActivity(a.id, { dayId: d.id }); UI.toast('Actividad movida'); } })));
  }

  /* ══ FORMULARIO DE ACTIVIDAD ════════════════════════════════
     Lo mínimo arriba (título, día, hora, categoría, ubicación); el resto plegado. */

  function locationOptions(selected, cityId) {
    const s = S.get();
    const cityName = (id) => (id && s.cities[id] ? s.cities[id].name : 'Sin ciudad');
    const sortFn = (a, b) => (a.cityId === cityId ? 0 : 1) - (b.cityId === cityId ? 0 : 1) || cityName(a.cityId).localeCompare(cityName(b.cityId)) || a.name.localeCompare(b.name);
    const opt = (v, label) => '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
    return opt('', 'Sin ubicación') + opt('free', 'Otra ubicación (escribir)…') +
      '<optgroup label="Lugares guardados">' + Object.values(s.places).sort(sortFn).map((p) => opt('p:' + p.id, D.PLACE[p.category][1] + ' ' + p.name + ' · ' + cityName(p.cityId))).join('') + '</optgroup>' +
      '<optgroup label="Restaurantes guardados">' + Object.values(s.restaurants).sort(sortFn).map((r) => opt('r:' + r.id, D.CUISINE[r.cuisine][1] + ' ' + r.name + ' · ' + cityName(r.cityId))).join('') + '</optgroup>';
  }

  F.activity = function (id, defaults) {
    const s = S.get(), ex = id ? s.activities[id] : null, def = defaults || {};
    const days = S.sortedDays();
    const t = S.today();
    const dayId = ex ? ex.dayId : def.dayId || (t.phase === 'during' && t.day ? t.day.id : days[0] && days[0].id);
    const day = s.days[dayId];
    const a = ex || { title: def.title || '', category: def.category || 'visit', priority: 'medium', placeId: def.placeId, restaurantId: def.restaurantId, startTime: def.time };
    const selLoc = a.placeId ? 'p:' + a.placeId : a.restaurantId ? 'r:' + a.restaurantId : a.location ? 'free' : '';
    const fl = a.location || {};
    const resv = Object.values(s.reservations);
    const body = '<form id="fAct" class="stack" novalidate>' +
      UI.field('Título', UI.input('title', a.title, { placeholder: 'p.ej. Fushimi Inari', autofocus: !ex && !def.title, required: true })) +
      UI.field('Día', '<select class="input" name="dayId">' + days.map((d, i) => '<option value="' + d.id + '"' + (d.id === dayId ? ' selected' : '') + '>Día ' + (i + 1) + ' · ' + esc(U.fmtDay(d.date)) + (d.cityId && s.cities[d.cityId] ? ' · ' + esc(s.cities[d.cityId].name) : '') + '</option>').join('') + '</select>') +
      '<div class="row row--top">' + UI.field('Inicio', UI.input('startTime', a.startTime || '', { type: 'time' }), { optional: true }) + UI.field('Fin', UI.input('endTime', a.endTime || '', { type: 'time' }), { optional: true }) + '</div>' +
      UI.field('Categoría', UI.chips('category', D.options(D.ACTIVITY), a.category)) +
      UI.field('Ubicación', '<select class="input" name="loc">' + locationOptions(selLoc, day && day.cityId) + '</select>', { optional: true }) +
      '<div class="stack free-loc"' + (selLoc === 'free' ? '' : ' hidden') + '>' + UI.field('Nombre del sitio', UI.input('locName', fl.name || '', { placeholder: 'p.ej. Estación de Kyoto' })) + UI.field('Dirección', UI.input('address', fl.address || ''), { optional: true }) + C.coordsField(fl.coords) + '</div>' +
      UI.details('Más detalles',
        UI.field('Cómo llegar desde la actividad anterior', UI.chips('transportMode', D.options(D.MODE), a.transportMode, { allowNone: true, noneLabel: 'Auto' }), { optional: true }) +
        UI.field('Prioridad', UI.chips('priority', D.options(D.PRIORITY), a.priority)) +
        '<div class="row row--top">' + UI.field('Coste estimado', UI.input('cost', a.estimatedCost || '', { inputmode: 'decimal', placeholder: '0' }), { optional: true }) + UI.field('Moneda', UI.chips('costCurrency', D.CURRENCIES.map((c) => ({ value: c, label: c })), a.costCurrency || 'JPY')) + '</div>' +
        (resv.length ? UI.field('Reserva vinculada', '<select class="input" name="reservationId"><option value="">Ninguna</option>' + resv.sort((x, y) => x.date.localeCompare(y.date)).map((r) => '<option value="' + r.id + '"' + (r.id === a.reservationId ? ' selected' : '') + '>' + esc(U.fmtShort(r.date) + ' · ' + r.name) + '</option>').join('') + '</select>', { optional: true }) : '') +
        UI.field('Descripción', UI.textarea('description', a.description), { optional: true }) +
        UI.field('Notas', UI.textarea('notes', a.notes), { optional: true }) +
        UI.field('URL', UI.input('url', a.url || '', { type: 'url', placeholder: 'https://' }), { optional: true }),
        !!(ex && (ex.description || ex.notes || ex.estimatedCost || ex.url))) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar actividad' : 'Nueva actividad', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fAct', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fAct');
        const sel = form.querySelector('[name="loc"]'), free = form.querySelector('.free-loc');
        sel.addEventListener('change', function () {
          free.hidden = sel.value !== 'free';
          const title = form.querySelector('[name="title"]');
          if (!title.value && sel.value) title.value = sel.options[sel.selectedIndex].text.replace(/^\S+\s/, '').split(' · ')[0];
          if (sel.value.indexOf('r:') === 0) { const c = form.querySelector('[name="category"][value="restaurant"]'); if (form.querySelector('[name="category"][value="visit"]').checked) c.checked = true; }
        });
        C.bindCoords(form, () => [form.querySelector('[name="locName"]').value, form.querySelector('[name="address"]').value].filter(Boolean).join(', '));
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async function () { if (await UI.confirm('¿Eliminar actividad?', ex.title)) { S.remove('activities', ex.id); close(); UI.toast('Eliminada'); if (location.hash.indexOf(ex.id) > -1) history.back(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          const cost = f.cost ? U.parseAmount(f.cost) : null;
          const problem = !f.title ? 'Escribe un título' : f.startTime && f.endTime && U.toMin(f.endTime) <= U.toMin(f.startTime) ? 'La hora de fin debe ser posterior al inicio' : f.cost && cost === null ? 'Coste no válido' : f.loc === 'free' && f.coords && !C.parseCoords(f.coords) ? 'Coordenadas no válidas (formato: lat, lng)' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const data = {
            title: f.title, dayId: f.dayId, startTime: f.startTime || undefined, endTime: f.endTime || undefined, category: f.category,
            placeId: f.loc.indexOf('p:') === 0 ? f.loc.slice(2) : undefined, restaurantId: f.loc.indexOf('r:') === 0 ? f.loc.slice(2) : undefined,
            location: f.loc === 'free' && (f.locName || f.address) ? { name: f.locName || undefined, address: f.address || undefined, coords: C.parseCoords(f.coords) } : undefined,
            transportMode: f.transportMode || undefined, priority: f.priority || 'medium', estimatedCost: cost || undefined, costCurrency: cost ? f.costCurrency : undefined,
            reservationId: f.reservationId || undefined, description: f.description || undefined, notes: f.notes || undefined, url: f.url || undefined
          };
          if (ex) { S.updateActivity(ex.id, data); UI.toast('Actividad guardada'); }
          else { S.addActivity(data); UI.toast('Actividad creada'); }
          close();
        });
      }
    });
  };

  A.newActivity = (el) => F.activity(null, { dayId: el.dataset.day || undefined, placeId: el.dataset.place, restaurantId: el.dataset.restaurant, title: el.dataset.title, category: el.dataset.category });
  A.editActivity = (el) => F.activity(el.dataset.id);

  /* ══ PLANIFICACIÓN INTELIGENTE ═══════════════════════════════
     Eliges 2-8 sitios y la app propone el orden, con huecos para comer
     cerca de donde estés y tiempos de desplazamiento estimados. */

  const DINNER_ONLY = ['kaiseki', 'izakaya', 'yakiniku', 'yakitori'];

  V.planner = function (p, q) {
    const s = S.get(), st = JT.uiState.planner, days = S.sortedDays(), t = S.today();
    if (q.day && st.dayId !== q.day) { st.dayId = q.day; st.selected = []; st.result = null; }
    if (!st.dayId || !s.days[st.dayId]) st.dayId = t.phase === 'during' && t.day ? t.day.id : days[0] && days[0].id;
    st.selected = (st.selected || []).filter((id) => s.places[id]);
    if (st.start === undefined) st.start = '09:00';
    if (st.lunch === undefined) st.lunch = true;
    const day = s.days[st.dayId];
    const hotel = day && S.reservationsOn(day.date).find((r) => r.type === 'hotel' && r.location && r.location.coords);
    if (!st.from) st.from = hotel ? 'hotel' : 'first';
    const inDay = new Set(day ? S.dayActivities(day.id).map((a) => a.placeId).filter(Boolean) : []);
    const cands = Object.values(s.places).filter((x) => st.allCities || !day || !day.cityId || x.cityId === day.cityId)
      .sort((a, b) => (a.status === 'visited') - (b.status === 'visited') || b.favorite - a.favorite || (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1) || a.name.localeCompare(b.name));

    let html = UI.header({ back: true, eyebrow: 'PLANIFICACIÓN INTELIGENTE', title: 'Planificar día', subtitle: 'Elige 4-6 sitios y te propongo el mejor orden' });
    html += UI.field('Día', '<select class="input" data-change="plannerDay">' + days.map((d, i) => '<option value="' + d.id + '"' + (d.id === st.dayId ? ' selected' : '') + '>Día ' + (i + 1) + ' · ' + esc(U.fmtDay(d.date)) + (d.cityId && s.cities[d.cityId] ? ' · ' + esc(s.cities[d.cityId].name) : '') + '</option>').join('') + '</select>');
    html += UI.section('1 · Sitios (' + st.selected.length + '/8)', cands.length
      ? '<div class="card card--flush">' + cands.map((x) => {
        const on = st.selected.indexOf(x.id) > -1;
        return '<button type="button" class="pick' + (on ? ' is-on' : '') + '" role="checkbox" aria-checked="' + on + '" data-act="plannerToggle" data-id="' + x.id + '">' +
          '<span class="pick__box">' + (on ? U.icon('check', 14) : '') + '</span><span aria-hidden="true">' + D.PLACE[x.category][1] + '</span>' +
          '<span class="grow"><span class="block">' + esc(x.name) + '</span><small class="muted">' + esc([U.fmtDur(x.visitMinutes || D.VISIT_MIN[x.category]), x.hours, x.coords ? '' : 'sin coordenadas', x.status === 'visited' ? 'visitado' : '', inDay.has(x.id) ? 'ya está en este día' : ''].filter(Boolean).join(' · ')) + '</small></span></button>';
      }).join('') + '</div>'
      : UI.empty('📍', 'Sin lugares en esta ciudad', 'Guarda lugares primero.', UI.btn('Añadir lugar', { data: { act: 'newPlace', city: day && day.cityId } })),
      UI.btn(st.allCities ? 'Todas las ciudades' : 'Ciudad del día', { size: 'sm', variant: 'ghost', data: { act: 'plannerCities' } }));
    html += UI.section('2 · Preferencias', UI.card(
      UI.field('Empezar a las', '<input class="input" type="time" value="' + esc(st.start) + '" data-change="plannerStart">') +
      UI.field('Salida desde', UI.filterChips([].concat(hotel ? [{ value: 'hotel', label: '🏨 ' + hotel.name.replace(/ \(ficticio\)/, '') }] : [], [{ value: 'gps', label: '📍 Mi ubicación' }, { value: 'first', label: 'Primera parada' }]), st.from, 'plannerFrom', { scroll: false })) +
      '<div class="chips">' + [['lunch', '🍜 Hueco para comer (12-14 h)'], ['dinner', '🏮 Cena (19-21 h)']].concat(hotel ? [['back', '↩️ Volver al hotel']] : []).map((o) => '<button type="button" class="chip chip--btn' + (st[o[0]] ? ' is-on' : '') + '" aria-pressed="' + !!st[o[0]] + '" data-act="plannerFlag" data-value="' + o[0] + '"><span>' + o[1] + '</span></button>').join('') + '</div>', { cls: 'stack' }));
    html += UI.btn(st.result ? 'Recalcular' : 'Planificar', { icon: 'sparkle', size: 'lg', block: true, disabled: st.selected.length < 2, data: { act: 'plannerRun' } });
    if (st.selected.length < 2) html += '<p class="faint small center">Elige al menos 2 sitios.</p>';
    if (st.result) html += plannerResult(st.result);
    return { html: html };
  };

  function plannerResult(r) {
    const s = S.get();
    const rows = r.items.map(function (it) {
      if (it.kind === 'travel') return '<div class="plan__leg muted small">' + D.MODE[it.mode][1] + ' ~' + U.fmtDur(it.end - it.start) + ' · ' + U.fmtKm(it.km, s.settings.units) + '</div>';
      if (it.kind === 'visit') {
        const pl = s.places[it.stop.id];
        return '<div class="plan__row"><span class="mono">' + U.toTime(it.start) + '</span><span class="plan__bar"></span><div><strong>' + (pl ? D.PLACE[pl.category][1] + ' ' : '') + esc(it.stop.name) + '</strong><small class="muted block">hasta ' + U.toTime(it.end) + (it.wait > 0 ? ' · espera ' + U.fmtDur(it.wait) + ' hasta la apertura' : '') + '</small>' + (it.warning ? '<small class="warn block">⚠️ ' + esc(it.warning) + '</small>' : '') + '</div></div>';
      }
      const rr = it.suggestion && s.restaurants[it.suggestion.id];
      return '<div class="plan__row"><span class="mono">' + U.toTime(it.start) + '</span><span class="plan__bar plan__bar--meal"></span><div><strong>' + (it.meal === 'lunch' ? '🍜 Almuerzo' : '🏮 Cena') + (it.suggestion ? ' · ' + esc(it.suggestion.name) : '') + '</strong><small class="muted block">' + (it.suggestion ? esc((rr ? D.CUISINE[rr.cuisine][0] : '') + ' · a ' + U.fmtKm(it.suggestion.km, s.settings.units)) : 'Ningún restaurante guardado cerca: busca al llegar') + '</small></div></div>';
    }).join('');
    return UI.section('3 · Propuesta',
      UI.card('<div class="pills">' + UI.pill('Fin ≈ ' + U.toTime(r.end), 'info') + UI.pill('🚶 ' + U.fmtDur(r.travel) + ' de desplazamientos') + (r.wait > 0 ? UI.pill('⏳ ' + U.fmtDur(r.wait) + ' de espera', 'warn') : '') + '</div>', { tone: 'muted' }) +
      r.warnings.map((w) => UI.banner('warn', 'alert', w)).join('') +
      UI.card('<div class="plan">' + rows + '</div>') +
      '<p class="faint small">Tiempos estimados (línea recta × 1,3; a pie ≤1,3 km, si no tren o metro). Horarios según lo guardado en cada lugar. Comprueba los reales con «Cómo llegar».</p>' +
      UI.btn('Añadir al itinerario', { icon: 'calendar', size: 'lg', block: true, data: { act: 'plannerApply' } }));
  }

  A.plannerToggle = function (el) {
    const st = JT.uiState.planner, id = el.dataset.id, i = st.selected.indexOf(id);
    if (i > -1) st.selected.splice(i, 1); else if (st.selected.length < 8) st.selected.push(id); else UI.toast('Máximo 8 sitios');
    st.result = null;
    JT.app.render();
  };
  A.plannerCities = () => { const st = JT.uiState.planner; st.allCities = !st.allCities; JT.app.render(); };
  A.plannerFrom = (el) => { JT.uiState.planner.from = el.dataset.value; JT.uiState.planner.result = null; JT.app.render(); };
  A.plannerFlag = (el) => { const st = JT.uiState.planner; st[el.dataset.value] = !st[el.dataset.value]; st.result = null; JT.app.render(); };
  JT.changes = JT.changes || {};
  JT.changes.plannerDay = (el) => { const st = JT.uiState.planner; st.dayId = el.value; st.selected = []; st.result = null; JT.app.render(); };
  JT.changes.plannerStart = (el) => { if (U.isTime(el.value)) { JT.uiState.planner.start = el.value; JT.uiState.planner.result = null; JT.app.render(); } };

  A.plannerRun = async function () {
    const s = S.get(), st = JT.uiState.planner, day = s.days[st.dayId];
    if (!day) return;
    let start;
    const hotel = S.reservationsOn(day.date).find((r) => r.type === 'hotel' && r.location && r.location.coords);
    if (st.from === 'hotel' && hotel) start = { name: hotel.name, coords: hotel.location.coords };
    if (st.from === 'gps') {
      try { const g = JT.uiState.gps || await SV.locate(); JT.uiState.gps = g; start = { name: 'Tu ubicación', coords: g }; } catch (e) { UI.toast('Sin ubicación: se empieza por la primera parada'); }
    }
    const restaurants = Object.values(s.restaurants).filter((r) => r.coords && r.cuisine !== 'dessert').map((r) => ({
      id: r.id, name: r.name, coords: r.coords,
      preference: (r.status === 'want' ? 2 : r.status === 'tried' && (r.rating || 0) >= 4 ? 1 : 0) + (r.favorite ? 1 : 0),
      suitableFor: DINNER_ONLY.indexOf(r.cuisine) > -1 ? ['dinner'] : r.cuisine === 'cafe' ? ['lunch'] : ['lunch', 'dinner']
    }));
    st.result = L.planDay({
      stops: st.selected.map((id) => { const x = s.places[id]; return { id: id, name: x.name, coords: x.coords, duration: x.visitMinutes || D.VISIT_MIN[x.category], hours: x.hours }; }),
      start: start, returnToStart: !!st.back && !!start, weekday: U.weekday(day.date), startMinutes: U.toMin(st.start),
      lunch: { enabled: !!st.lunch, from: 720, to: 840, duration: 60 }, dinner: { enabled: !!st.dinner, from: 1140, to: 1260, duration: 90 }, restaurants: restaurants
    });
    JT.app.render();
  };

  A.plannerApply = async function () {
    const s = S.get(), st = JT.uiState.planner, day = s.days[st.dayId], r = st.result;
    if (!r || !day) return;
    const existing = S.dayActivities(day.id).length;
    const adds = r.items.filter((i) => i.kind !== 'travel');
    if (existing && !(await UI.confirm('¿Añadir al día?', 'Se añadirán ' + adds.length + ' actividades. El día ya tiene ' + existing + '; no se borra nada.', { ok: 'Añadir', danger: false }))) return;
    let mode;
    r.items.forEach(function (it) {
      if (it.kind === 'travel') { mode = it.mode; return; }
      if (it.kind === 'visit') S.addActivity({ dayId: day.id, title: it.stop.name, category: 'visit', placeId: it.stop.id, startTime: U.toTime(it.start), endTime: U.toTime(it.end), transportMode: mode });
      else S.addActivity({ dayId: day.id, title: (it.meal === 'lunch' ? 'Almuerzo' : 'Cena') + (it.suggestion ? ': ' + it.suggestion.name : ''), category: 'restaurant', restaurantId: it.suggestion ? it.suggestion.id : undefined,
        location: it.suggestion || !it.coords ? undefined : { name: 'Zona de la parada anterior', coords: it.coords }, startTime: U.toTime(it.start), endTime: U.toTime(it.end), transportMode: it.suggestion ? 'walk' : undefined,
        notes: it.suggestion ? undefined : 'Sin restaurante guardado cerca: usa «Restaurantes cerca».' });
      mode = undefined;
    });
    st.result = null; st.selected = [];
    UI.toast('Plan añadido al itinerario');
    JT.go('day/' + day.id);
  };
})();
