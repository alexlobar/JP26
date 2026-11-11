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
    // Compacta: emoji + título + hora en un bloque y todas las acciones en una sola fila.
    return UI.card(
      '<div class="next"><span class="next__emoji" aria-hidden="true">' + D.ACTIVITY[a.category][1] + '</span><div class="grow">' +
        '<div class="next__top"><span class="eyebrow">' + (item.inProgress ? 'AHORA' : esc(label)) + '</span>' + (until ? UI.pill(until, item.inProgress ? 'accent' : 'neutral') : '') + '</div>' +
        '<strong class="next__title">' + esc(a.title) + '</strong>' +
        '<small class="muted block">' + esc((a.startTime || 'Sin hora') + (a.endTime ? ' – ' + a.endTime : '') + (loc.name && loc.name !== a.title ? ' · ' + loc.name : '')) + '</small>' +
        (est ? '<small class="faint block">' + D.MODE[est.mode][1] + ' ~' + U.fmtDur(est.minutes) + ' · ' + U.fmtKm(est.routeKm, S.get().settings.units) + (fromLabel ? ' desde ' + esc(fromLabel) : '') + ' (estimado)</small>' : '') +
      '</div></div>' +
      '<div class="next__acts">' + (dirUrl ? '<a class="btn btn--primary btn--sm" href="' + esc(dirUrl) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Cómo llegar</span></a>' : '<span class="grow"></span>') +
        (loc.coords ? UI.iconBtn('food', 'Comer cerca', { act: 'go', to: 'nearby?' + C.q({ lat: loc.coords.lat, lng: loc.coords.lng, label: loc.name || a.title }) }, { size: 20 }) : '') +
        // Marcarla como hecha (o saltarla) hace que la siguiente pase a primer plano.
        UI.iconBtn('check', 'Marcar como hecha', { act: 'doneNext', id: a.id }, { size: 20 }) + '</div>',
      { tone: item.inProgress ? 'accent' : '', data: { act: 'go', to: 'activity/' + a.id }, cls: 'stack-sm next-card' }
    );
  }

  /** Aviso de check-out: la mañana que dejas un hotel (hasta la hora de salida) y la noche anterior. */
  const checkedText = (r, fallback) => (r.checkoutDone && r.checkoutDone.length ? 'Lista «Antes de salir»: ' + r.checkoutDone.length + ' de ' + C.checkoutTotal + ' revisado' : fallback);

  function checkoutAlerts(n) {
    const out = [], tomorrow = U.addDays(n.date, 1);
    Object.values(S.get().reservations).filter((r) => r.type === 'hotel' && r.endDate).forEach(function (r) {
      const at = r.checkoutTime ? ' a las ' + r.checkoutTime : '';
      if (r.endDate === n.date && (!r.checkoutTime || n.minutes < U.toMin(r.checkoutTime)))
        out.push(UI.banner('warn', 'bed', 'Hoy dejas ' + r.name + (r.checkoutTime ? ' · salida antes de las ' + r.checkoutTime : ''), checkedText(r, 'Toca para repasar lo que no te puedes dejar.'), { data: { act: 'checkoutList', id: r.id } }));
      else if (r.endDate === tomorrow && n.minutes >= 18 * 60)
        out.push(UI.banner('info', 'bed', 'Mañana dejas ' + r.name + at, checkedText(r, 'Buen momento para ir haciendo la maleta. Toca para ver la lista.'), { data: { act: 'checkoutList', id: r.id } }));
    });
    return out.join('');
  }

  function alerts(t) {
    const s = S.get(), out = [checkoutAlerts(t.now)], n = t.now;
    // A menos de 30 días ya lo cuenta «¿Listo para el viaje?», que incluye la checklist.
    if (t.phase === 'before' && t.daysUntil > 30) {
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
    // Copia de seguridad: los datos sólo viven en este navegador.
    const last = SV.lastExport(), daysAgo = last ? Math.floor((Date.now() - last) / 86400000) : null;
    const own = ['activities', 'reservations', 'transports', 'expenses', 'places', 'restaurants', 'notes'].some((c) => Object.values(s[c]).some((x) => !x.isSample));
    if (own && (daysAgo === null || daysAgo >= 7))
      out.push(UI.banner('warn', 'download', 'Haz una copia de seguridad', daysAgo === null ? 'Aún no has exportado ninguna. Tus datos sólo están en este móvil.' : 'La última es de hace ' + daysAgo + ' días.',
        { action: UI.btn('Exportar', { size: 'sm', variant: 'secondary', data: { act: 'exportJson' } }) }));
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
      actions: UI.iconBtn('sos', 'Emergencia', { act: 'go', to: 'emergency' }) + UI.iconBtn('search', 'Buscar', { act: 'go', to: 'search' }) + UI.iconBtn('settings', 'Ajustes', { act: 'go', to: 'settings' })
    });
    const seg = '<div class="seg" role="tablist">' +
      '<button type="button" role="tab" class="seg__item' + (!travel ? ' is-on' : '') + '" aria-selected="' + !travel + '" data-act="travelMode" data-value="off">Resumen</button>' +
      '<button type="button" role="tab" class="seg__item' + (travel ? ' is-on' : '') + '" aria-selected="' + travel + '" data-act="travelMode" data-value="on">🧭 Modo viaje</button></div>';
    const install = JT.uiState.installPrompt ? UI.banner('info', 'download', 'Instala Japón Travel', 'Tenla como app en el móvil, también sin conexión.', { action: UI.btn('Instalar', { size: 'sm', data: { act: 'installApp' } }) }) : '';
    return { html: head + install + C.sampleBanner() + seg + (travel ? travelMode(t) : overview(t)) };
  };

  function overview(t) {
    const s = S.get(), n = t.now;
    const up = S.upcoming(n, 6);
    const title = t.phase === 'before' ? (t.daysUntil === 1 ? 'Mañana empieza' : 'Faltan ' + t.daysUntil + ' días') : t.phase === 'after' ? 'Viaje terminado' : 'Hoy — ' + (t.city ? t.city.name : 'Día libre');
    const sub = t.phase === 'during' ? 'Día ' + t.dayNumber + ' de ' + t.totalDays + (t.nextCity ? ' · después: ' + t.nextCity.name : '') : t.phase === 'before' ? 'Primer destino: ' + (t.city ? t.city.name : '—') : 'Revisa tus gastos y exporta tus datos';
    const spent = C.moneySum(Object.values(s.expenses));
    const budget = s.trip.totalBudget;
    const dayList = t.day ? S.dayActivities(t.day.id) : [];
    // Cabecera compacta: cuenta atrás (o el día de hoy) en una línea, con «Probar el Modo viaje» al lado.
    let html = UI.card('<div class="hero"><div class="grow"><div class="eyebrow">' + (t.phase === 'during' ? esc(U.fmtDay(n.date).toUpperCase()) : t.phase === 'before' ? 'CUENTA ATRÁS' : 'FIN') + '</div>' +
      '<h2 class="title">' + esc(title) + '</h2><p class="muted small">' + esc(sub) + '</p></div>' +
      (t.phase === 'before' ? UI.btn('Probar Modo viaje', { icon: 'nav', size: 'sm', variant: 'ghost', data: { act: 'simulate' } }) : '') + '</div>' +
      C.cityStrip(n.date), { tone: t.phase === 'during' ? 'accent' : '', cls: 'stack-sm' });
    // Antes de salir: repaso de lo importante (copia sin conexión, voz, hoteles, emergencia…).
    if (t.phase === 'before' && t.daysUntil <= 30) {
      const r = JT.ready ? JT.ready.syncSummary() : null;
      html += UI.banner(r && r.pending ? 'warn' : 'info', 'check', '¿Listo para el viaje?', r && r.pending ? r.pending + (r.pending === 1 ? ' cosa por preparar' : ' cosas por preparar') + ' · toca para verlas' : 'Comprueba la copia sin conexión, la voz japonesa y lo demás antes de salir.', { data: { act: 'go', to: 'ready' } });
    }
    html += alerts(t);
    if (t.phase === 'during' && t.day && n.minutes >= 18 * 60) html += diaryCard(t.day);
    if (t.phase === 'after' && S.sortedDays().some((d) => d.diary || d.mood)) html += UI.banner('info', 'book', 'Tu diario del viaje', 'Todos los días que escribiste, para releerlos o compartirlos.', { data: { act: 'go', to: 'diary' } });
    if (up[0]) html += nextUpCard(up[0], up[0].isToday ? 'SIGUIENTE' : 'PRÓXIMO PLAN');
    html += C.quick([
      ['calendar', '+ Actividad', { act: 'newActivity', day: t.phase === 'during' && t.day ? t.day.id : '' }],
      ['wallet', '+ Gasto', { act: 'newExpense' }],
      ['food', '+ Restaurante', { act: 'newRestaurant' }],
      ['note', '+ Nota', { act: 'newNote' }]
    ]);
    html += C.tripHub();
    if (t.day) {
      html += UI.section(t.phase === 'during' ? 'Resumen de hoy' : t.phase === 'before' ? 'Día 1 · ' + (t.city ? t.city.name : '') : 'Último día',
        UI.card(dayList.length ? '<div class="mini-tl">' + dayList.slice(0, 5).map((a) => '<div class="mini-tl__row' + (a.status === 'done' ? ' is-done' : '') + '"><span class="mono">' + (a.startTime || '··:··') + '</span><span>' + D.ACTIVITY[a.category][1] + ' ' + esc(a.title) + '</span></div>').join('') +
          (dayList.length > 5 ? '<small class="faint">+' + (dayList.length - 5) + ' más · toca para ver el día</small>' : '') + '</div>' : '<p class="muted">Sin actividades. Toca para planificar.</p>', { data: { act: 'go', to: 'day/' + t.day.id } }),
        UI.btn('Ver día', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'day/' + t.day.id } }));
    }
    html += UI.section('Gastos', UI.card('<div class="stats">' + UI.stat('Gastado', spent.text, '', true) +
      (budget ? UI.stat('Restante', U.money(budget - spent.total, spent.main), 'de ' + U.money(budget, spent.main)) : UI.stat('Presupuesto', '—', 'Defínelo en Ajustes')) + '</div>' +
      (budget ? UI.progress(spent.total / budget, spent.total > budget ? 'accent' : 'info') : '') + C.catStack(Object.values(s.expenses), 3) +
      (spent.extra ? '<small class="faint">+ ' + esc(spent.extra) + ' sin convertir</small>' : ''), { data: { act: 'go', to: 'expenses' }, cls: 'stack' }),
      UI.btn('Detalle', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'expenses' } }));
    if (up.length > 1) {
      // Plegado: abre cuando quieras ver lo que viene, sin alargar Inicio.
      html += UI.details('Próximos planes (' + (up.length - 1) + ')', '<div class="mini-tl">' + up.slice(1).map((u) => '<button type="button" class="mini-tl__row" data-act="go" data-to="activity/' + u.activity.id + '"><span class="mini-tl__when"><small class="muted">' + esc(u.isToday ? 'Hoy' : U.fmtDay(u.day.date).split(' ').slice(0, 2).join(' ')) + '</small><span class="mono">' + (u.activity.startTime || '··:··') + '</span></span><span>' + D.ACTIVITY[u.activity.category][1] + ' ' + esc(u.activity.title) + '</span></button>').join('') + '</div>' +
        UI.btn('Ver el itinerario', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'itinerary' } }), false);
    }
    return html;
  }

  /* ── Modo viaje: lo que necesitas en 5 segundos en la calle ── */

  function travelMode(t) {
    const s = S.get(), n = t.now, day = t.day, city = t.city;
    const up = S.upcoming(n, 4);
    // «Dónde estás» sale del plan (última parada de hoy o el hotel), no del GPS: para moverse se usa Google Maps.
    const here = S.inferArea(day, n);
    const current = up.find((u) => u.inProgress), next = up.find((u) => !u.inProgress);
    let html = '';
    if (n.simulated) html += UI.banner('warn', 'clock', 'Simulando ' + n.date + ' a las ' + n.time, 'Cámbialo o desactívalo en Ajustes → Modo viaje.', { data: { act: 'go', to: 'settings' } });
    html += checkoutAlerts(n);
    const strip = C.cityStrip(n.date);
    if (strip && t.phase === 'during') html += UI.card('<small class="muted">Día ' + t.dayNumber + ' de ' + t.totalDays + (city ? ' · ' + esc(city.name) : '') + (t.nextCity ? ' · después: ' + esc(t.nextCity.name) : '') + '</small>' + strip, { cls: 'stack-sm' });
    if (current) html += nextUpCard(current, 'AHORA');
    if (next) html += nextUpCard(next, 'SIGUIENTE', here, current ? 'la actividad actual' : 'tu última parada');
    else if (!current) html += UI.empty('🍵', 'Nada más por hoy', 'Disfruta. Puedes buscar dónde cenar cerca o planificar mañana.');
    const nearTo = here || (city && city.coords);
    html += C.quick([
      ['wallet', 'Gasto', { act: 'newExpense' }],
      ['food', 'Comer cerca', nearTo ? { act: 'go', to: 'nearby?' + C.q({ lat: nearTo.lat, lng: nearTo.lng, label: city && city.name }) } : { act: 'go', to: 'food' }],
      ['calendar', 'Día de hoy', day ? { act: 'go', to: 'day/' + day.id } : { act: 'go', to: 'itinerary' }],
      ['chat', 'Frases', { act: 'go', to: 'phrases' }]
    ]);
    // Por la noche: cómo fue el día, arriba para que no se olvide.
    if (day && n.minutes >= 18 * 60) html += diaryCard(day);
    html += C.quickConverter();
    // Volver al hotel: la tarjeta para el taxista a un toque.
    const hotel = S.hotelTonight(n.date);
    if (hotel) {
      const hl = hotel.location || {}, hdir = hl.coords || hl.name || hl.address ? U.directionsUrl(hl) : null;
      html += UI.card('<div class="row"><span class="quick__icon tone-violet">' + U.icon('bed', 20) + '</span><div class="grow"><small class="eyebrow muted">ESTA NOCHE DUERMES EN</small><strong class="block">' + esc(hotel.name) + '</strong>' +
        (hotel.nameJa ? '<small class="muted" lang="ja">' + esc(hotel.nameJa) + '</small>' : '') + '</div></div>' +
        '<div class="row row--wrap">' + UI.btn('Para el taxista', { icon: 'car', size: 'sm', data: { act: 'taxi', id: hotel.id } }) +
        (hdir ? '<a class="btn btn--secondary btn--sm" href="' + esc(hdir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Volver al hotel</span></a>' : '') + '</div>', { cls: 'stack' });
    }
    const spentToday = C.moneySum(Object.values(s.expenses).filter((e) => e.date === n.date));
    const spentAll = C.moneySum(Object.values(s.expenses));
    const budget = s.trip.totalBudget;
    html += UI.card('<div class="stats">' + UI.stat('Hoy', spentToday.text, '', true) + UI.stat('Total viaje', spentAll.text, budget ? 'de ' + U.money(budget, spentAll.main) : '') + '</div>' + (budget ? UI.progress(spentAll.total / budget, spentAll.total > budget ? 'accent' : 'info') : ''), { cls: 'stack' });
    const resv = day ? S.reservationsOffTimeline(day).filter((r) => !hotel || r.id !== hotel.id) : []; // el hotel de esta noche ya tiene su tarjeta
    if (resv.length) html += UI.section('Reservas de hoy', resv.map(C.reservationCard).join(''), UI.btn('Todas', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'reservations' } }));
    const near = here ? S.savedNear(here, 1.5).slice(0, 3) : [];
    html += UI.section('Comer cerca',
      near.length ? near.map((x) => C.restaurantCard(x.restaurant, x.km)).join('') : '<p class="muted small">Ningún restaurante guardado a menos de 1,5 km. Pulsa «Buscar más» para ver opciones cercanas (requiere conexión).</p>',
      nearTo ? UI.btn('Buscar más', { size: 'sm', variant: 'ghost', icon: 'search', data: { act: 'go', to: 'nearby?' + C.q({ lat: nearTo.lat, lng: nearTo.lng, label: city && city.name }) } }) : '');
    const later = day ? S.dayActivities(day.id).filter((a) => a.status !== 'done' && a !== (current && current.activity) && a !== (next && next.activity) && (!a.startTime || U.toMin(a.startTime) >= n.minutes)) : [];
    if (later.length) html += UI.section('Más tarde hoy', UI.card('<div class="mini-tl">' + later.map((a) => '<button type="button" class="mini-tl__row" data-act="go" data-to="activity/' + a.id + '"><span class="mono">' + (a.startTime || '··:··') + '</span><span>' + D.ACTIVITY[a.category][1] + ' ' + esc(a.title) + '</span></button>').join('') + '</div>'),
      UI.btn('Día completo', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'day/' + day.id } }));
    const notes = Object.values(s.notes).filter((x) => (city && x.scope === 'city' && x.refId === city.id) || (day && x.scope === 'day' && x.refId === day.id)).sort((a, b) => b.pinned - a.pinned).slice(0, 3);
    if (notes.length) html += UI.section('Notas · ' + (city ? city.name : 'hoy'), notes.map((x) => C.noteCard(x)).join(''), UI.btn('Todas', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'notes' } }));
    // En el Modo viaje manda lo de ahora: los apartados del viaje van al final.
    html += C.tripHub();
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


  /* ══ ITINERARIO ══════════════════════════════════════════════ */

  /** Tarjeta de un día: color de su ciudad, traslados y hotel de esa noche sin tener que abrirlo. */
  function dayCard(d, num, isToday) {
    const s = S.get(), list = S.dayActivities(d.id), done = list.filter((a) => a.status === 'done').length;
    const city = d.cityId && s.cities[d.cityId];
    const trips = Object.values(s.transports).filter((x) => x.date === d.date).sort((a, b) => U.cmpTime(a.departTime, b.departTime));
    const hotel = S.hotelTonight(d.date);
    const shown = list.filter((a) => !a.transportId); // los trayectos ya salen arriba como etiqueta
    // Si ese día dejas un hotel distinto del de esa noche: etiqueta de check-out.
    const leaving = Object.values(s.reservations).find((r) => r.type === 'hotel' && r.endDate === d.date && (!hotel || hotel.id !== r.id));
    const tags = (leaving ? '<span class="daycard__tag">🧳 Check-out' + (leaving.checkoutTime ? ' ' + leaving.checkoutTime : '') + '</span>' : '') + trips.map((x) => '<span class="daycard__tag">' + D.TRANSPORT[x.kind][1] + ' ' + esc(x.origin + ' → ' + x.destination) + (x.departTime ? ' · ' + x.departTime : '') + '</span>').join('') +
      // El día que llegas al hotel: «Check-in 15:00 · nombre»; los demás días, sólo dónde dormís.
      (hotel ? '<span class="daycard__tag">🏨 ' + (hotel.date === d.date ? 'Check-in' + (hotel.time ? ' ' + hotel.time : '') + ' · ' : '') + esc(hotel.name) + '</span>' : '');
    return '<div id="day-' + d.id + '" class="card card--tap daycard' + (isToday ? ' card--accent' : '') + '" style="--city:' + esc(city ? city.color || '#C8102E' : 'transparent') + '" tabindex="0" data-act="go" data-to="day/' + d.id + '">' +
      '<div class="daycard__top"><span class="daynum' + (isToday ? ' is-today' : '') + '"><small>DÍA</small><strong>' + num + '</strong></span>' +
      '<div class="grow"><strong>' + esc(U.fmtDay(d.date)) + '</strong> ' + (isToday ? UI.pill('Hoy', 'accent') : '') + (d.title ? '<small class="muted block">' + esc(d.title) + '</small>' : '') + '</div>' +
      '<small class="faint">' + (list.length ? done + '/' + list.length : '') + '</small></div>' +
      (tags ? '<div class="daycard__meta">' + tags + '</div>' : '') +
      (shown.length ? '<div class="daycard__preview">' + shown.slice(0, 4).map((a) => '<small class="' + (a.status === 'done' ? 'faint' : 'muted') + '"><b class="mono">' + (a.startTime || '··:··') + '</b>  ' + D.ACTIVITY[a.category][1] + ' ' + esc(a.title) + '</small>').join('') +
        (shown.length > 4 ? '<small class="faint">+' + (shown.length - 4) + ' más</small>' : '') + '</div>' : tags ? '' : '<small class="faint daycard__preview">Sin actividades todavía</small>') + '</div>';
  }

  /* Durante el viaje los días ya pasados se pliegan arriba y hay un botón para ir a hoy. */
  V.itinerary = function () {
    const s = S.get(), days = S.sortedDays(), t = S.today();
    const num = {};
    days.forEach((d, i) => (num[d.id] = i + 1));
    const todayId = t.phase === 'during' && t.day ? t.day.id : null;
    const isPast = (d) => t.phase === 'during' && d.date < t.now.date;
    const card = (d) => dayCard(d, num[d.id], d.id === todayId);
    let html = UI.header({ title: 'Itinerario', subtitle: U.fmtRange(s.trip.startDate, s.trip.endDate) + ' · ' + days.length + ' días',
      actions: UI.iconBtn('search', 'Buscar', { act: 'go', to: 'search' }) + UI.iconBtn('sparkle', 'Planificar día', { act: 'go', to: 'planner' }) }) + C.sampleBanner();
    if (todayId) html += UI.btn('Ir a hoy · Día ' + num[todayId], { icon: 'calendar', size: 'sm', variant: 'secondary', data: { act: 'goToday', id: todayId } });
    const past = days.filter(isPast);
    let body = past.length ? UI.details('Días anteriores (' + past.length + ')', past.map(card).join(''), false) : '';
    S.cityStays().forEach(function (st) {
      const c = s.cities[st.cityId], ids = st.dayIds.filter((id) => !isPast(s.days[id]));
      if (!ids.length) return;
      body += UI.section((c ? c.name : 'Ciudad') + ' · ' + U.fmtRange(st.start, st.end), ids.map((id) => card(s.days[id])).join(''), '<small class="faint">' + st.nights + (st.nights === 1 ? ' noche' : ' noches') + '</small>');
    });
    const loose = days.filter((d) => !d.cityId && !isPast(d));
    if (loose.length) body += UI.section('Días sin ciudad', loose.map(card).join(''), UI.btn('Asignar', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'cities' } }));
    html += '<div class="itin">' + body + '</div>';
    html += '<div class="row row--center">' + UI.btn('Ciudades', { icon: 'city', variant: 'secondary', data: { act: 'go', to: 'cities' } }) + UI.btn('Transporte', { icon: 'train', variant: 'secondary', data: { act: 'go', to: 'transport' } }) + '</div>';
    return { html: html };
  };
  A.goToday = (el) => { const c = document.getElementById('day-' + el.dataset.id); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  /* ══ VISTA DEL DÍA ═══════════════════════════════════════════ */

  V.day = function (p) {
    const s = S.get(), day = s.days[p.id];
    if (!day) return { html: UI.header({ title: 'Día no encontrado', back: true }) + UI.empty('🗓️', 'Este día ya no existe') };
    const num = S.dayNumber(day.id), city = day.cityId && s.cities[day.cityId], n = S.now();
    const list = S.dayActivities(day.id), locs = list.map(S.resolveLocation);
    const spent = C.moneySum(Object.values(s.expenses).filter((e) => e.date === day.date));
    const est = C.moneySum(list.filter((a) => a.estimatedCost).map((a) => ({ amount: a.estimatedCost, currency: a.costCurrency || 'JPY' })));
    const resv = S.reservationsOffTimeline(day);
    const notes = Object.values(s.notes).filter((x) => (x.scope === 'day' && x.refId === day.id) || (city && x.scope === 'city' && x.refId === city.id));
    // Restaurantes guardados a menos de 1 km de alguna actividad del día (offline).
    const near = {};
    locs.forEach((l) => { if (l.coords) S.savedNear(l.coords, 1).forEach((x) => { if (!near[x.restaurant.id] || near[x.restaurant.id].km > x.km) near[x.restaurant.id] = x; }); });
    const used = new Set(list.map((a) => a.restaurantId));
    const nearList = Object.values(near).filter((x) => !used.has(x.restaurant.id)).sort((a, b) => a.km - b.km).slice(0, 4);
    const firstLoc = locs.find((l) => l.coords);

    let html = UI.header({ back: true, eyebrow: 'DÍA ' + num + (city ? ' · ' + city.name.toUpperCase() : '') + (n.date === day.date ? ' · HOY' : ''), title: U.fmtLong(day.date), subtitle: day.title,
      actions: UI.iconBtn('share', 'Compartir día', { act: 'shareDay', id: day.id }) + UI.iconBtn('edit', 'Editar día', { act: 'editDay', id: day.id }) });
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
    const mood = day.mood && D.MOOD[day.mood];
    html += UI.section('Diario', day.diary || mood
      ? UI.card((mood ? '<span class="diary__mood">' + mood[1] + ' <small class="muted">' + esc(mood[0]) + '</small></span>' : '') + (day.diary ? '<p class="pre">' + esc(day.diary) + '</p>' : ''), { data: { act: 'editDiary', id: day.id }, cls: 'stack-sm' })
      : '<p class="muted small">' + (day.date <= n.date ? 'Aún no has escrito cómo fue este día.' : 'Al final del día podrás contar aquí cómo fue.') + '</p>',
      UI.btn(day.diary || mood ? 'Editar' : 'Escribir', { size: 'sm', variant: 'ghost', icon: 'edit', data: { act: 'editDiary', id: day.id } }));
    return { html: html };
  };

  /* ══ DIARIO ══════════════════════════════════════════════════
     Una nota por día con cómo fue (😍🙂😐😴😣). Se guarda en el día
     (day.diary, day.mood), así va en la exportación JSON. */

  function dayStats(day) {
    const list = S.dayActivities(day.id);
    return { done: list.filter((a) => a.status === 'done').length, total: list.length, spent: C.moneySum(Object.values(S.get().expenses).filter((e) => e.date === day.date)) };
  }

  /** Tarjeta «¿Qué tal hoy?»: por la noche en Inicio y en el Modo viaje. */
  function diaryCard(day) {
    const st = dayStats(day), mood = day.mood && D.MOOD[day.mood];
    return UI.card('<div class="row row--between"><span class="eyebrow">' + (day.diary || mood ? 'TU DIARIO DE HOY' : '¿QUÉ TAL HOY?') + '</span>' + (mood ? '<span class="diary__mood" aria-label="' + esc(mood[0]) + '">' + mood[1] + '</span>' : '') + '</div>' +
      '<small class="muted">' + st.done + ' de ' + st.total + ' planes hechos · ' + esc(st.spent.text) + ' gastado</small>' +
      (day.diary ? '<p class="pre clamp4">' + esc(day.diary) + '</p>' : '<p class="muted small">Apunta lo mejor del día antes de que se te olvide: al volver tendrás el viaje contado día a día.</p>') +
      '<div class="row row--wrap">' + UI.btn(day.diary || mood ? 'Editar' : 'Escribir el diario', { icon: 'edit', size: 'sm', variant: day.diary ? 'ghost' : 'primary', data: { act: 'editDiary', id: day.id } }) +
        UI.btn('Ver diario', { icon: 'book', size: 'sm', variant: 'ghost', data: { act: 'go', to: 'diary' } }) + '</div>', { cls: 'stack-sm' });
  }
  C.diaryCard = diaryCard;

  F.diary = function (dayId) {
    const day = S.get().days[dayId];
    if (!day) return;
    const st = dayStats(day);
    const close = UI.sheet({
      title: 'Diario · Día ' + S.dayNumber(day.id),
      body: '<form id="fDiary" class="stack"><p class="muted small">' + esc(U.fmtLong(day.date)) + ' · ' + st.done + ' de ' + st.total + ' planes hechos · ' + esc(st.spent.text) + '</p>' +
        UI.field('¿Qué tal fue?', UI.chips('mood', Object.keys(D.MOOD).map((k) => ({ value: k, label: D.MOOD[k][1] + ' ' + D.MOOD[k][0] })), day.mood, { allowNone: true, noneLabel: '—' }), { optional: true }) +
        UI.field('Lo que no quieres olvidar', UI.textarea('diary', day.diary || '', 'Lo mejor del día, qué comisteis, una anécdota, un sitio al que volver…', 6), { optional: true }) + '</form>',
      footer: UI.btn('Guardar', { type: 'submit', form: 'fDiary', block: true }),
      onMount: (root) => root.querySelector('#fDiary').addEventListener('submit', function (ev) {
        ev.preventDefault();
        const f = UI.formData(ev.target), text = (f.diary || '').trim();
        S.update('days', day.id, { diary: text || undefined, mood: f.mood || undefined });
        UI.toast(text || f.mood ? 'Diario guardado' : 'Diario vacío');
        close();
      })
    });
  };
  A.editDiary = (el) => F.diary(el.dataset.id);

  V.diary = function () {
    const s = S.get(), days = S.sortedDays().filter((d) => d.diary || d.mood);
    const head = UI.header({ back: true, title: 'Diario del viaje', subtitle: days.length ? days.length + (days.length === 1 ? ' día escrito' : ' días escritos') : '',
      actions: days.length ? UI.iconBtn('share', 'Compartir el diario', { act: 'shareDiary' }) : '' });
    if (!days.length) return { html: head + UI.empty('📔', 'Aún no has escrito nada', 'Cada noche, en Inicio, sale «¿Qué tal hoy?». También puedes escribir desde la vista de cada día.') };
    return { html: head + days.map(function (d) {
      const city = d.cityId && s.cities[d.cityId], mood = d.mood && D.MOOD[d.mood], st = dayStats(d);
      return '<div class="card card--tap stack-sm diary" tabindex="0" data-act="editDiary" data-id="' + d.id + '" style="--city:' + esc(city ? city.color || 'var(--accent)' : 'var(--border)') + '">' +
        '<div class="row row--between"><span class="eyebrow">DÍA ' + S.dayNumber(d.id) + (city ? ' · ' + esc(city.name.toUpperCase()) : '') + '</span>' + (mood ? '<span class="diary__mood" aria-label="' + esc(mood[0]) + '">' + mood[1] + '</span>' : '') + '</div>' +
        '<strong>' + esc(U.fmtLong(d.date)) + '</strong>' + (d.diary ? '<p class="pre">' + esc(d.diary) + '</p>' : '') +
        '<small class="faint">' + st.done + ' de ' + st.total + ' planes · ' + esc(st.spent.text) + '</small></div>';
    }).join('') };
  };

  A.shareDiary = async function () {
    const s = S.get();
    const text = s.trip.name + ' — diario\n\n' + S.sortedDays().filter((d) => d.diary || d.mood).map(function (d) {
      const city = d.cityId && s.cities[d.cityId], mood = d.mood && D.MOOD[d.mood];
      return 'Día ' + S.dayNumber(d.id) + ' · ' + U.fmtLong(d.date) + (city ? ' · ' + city.name : '') + (mood ? ' ' + mood[1] : '') + (d.diary ? '\n' + d.diary : '');
    }).join('\n\n');
    const r = await SV.share(text, 'Diario');
    if (r === 'copied') UI.toast('Copiado');
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
      (loc.coords ? UI.btn('Restaurantes cerca', { icon: 'food', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'nearby?' + C.q({ lat: loc.coords.lat, lng: loc.coords.lng, label: loc.name || a.title }) } }) : '') +
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
    if (loc.coords) items.push({ icon: 'food', label: 'Restaurantes cerca', run: () => JT.go('nearby?' + C.q({ lat: loc.coords.lat, lng: loc.coords.lng, label: loc.name || a.title })) });
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
    const linkedRes = a.reservationId && s.reservations[a.reservationId];
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
        UI.field('Nº de reserva', UI.input('bookingCode', (linkedRes && linkedRes.confirmationCode) || '', { placeholder: 'ABC123' }), { optional: true, hint: 'Si lo pones, la actividad aparece también en Inicio → Tu viaje → Reservas.' }) +
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
          let id;
          if (ex) { S.updateActivity(ex.id, data); id = ex.id; } else id = S.addActivity(data);
          const resMsg = saveBookingCode(id, f);
          const d = S.get().days[data.dayId];
          UI.toast((ex ? 'Actividad guardada' : 'Actividad creada') + ' · Día ' + S.dayNumber(d.id) + ' · ' + U.fmtShort(d.date) + resMsg);
          close();
        });
      }
    });
  };

  /* Nº de reserva escrito en la actividad: actualiza su reserva o crea una en Reservas, enlazada. */
  const RES_TYPE = { hotel: 'hotel', restaurant: 'restaurant', cafe: 'restaurant', transport: 'train', activity: 'activity', visit: 'activity' };

  function saveBookingCode(activityId, f) {
    const code = (f.bookingCode || '').trim().toUpperCase();
    if (!code) return '';
    const s = S.get(), a = s.activities[activityId], r = a.reservationId && s.reservations[a.reservationId];
    if (r) { if (r.confirmationCode !== code) S.update('reservations', r.id, { confirmationCode: code }); return ''; }
    const day = s.days[a.dayId], loc = S.resolveLocation(a);
    S.addReservationFor(activityId, { type: RES_TYPE[a.category] || 'other', name: a.title, date: day.date, time: a.startTime, confirmationCode: code, cityId: day.cityId,
      location: loc.name || loc.coords ? { name: loc.name, address: loc.address, coords: loc.coords } : undefined });
    return ' · reserva añadida en Reservas';
  }

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
      UI.field('Salida desde', UI.filterChips([].concat(hotel ? [{ value: 'hotel', label: '🏨 ' + hotel.name.replace(/ \(ficticio\)/, '') }] : [], [{ value: 'first', label: 'Primera parada' }]), st.from, 'plannerFrom', { scroll: false })) +
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
