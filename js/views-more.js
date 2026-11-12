/* ============================================================
   views-more.js — Más, reservas, transporte, notas, checklist,
   información útil, frases, documentos (cofre cifrado),
   búsqueda, importar y ajustes.
   ============================================================ */
(function () {
  'use strict';

  const U = JT.utils, D = JT.data, S = JT.store, L = JT.logic, UI = JT.ui, C = JT.cards, SV = JT.services;
  const esc = U.esc;
  const V = JT.views, F = JT.forms, A = JT.actions;
  JT.changes = JT.changes || {};

  function formSheet(o) {
    // Hoja con formulario estándar: guardar (submit) + eliminar opcional.
    const close = UI.sheet({
      title: o.title, body: '<form id="' + o.id + '" class="stack" novalidate>' + o.body + '<p class="error" hidden></p></form>',
      footer: '<div class="row">' + (o.onDelete ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn(o.saveLabel || 'Guardar', { type: 'submit', form: o.id, block: true }) + '</div>',
      onClose: o.onClose,
      onMount: function (root) {
        const form = root.querySelector('#' + o.id), err = form.querySelector('.error');
        if (o.onMount) o.onMount(form);
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await o.onDelete()) close(); });
        form.addEventListener('submit', async function (ev) {
          ev.preventDefault();
          const problem = await o.onSave(UI.formData(form), form);
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          close();
        });
      }
    });
    return close;
  }

  /* Reservas y trayectos aparecen solos en el itinerario de su día (lo hace store.js). */

  function itineraryToggle(x) {
    return UI.chipsMulti('inItinerary', [{ value: '1', label: '🗓️ Mostrar en el itinerario del día' }], x.inItinerary === false ? [] : ['1']);
  }

  function savedToast(msg, col, id) {
    const where = S.linkedDayLabel(col, id);
    UI.toast(where ? msg + ' · está en el ' + where : msg);
  }

  /* ── Del coste de una reserva o trayecto a Gastos, sin escribirlo dos veces ── */

  const COST_FIELD = { reservations: 'reservationId', transports: 'transportId' };
  const RES_EXPENSE = { hotel: 'hotel', restaurant: 'food', train: 'transport', flight: 'flights', activity: 'tickets', other: 'other' };

  /** Gasto apuntado desde esa reserva/trayecto, si lo hay. */
  function costExpense(col, id) {
    return Object.values(S.get().expenses).find((e) => e[COST_FIELD[col]] === id) || null;
  }

  /** Fila del coste: «Apuntar en Gastos» o, si ya está, enlace al gasto. */
  function costRow(col, x) {
    const ex = costExpense(col, x.id), money = U.money(x.cost, x.currency || 'JPY');
    return ex ? UI.listRow({ icon: 'wallet', title: money, sub: 'Coste · ya está en Gastos ✓', data: { act: 'editExpense', id: ex.id } })
      : UI.listRow({ icon: 'wallet', title: money, sub: 'Coste · aún no está en Gastos', right: UI.btn('Apuntar en Gastos', { size: 'sm', variant: 'secondary', data: { act: 'costToExpense', col: col, id: x.id } }) });
  }
  JT.cards.costExpense = costExpense;

  A.costToExpense = function (el) {
    const col = el.dataset.col, x = S.get()[col][el.dataset.id];
    if (!x || !x.cost) return;
    const ex = costExpense(col, x.id);
    if (ex) return F.expense(ex.id);
    const isRes = col === 'reservations';
    F.expense(null, {
      amount: x.cost, currency: x.currency || 'JPY', date: x.date, cityId: x.cityId,
      category: isRes ? RES_EXPENSE[x.type] || 'other' : x.kind === 'flight' ? 'flights' : 'transport',
      description: isRes ? x.name : x.origin + ' → ' + x.destination,
      reservationId: isRes ? x.id : undefined, transportId: isRes ? undefined : x.id
    });
  };

  /* ══ RESERVAS ════════════════════════════════════════════════ */

  V.reservations = function () {
    const s = S.get(), st = JT.uiState.reservations, n = S.now();
    const list = Object.values(s.reservations).filter((r) => !st.type || r.type === st.type).filter((r) => st.past || (r.endDate || r.date) >= n.date)
      .sort((a, b) => a.date.localeCompare(b.date) || U.cmpTime(a.time, b.time));
    const g = {};
    list.forEach((r) => (g[r.date] = (g[r.date] || []).concat(r)));
    return { html: UI.header({ back: true, title: 'Reservas', actions: UI.iconBtn('plus', 'Nueva reserva', { act: 'newReservation', type: st.type }) }) +
      JT.fchips('reservations', 'type', D.options(D.RESERVATION), 'Todas') +
      UI.btn(st.past ? 'Ocultar pasadas' : 'Mostrar pasadas', { size: 'sm', variant: 'ghost', data: { act: 'resPast' } }) +
      (list.length ? Object.keys(g).map((d) => UI.section(U.fmtDay(d), g[d].map(C.reservationCard).join(''))).join('')
        : UI.empty('🎫', 'Sin reservas', 'Guarda hoteles, trenes, restaurantes y entradas con su número de reserva.', UI.btn('Añadir reserva', { data: { act: 'newReservation', type: st.type } }))) };
  };
  A.resPast = () => { JT.uiState.reservations.past = !JT.uiState.reservations.past; JT.app.render(); };

  V.reservation = function (p) {
    const s = S.get(), r = s.reservations[p.id];
    if (!r) return { html: UI.header({ title: 'Reserva no encontrada', back: true }) + UI.empty('🎫', 'Esta reserva ya no existe') };
    const t = D.RESERVATION[r.type], city = r.cityId && s.cities[r.cityId], loc = r.location || {};
    const dir = loc.coords || loc.name || loc.address ? U.directionsUrl(loc) : null;
    const linked = Object.values(s.activities).filter((a) => a.reservationId === r.id);
    let html = UI.header({ back: true, eyebrow: (t[1] + ' ' + t[0] + (city ? ' · ' + city.name : '')).toUpperCase(), title: r.name,
      subtitle: U.fmtDay(r.date) + (r.time ? ' · ' + r.time : '') + (r.endDate ? ' → ' + U.fmtDay(r.endDate) + (r.checkoutTime ? ' · salida ' + r.checkoutTime : '') : ''),
      actions: UI.iconBtn('share', 'Compartir', { act: 'shareReservation', id: r.id }) + UI.iconBtn('edit', 'Editar', { act: 'editReservation', id: r.id }) });
    if (r.confirmationCode) html += UI.card('<small class="muted">Nº DE RESERVA · toca para copiar</small><div class="display code">' + esc(r.confirmationCode) + '</div>', { tone: 'info', data: { act: 'copy', text: r.confirmationCode } });
    html += '<div class="row row--wrap">' + (dir ? '<a class="btn btn--primary btn--sm" href="' + esc(dir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Cómo llegar</span></a>' : '') +
      (r.phone ? '<a class="btn btn--secondary btn--sm" href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">' + U.icon('phone', 16) + '<span>Llamar</span></a>' : '') +
      (r.url ? UI.btn('Web', { icon: 'link', size: 'sm', variant: 'secondary', data: { act: 'openUrl', url: r.url } }) : '') +
      (r.type === 'hotel' && r.endDate ? UI.btn('Antes de salir', { icon: 'checklist', size: 'sm', variant: 'secondary', data: { act: 'checkoutList', id: r.id } }) : '') +
      (loc.name || loc.address || r.addressJa ? UI.btn('Para el taxista', { icon: 'car', size: 'sm', variant: 'secondary', data: { act: 'taxi', id: r.id } }) : '') +
      UI.btn('Añadir a Google Calendar', { icon: 'calendar', size: 'sm', variant: 'secondary', data: { act: 'gcal', col: 'reservations', id: r.id } }) + '</div>';
    html += UI.card((loc.name || loc.address ? UI.listRow({ icon: 'pin', title: loc.name || loc.address, sub: loc.name ? loc.address : '' }) : '') + (r.phone ? UI.listRow({ icon: 'phone', title: r.phone }) : '') +
      (r.cost ? costRow('reservations', r) : '') + (!loc.name && !loc.address && !r.phone && !r.cost ? '<p class="muted">Sin más datos.</p>' : ''));
    if (r.notes) html += UI.section('Notas', UI.card('<p class="pre">' + esc(r.notes) + '</p>', { tone: 'warn' }));
    html += UI.section('En el itinerario', linked.length
      ? UI.card(linked.map((a) => UI.listRow({ icon: 'calendar', title: a.title, sub: [s.days[a.dayId] ? 'Día ' + S.dayNumber(a.dayId) + ' · ' + U.fmtShort(s.days[a.dayId].date) : '', a.startTime].filter(Boolean).join(' · '), data: { act: 'go', to: 'activity/' + a.id } })).join(''))
      : '<p class="muted small">' + (r.inItinerary === false ? 'La quitaste del itinerario. Edítala y marca «Mostrar en el itinerario del día» para que vuelva.' : 'Su fecha está fuera del viaje.') + '</p>');
    return { html: html };
  };
  A.copy = async (el) => { await SV.copy(el.dataset.text); UI.toast('Copiado'); };
  /** Tarjeta para el taxista: «A esta dirección, por favor» y el nombre y la dirección en japonés, en grande. */
  A.taxi = function (el) {
    const r = S.get().reservations[el.dataset.id];
    if (!r) return;
    const loc = r.location || {};
    const dir = loc.coords || loc.name || loc.address ? U.directionsUrl(loc) : null;
    const nameBig = r.nameJa || r.name, addrBig = r.addressJa || loc.address || '';
    UI.sheet({
      title: 'Para el taxista',
      body: '<div class="taxi" lang="ja"><p class="taxi__ask">この住所までお願いします</p><div class="taxi__name">' + esc(nameBig) + '</div>' + (addrBig ? '<div class="taxi__addr">' + esc(addrBig) + '</div>' : '') + '</div>' +
        '<p class="muted center small">Kono jūsho made onegai shimasu · «A esta dirección, por favor»</p>' +
        '<p class="row row--center row--wrap">' + (SV.canSpeak() ? UI.btn('Escuchar', { icon: 'speaker', size: 'sm', variant: 'ghost', data: { act: 'speak', text: 'この住所までお願いします。' + (r.nameJa || '') } }) : '') +
          UI.btn('Pantalla completa', { icon: 'expand', size: 'sm', variant: 'ghost', data: { act: 'showcase', ja: [nameBig, addrBig].filter(Boolean).join('\n'), sub: 'この住所までお願いします', es: 'Para el taxista: ' + r.name } }) + '</p>' +
        (r.nameJa || r.addressJa ? '<p class="faint center small">' + esc([r.name, loc.address].filter(Boolean).join(' · ')) + '</p>' : '') +
        (r.addressJa ? '' : UI.banner('warn', 'alert', 'Falta la dirección en japonés', 'Edita la reserva y pégala: muchos taxistas no leen bien el alfabeto latino.')) +
        (r.phone ? '<p class="center"><a class="btn btn--ghost btn--sm" href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">' + U.icon('phone', 16) + '<span>' + esc(r.phone) + '</span></a></p>' : ''),
      footer: '<div class="row">' + UI.btn('Copiar dirección', { icon: 'copy', variant: 'secondary', block: true, data: { cp: '1' } }) +
        (dir ? '<a class="btn btn--primary btn--block" href="' + esc(dir) + '" target="_blank" rel="noopener">' + U.icon('nav', 18) + '<span>Cómo llegar</span></a>' : '') + '</div>',
      onMount: (root) => root.querySelector('[data-cp]').addEventListener('click', async () => { await SV.copy([nameBig, addrBig].filter(Boolean).join('\n')); UI.toast('Copiado'); })
    });
  };

  /* ── Antes de salir del hotel: repaso rápido, marcado por estancia ── */

  const CHECKOUT_ITEMS = [
    ['chargers', 'Cargadores, cables y batería externa'],
    ['adapter', 'Adaptador de enchufe (se suele quedar en la pared)'],
    ['passport', 'Pasaporte y documentos'],
    ['safe', 'Caja fuerte vacía'],
    ['ic', 'Suica / tarjeta IC y billetes de hoy'],
    ['bathroom', 'Baño: cepillo, cremas, maquinilla'],
    ['closet', 'Armario, cajones y debajo de la cama'],
    ['fridge', 'Nevera'],
    ['laundry', 'Ropa tendida o en la lavandería'],
    ['luggage', 'Maleta: ¿consigna en el hotel o envío (takkyūbin)?'],
    ['key', 'Devolver la llave o la tarjeta']
  ];
  C.checkoutTotal = CHECKOUT_ITEMS.length;

  A.checkoutList = function (el) {
    const id = el.dataset.id, r = S.get().reservations[id];
    if (!r) return;
    let done = (r.checkoutDone || []).slice();
    const count = () => done.length + ' de ' + CHECKOUT_ITEMS.length;
    UI.sheet({
      title: 'Antes de salir del hotel',
      body: '<p class="muted small">' + esc(r.name) + (r.checkoutTime ? ' · salida antes de las ' + r.checkoutTime : '') + ' · <span data-count>' + count() + '</span></p>' +
        '<div class="card card--list">' + CHECKOUT_ITEMS.map((it) => '<div class="check' + (done.indexOf(it[0]) > -1 ? ' is-done' : '') + '"><button type="button" class="check__main" data-k="' + it[0] + '" aria-pressed="' + (done.indexOf(it[0]) > -1) + '">' +
          '<span class="check__box">' + U.icon('check', 14) + '</span><span>' + esc(it[1]) + '</span></button></div>').join('') + '</div>',
      footer: UI.btn('Listo', { block: true, data: { ok: '1' } }),
      onClose: () => JT.app.render(), // que el aviso de Inicio muestre lo ya revisado
      onMount: function (root, close) {
        root.querySelector('[data-ok]').addEventListener('click', close);
        root.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', function () {
          const k = b.dataset.k, on = done.indexOf(k) === -1;
          done = on ? done.concat(k) : done.filter((x) => x !== k);
          b.parentElement.classList.toggle('is-done', on);
          b.setAttribute('aria-pressed', String(on));
          root.querySelector('[data-count]').textContent = count();
          S.update('reservations', id, { checkoutDone: done.length ? done : undefined });
          if (done.length === CHECKOUT_ITEMS.length) UI.toast('Todo revisado. ¡Buen viaje! 🧳');
        }));
      }
    });
  };

  /** Abre Google Calendar con el evento relleno: sólo queda pulsar Guardar. */
  A.gcal = (el) => SV.openUrl(L.gcalUrl(el.dataset.col, S.get()[el.dataset.col][el.dataset.id]));
  A.shareReservation = async (el) => { const r = await SV.share(L.shareReservation(S.get().reservations[el.dataset.id])); if (r === 'copied') UI.toast('Copiado'); };

  F.reservation = function (id, def) {
    const s = S.get(), ex = id ? s.reservations[id] : null;
    def = def || {};
    const r = ex || { type: def.type || 'hotel', name: def.name || '', date: def.date || s.trip.startDate, time: def.time, confirmationCode: def.code, cityId: def.cityId, currency: 'JPY' };
    const loc = r.location || {};
    return formSheet({
      id: 'fRes', title: ex ? 'Editar reserva' : 'Nueva reserva',
      body: UI.field('Tipo', UI.chips('type', D.options(D.RESERVATION), r.type)) +
        UI.field('Nombre', UI.input('name', r.name, { placeholder: 'p.ej. Cena en Gion', autofocus: !ex && !def.name })) +
        UI.field('Nº de reserva', UI.input('confirmationCode', r.confirmationCode || '', { placeholder: 'ABC123' }), { optional: true }) +
        '<div class="row row--top">' + UI.field('Fecha (entrada)', UI.input('date', r.date, { type: 'date' })) + UI.field('Hora', UI.input('time', r.time || '', { type: 'time' }), { optional: true }) + '</div>' +
        '<div class="row row--top">' + UI.field('Salida (hoteles)', UI.input('endDate', r.endDate || '', { type: 'date' }), { optional: true }) +
          UI.field('Check-out', UI.input('checkoutTime', r.checkoutTime || '', { type: 'time' }), { optional: true }) + '</div>' +
        itineraryToggle(r) +
        UI.field('Lugar', UI.input('locName', loc.name || ''), { optional: true }) + UI.field('Dirección', UI.input('address', loc.address || ''), { optional: true }) + C.coordsField(loc.coords) +
        // Lo que se enseña al taxista: cópialo de la confirmación o de Google Maps en japonés (no se traduce solo).
        UI.field('Nombre en japonés', UI.input('nameJa', r.nameJa || '', { placeholder: '例: ホテルさくら新宿' }), { optional: true }) +
        UI.field('Dirección en japonés', UI.input('addressJa', r.addressJa || '', { placeholder: '東京都新宿区…' }), { optional: true, hint: 'Cópiala de la confirmación o de Google Maps en japonés. Es lo que verá el taxista.' }) +
        UI.details('Más detalles',
          UI.field('Ciudad', UI.chips('cityId', C.cityOptions(), r.cityId, { allowNone: true, noneLabel: 'Sin ciudad' }), { optional: true }) +
          '<div class="row row--top">' + UI.field('Coste', UI.input('cost', r.cost || '', { inputmode: 'decimal' }), { optional: true }) + UI.field('Moneda', UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), r.currency || 'JPY')) + '</div>' +
          UI.field('Teléfono', UI.input('phone', r.phone || '', { type: 'tel' }), { optional: true }) + UI.field('URL', UI.input('url', r.url || '', { type: 'url' }), { optional: true }) +
          UI.field('Notas', UI.textarea('notes', r.notes), { optional: true }), !!ex),
      onMount: (form) => C.bindCoords(form, () => { const f = UI.formData(form); return [f.locName || f.name, f.address].filter(Boolean).join(', '); }),
      onDelete: ex ? async () => { if (!(await UI.confirm('¿Eliminar reserva?', ex.name))) return false; S.remove('reservations', ex.id); if (location.hash.indexOf(ex.id) > -1) history.back(); return true; } : null,
      onSave: function (f) {
        const cost = f.cost ? U.parseAmount(f.cost) : undefined;
        if (!f.name) return 'Escribe un nombre';
        if (!U.isISODate(f.date)) return 'Fecha no válida';
        if (f.endDate && f.endDate < f.date) return 'La salida es anterior a la entrada';
        if (cost === null) return 'Coste no válido';
        if (f.coords && !C.parseCoords(f.coords)) return 'Coordenadas no válidas';
        const location = f.locName || f.address || f.coords ? { name: f.locName || undefined, address: f.address || undefined, coords: C.parseCoords(f.coords) } : undefined;
        const data = { type: f.type, name: f.name, confirmationCode: f.confirmationCode || undefined, date: f.date, time: f.time || undefined, endDate: f.endDate || undefined, checkoutTime: f.endDate && f.checkoutTime ? f.checkoutTime : undefined, location: location, cityId: f.cityId || undefined, cost: cost || undefined, currency: cost ? f.currency : undefined, phone: f.phone || undefined, url: f.url || undefined, notes: f.notes || undefined, inItinerary: f.inItinerary ? undefined : false,
          nameJa: f.nameJa || undefined, addressJa: f.addressJa || undefined };
        const rid = ex ? ex.id : S.create('reservations', data);
        if (ex) S.update('reservations', ex.id, data);
        savedToast('Reserva guardada', 'reservations', rid);
      }
    });
  };
  A.newReservation = (el) => F.reservation(null, { type: el.dataset.type, date: el.dataset.date, name: el.dataset.name, cityId: el.dataset.city });
  A.editReservation = (el) => F.reservation(el.dataset.id);

  /* ══ TRANSPORTE ══════════════════════════════════════════════ */

  V.transport = function () {
    const list = Object.values(S.get().transports).sort((a, b) => a.date.localeCompare(b.date) || U.cmpTime(a.departTime, b.departTime));
    const g = {};
    list.forEach((t) => (g[t.date] = (g[t.date] || []).concat(t)));
    return { html: UI.header({ back: true, title: 'Transporte', subtitle: 'Vuelos, trenes, Shinkansen, metro, bus y taxi', actions: UI.iconBtn('plus', 'Nuevo trayecto', { act: 'newTransport' }) }) +
      (list.length ? Object.keys(g).map((d) => UI.section(U.fmtDay(d), g[d].map(C.transportCard).join(''))).join('')
        : UI.empty('🚄', 'Sin trayectos', 'Apunta vuelos y trenes con hora, número y asiento.', UI.btn('Añadir trayecto', { data: { act: 'newTransport' } }))) };
  };

  /* Escalas: cada una con aeropuerto/estación, llegada, salida y el nº del siguiente vuelo.
     Las horas son locales de la escala, así que la espera (salida − llegada) es exacta. */
  function stopBlock(st, i) {
    const dt = (d, t) => (d && t ? d + 'T' + t : '');
    return '<fieldset class="stop card stack-sm" data-stop>' +
      '<div class="row row--between"><strong class="small">Escala <span data-stop-n>' + (i + 1) + '</span></strong>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-stop-del>' + U.icon('trash', 16) + '<span>Quitar</span></button></div>' +
      UI.field('Aeropuerto o estación', UI.input('stop_place', st.place || '', { placeholder: 'Doha (DOH)' })) +
      // Una debajo de otra: en el móvil, fecha + hora no caben en media fila.
      UI.field('Llegas', UI.input('stop_arr', dt(st.arriveDate, st.arriveTime), { type: 'datetime-local' })) +
      UI.field('Sales', UI.input('stop_dep', dt(st.departDate, st.departTime), { type: 'datetime-local' })) +
      '<small class="muted" data-stop-wait></small>' +
      UI.field('Nº del siguiente vuelo / tren', UI.input('stop_num', st.number || ''), { optional: true }) + '</fieldset>';
  }

  /** Lee las escalas del formulario (campos repetidos → listas alineadas). Devuelve { stops } o { error }. */
  function readStops(f) {
    const all = (k) => (f[k] === undefined ? [] : [].concat(f[k]));
    const places = all('stop_place'), arr = all('stop_arr'), dep = all('stop_dep'), num = all('stop_num');
    const stops = [];
    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      if (!place && !arr[i] && !dep[i]) continue;
      if (!place) return { error: 'Indica el aeropuerto o estación de la escala ' + (i + 1) };
      if (!arr[i] || !dep[i]) return { error: 'Indica cuándo llegas y cuándo sales de ' + place };
      const a = arr[i].split('T'), d = dep[i].split('T');
      const st = { place: place, arriveDate: a[0], arriveTime: a[1].slice(0, 5), departDate: d[0], departTime: d[1].slice(0, 5), number: num[i] || undefined };
      if (L.stopWait(st) < 0) return { error: 'En ' + place + ' sales antes de llegar: revisa las fechas' };
      stops.push(st);
    }
    return { stops: stops };
  }

  F.transport = function (id) {
    const s = S.get(), ex = id ? s.transports[id] : null;
    const t = ex || { kind: 'shinkansen', date: s.trip.startDate, currency: 'JPY' };
    return formSheet({
      id: 'fTr', title: ex ? 'Editar trayecto' : 'Nuevo trayecto',
      body: UI.chips('kind', D.options(D.TRANSPORT), t.kind) +
        '<div class="row row--top">' + UI.field('Origen', UI.input('origin', t.origin || '', { placeholder: 'Tokyo', autofocus: !ex })) + UI.field('Destino final', UI.input('destination', t.destination || '', { placeholder: 'Kyoto' })) + '</div>' +
        '<div class="row row--top">' + UI.field('Fecha de salida', UI.input('date', t.date, { type: 'date' })) + UI.field('Fecha de llegada', UI.input('arriveDate', t.arriveDate || '', { type: 'date' }), { optional: true, hint: 'Sólo si llegas otro día.' }) + '</div>' +
        '<div class="row row--top">' + UI.field('Salida', UI.input('departTime', t.departTime || '', { type: 'time' }), { optional: true }) + UI.field('Llegada final', UI.input('arriveTime', t.arriveTime || '', { type: 'time' }), { optional: true }) + '</div>' +
        '<div class="row row--top">' + UI.field('Nº tren / vuelo', UI.input('number', t.number || ''), { optional: true, hint: 'El del primer tramo.' }) + UI.field('Asiento', UI.input('seat', t.seat || ''), { optional: true }) + '</div>' +
        '<div class="stack-sm"><span class="field__label">Escalas / transbordos <em>· opcional</em></span><div class="stack-sm" data-stops>' + (t.stops || []).map(stopBlock).join('') + '</div>' +
        '<button type="button" class="btn btn--secondary btn--sm" data-stop-add>' + U.icon('plus', 16) + '<span>Añadir escala</span></button>' +
        '<small class="faint">Pon las horas locales de cada aeropuerto, como salen en la tarjeta de embarque: la app calcula cuánto esperas.</small></div>' +
        itineraryToggle(t) +
        UI.details('Más detalles',
          UI.field('Reserva', UI.input('bookingCode', t.bookingCode || ''), { optional: true }) +
          UI.field('Duración total (min)', UI.input('durationMinutes', t.durationMinutes || '', { inputmode: 'numeric' }), { optional: true, hint: 'Trenes: si lo dejas vacío se calcula. Vuelos: escríbela tú (cada hora es local de su aeropuerto).' }) +
          '<div class="row row--top">' + UI.field('Coste', UI.input('cost', t.cost || '', { inputmode: 'decimal' }), { optional: true }) + UI.field('Moneda', UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), t.currency || 'JPY')) + '</div>' +
          UI.field('Notas', UI.textarea('notes', t.notes), { optional: true }), !!ex),
      onDelete: ex ? async () => { if (!(await UI.confirm('¿Eliminar trayecto?'))) return false; S.remove('transports', ex.id); return true; } : null,
      onMount: function (form) {
        const box = form.querySelector('[data-stops]');
        const refresh = function () {
          box.querySelectorAll('[data-stop]').forEach(function (el, i) {
            el.querySelector('[data-stop-n]').textContent = i + 1;
            const a = el.querySelector('[name="stop_arr"]').value.split('T'), d = el.querySelector('[name="stop_dep"]').value.split('T');
            const w = a[1] && d[1] ? L.stopWait({ arriveDate: a[0], arriveTime: a[1], departDate: d[0], departTime: d[1] }) : null;
            el.querySelector('[data-stop-wait]').textContent = w === null ? '' : w < 0 ? '⚠️ Sales antes de llegar: revisa las fechas' : '⏳ Espera: ' + U.fmtDur(w);
          });
        };
        form.querySelector('[data-stop-add]').addEventListener('click', function () {
          box.insertAdjacentHTML('beforeend', stopBlock({}, box.children.length));
          refresh();
          box.lastElementChild.querySelector('input').focus();
        });
        box.addEventListener('click', function (ev) {
          const del = ev.target.closest('[data-stop-del]');
          if (del) { del.closest('[data-stop]').remove(); refresh(); }
        });
        box.addEventListener('input', refresh);
        refresh();
      },
      onSave: function (f) {
        if (!f.origin || !f.destination) return 'Indica origen y destino';
        if (!U.isISODate(f.date)) return 'Fecha no válida';
        const arriveDate = f.arriveDate && f.arriveDate !== f.date ? f.arriveDate : undefined;
        if (arriveDate && arriveDate < f.date) return 'La llegada no puede ser antes de la salida';
        const st = readStops(f);
        if (st.error) return st.error;
        const cost = f.cost ? U.parseAmount(f.cost) : undefined;
        if (cost === null) return 'Coste no válido';
        let dur = f.durationMinutes ? Number(f.durationMinutes) : undefined;
        if (dur !== undefined && !(dur > 0)) return 'Duración no válida';
        // Sólo se calcula sin husos horarios de por medio: en un vuelo cada hora es local de su aeropuerto.
        if (!dur && f.kind !== 'flight' && f.departTime && f.arriveTime) {
          dur = L.minutesBetween(f.date, f.departTime, arriveDate || f.date, f.arriveTime);
          if (!arriveDate && dur < 0) dur += 1440;
          dur = dur > 0 ? dur : undefined;
        }
        const data = { kind: f.kind, origin: f.origin, destination: f.destination, date: f.date, arriveDate: arriveDate, departTime: f.departTime || undefined, arriveTime: f.arriveTime || undefined, durationMinutes: dur, number: f.number || undefined, seat: f.seat || undefined, stops: st.stops.length ? st.stops : undefined, bookingCode: f.bookingCode || undefined, cost: cost || undefined, currency: cost ? f.currency : undefined, notes: f.notes || undefined, inItinerary: f.inItinerary ? undefined : false };
        const tid = ex ? ex.id : S.create('transports', data);
        if (ex) S.update('transports', ex.id, data);
        savedToast('Trayecto guardado', 'transports', tid);
      }
    });
  };
  A.newTransport = () => F.transport(null);
  A.editTransport = (el) => F.transport(el.dataset.id);

  /* ══ NOTAS ═══════════════════════════════════════════════════ */

  V.notes = function () {
    const s = S.get(), st = JT.uiState.notes, nq = U.normalize(st.q || '');
    const list = Object.values(s.notes).filter((n) => !st.scope || n.scope === st.scope).filter((n) => !nq || U.normalize((n.title || '') + ' ' + n.body).indexOf(nq) > -1)
      .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt);
    return { html: UI.header({ back: true, title: 'Notas', actions: UI.iconBtn('plus', 'Nueva nota', { act: 'newNote', scope: st.scope }) }) +
      JT.searchBox('notes', 'Buscar en notas…') + JT.fchips('notes', 'scope', D.options(D.NOTE_SCOPE), 'Todas') +
      (list.length ? list.map((n) => C.noteCard(n)).join('') : UI.empty('🗒️', 'Sin notas', 'Apunta lo que no quieres olvidar: el último tren, recomendaciones, recordatorios…', UI.btn('Nueva nota', { data: { act: 'newNote', scope: st.scope } }))) };
  };

  function refOptions(scope) {
    const s = S.get();
    if (scope === 'city') return Object.values(s.cities).map((c) => ({ value: c.id, label: c.name }));
    if (scope === 'day') return S.sortedDays().map((d, i) => ({ value: d.id, label: 'Día ' + (i + 1) + ' · ' + U.fmtDay(d.date) }));
    if (scope === 'place') return Object.values(s.places).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: D.PLACE[p.category][1] + ' ' + p.name }));
    if (scope === 'restaurant') return Object.values(s.restaurants).sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ value: r.id, label: D.CUISINE[r.cuisine][1] + ' ' + r.name }));
    return [];
  }
  function refSelect(scope, value) {
    const opts = refOptions(scope);
    return scope === 'general' ? '' : UI.field(D.NOTE_SCOPE[scope][0], '<select class="input" name="refId"><option value="">Elegir…</option>' + opts.map((o) => '<option value="' + esc(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>');
  }

  F.note = function (id, def) {
    const s = S.get(), ex = id ? s.notes[id] : null;
    def = def || {};
    const n = ex || { scope: def.scope || 'general', refId: def.refId, pinned: false, body: '' };
    return formSheet({
      id: 'fNote', title: ex ? 'Editar nota' : 'Nueva nota',
      body: UI.field('Nota', UI.textarea('body', n.body, 'p.ej. Comprar adaptador en Tokyo', 4)) +
        UI.field('Título', UI.input('title', n.title || ''), { optional: true }) +
        UI.field('Relacionada con', UI.chips('scope', D.options(D.NOTE_SCOPE), n.scope)) + '<div class="ref-wrap">' + refSelect(n.scope, n.refId) + '</div>' +
        '<label class="chip"><input type="checkbox" name="pinned" value="1"' + (n.pinned ? ' checked' : '') + '><span>📌 Fijar arriba</span></label>',
      onMount: function (form) {
        const ta = form.querySelector('[name="body"]');
        if (!ex) setTimeout(() => ta.focus(), 80);
        form.querySelectorAll('[name="scope"]').forEach((r) => r.addEventListener('change', () => (form.querySelector('.ref-wrap').innerHTML = refSelect(r.value))));
      },
      onDelete: ex ? async () => { if (!(await UI.confirm('¿Eliminar nota?'))) return false; S.remove('notes', ex.id); return true; } : null,
      onSave: function (f) {
        if (!f.body) return 'Escribe la nota';
        if (f.scope !== 'general' && !f.refId) return 'Elige ' + D.NOTE_SCOPE[f.scope][0].toLowerCase();
        const data = { body: f.body, title: f.title || undefined, scope: f.scope, refId: f.scope === 'general' ? undefined : f.refId, pinned: !!f.pinned };
        if (ex) S.update('notes', ex.id, data); else S.create('notes', data);
        UI.toast('Nota guardada');
      }
    });
  };
  A.newNote = (el) => F.note(null, { scope: el.dataset.scope, refId: el.dataset.ref });
  A.editNote = (el) => F.note(el.dataset.id);

  /* ══ CHECKLIST ═══════════════════════════════════════════════ */

  V.checklist = function () {
    const s = S.get(), items = Object.values(s.checklistItems), done = items.filter((i) => i.done).length;
    let html = UI.header({ back: true, title: 'Checklist', subtitle: done + '/' + items.length + ' completado', actions: UI.iconBtn('plus', 'Nueva lista', { act: 'newChecklist' }) }) + UI.progress(items.length ? done / items.length : 0, 'success');
    ['before', 'luggage', 'during', 'custom'].forEach(function (sec) {
      const lists = Object.values(s.checklists).filter((c) => c.section === sec).sort((a, b) => a.order - b.order);
      if (!lists.length) return;
      html += UI.section(D.CHECK_SECTION[sec][1] + ' ' + D.CHECK_SECTION[sec][0], lists.map(function (l) {
        const its = items.filter((i) => i.checklistId === l.id).sort((a, b) => a.order - b.order);
        return UI.card('<div class="row row--between"><strong>' + esc(l.title) + '</strong><span class="row"><small class="muted">' + its.filter((i) => i.done).length + '/' + its.length + '</small>' + UI.iconBtn('trash', 'Eliminar lista ' + l.title, { act: 'delChecklist', id: l.id }, { size: 18 }) + '</span></div>' +
          its.map((i) => '<div class="check' + (i.done ? ' is-done' : '') + '"><button type="button" class="check__main" role="checkbox" aria-checked="' + i.done + '" data-act="toggleItem" data-id="' + i.id + '"><span class="check__box">' + (i.done ? U.icon('check', 14) : '') + '</span><span>' + esc(i.text) + '</span></button>' + UI.iconBtn('x', 'Quitar ' + i.text, { act: 'delItem', id: i.id }, { size: 16 }) + '</div>').join('') +
          '<form class="row check__add" data-list="' + l.id + '"><input class="input" name="text" placeholder="Añadir elemento…" aria-label="Añadir elemento a ' + esc(l.title) + '"><button type="submit" class="iconbtn accent" aria-label="Añadir">' + U.icon('plus', 22) + '</button></form>', { cls: 'stack-sm' });
      }).join(''));
    });
    return { html: html + UI.btn('Nueva checklist', { icon: 'plus', variant: 'secondary', block: true, data: { act: 'newChecklist' } }),
      mount: function (root) {
        root.querySelectorAll('.check__add').forEach((f) => f.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const t = f.querySelector('input').value.trim();
          if (!t) return;
          const n = Object.values(S.get().checklistItems).filter((i) => i.checklistId === f.dataset.list).length;
          JT.app.focusAfter = '.check__add[data-list="' + f.dataset.list + '"] input';
          S.create('checklistItems', { checklistId: f.dataset.list, text: t, done: false, order: n });
        }));
      } };
  };
  A.toggleItem = (el) => { const i = S.get().checklistItems[el.dataset.id]; S.update('checklistItems', i.id, { done: !i.done }); };
  A.delItem = (el) => S.remove('checklistItems', el.dataset.id);
  A.delChecklist = async (el) => { const l = S.get().checklists[el.dataset.id]; if (await UI.confirm('¿Eliminar «' + l.title + '»?', 'Se borrarán sus elementos.')) S.remove('checklists', l.id); };
  A.newChecklist = () => formSheet({
    id: 'fCl', title: 'Nueva checklist', saveLabel: 'Crear',
    body: UI.field('Nombre', UI.input('title', '', { placeholder: 'p.ej. Onsen', autofocus: true })) + UI.chips('section', D.options(D.CHECK_SECTION), 'custom'),
    onSave: (f) => { if (!f.title) return 'Escribe un nombre'; S.create('checklists', { title: f.title, section: f.section, order: Object.keys(S.get().checklists).length }); }
  });

  /* ══ REGALOS ═════════════════════════════════════════════════
     Para quién, qué idea, dónde comprarlo y si ya está comprado.
     Al marcarlo como comprado ofrece apuntarlo en Gastos (enlazado
     con giftId, como las reservas), para no escribirlo dos veces. */

  const giftExpense = (id) => Object.values(S.get().expenses).find((e) => e.giftId === id) || null;

  /** Regalos por comprar en una ciudad (para avisar cuando estás allí). */
  function giftsPendingIn(cityId) {
    return cityId ? Object.values(S.get().gifts).filter((g) => !g.bought && g.cityId === cityId) : [];
  }
  JT.cards.giftsPendingIn = giftsPendingIn;

  /** Tarjeta de un regalo: todo a la vista (idea, notas, dónde, precio y si está en Gastos). */
  function giftCard(x) {
    const s = S.get(), city = x.cityId && s.cities[x.cityId], ex = giftExpense(x.id);
    const pills = (city ? UI.pill(city.name, 'neutral', 'pin') : '') +
      (x.cost ? UI.pill((x.bought ? '' : '~') + U.money(x.cost, x.currency || 'JPY'), 'neutral') : '') +
      (ex ? UI.pill('En Gastos ✓', 'success') : x.bought ? UI.pill('Sin apuntar en Gastos', 'warn') : '');
    return '<div class="card gift' + (x.bought ? ' is-bought' : '') + '">' +
      '<button type="button" class="gift__check" data-act="toggleGift" data-id="' + x.id + '" aria-pressed="' + !!x.bought + '" aria-label="' + esc((x.bought ? 'Comprado: ' : 'Marcar comprado: ') + x.idea) + '"><span class="check__box">' + U.icon('check', 14) + '</span></button>' +
      '<button type="button" class="gift__main" data-act="editGift" data-id="' + x.id + '">' +
        '<span class="gift__idea">' + esc(x.idea) + '</span>' +
        (x.notes ? '<span class="gift__notes">' + esc(x.notes) + '</span>' : '') +
        (pills ? '<span class="pills">' + pills + '</span>' : '') + '</button></div>';
  }

  V.gifts = function () {
    const s = S.get(), t = S.today(), st = JT.uiState.gifts || (JT.uiState.gifts = { show: 'all' });
    const all = Object.values(s.gifts).sort((a, b) => a.bought - b.bought || (a.createdAt || 0) - (b.createdAt || 0));
    const bought = all.filter((g) => g.bought).length;
    const head = UI.header({ back: true, title: 'Regalos', subtitle: all.length ? bought + ' de ' + all.length + ' comprados' : 'Para quién, qué y dónde', actions: UI.iconBtn('plus', 'Nuevo regalo', { act: 'newGift' }) });
    if (!all.length) return { html: head + UI.empty('🎁', 'Sin regalos apuntados', 'Apunta para quién quieres traer algo, una idea y notas (talla, color, tienda…). Al comprarlo, se apunta en Gastos con un toque.', UI.btn('Añadir regalo', { data: { act: 'newGift' } })) };
    const spent = C.moneySum(all.map((g) => giftExpense(g.id)).filter(Boolean));
    const pendingCost = C.moneySum(all.filter((g) => !g.bought && g.cost).map((g) => ({ amount: g.cost, currency: g.currency || 'JPY' })));
    let html = head + UI.card('<div class="stats">' + UI.stat('Comprados', bought + ' / ' + all.length, '', true) + UI.stat('Gastado', spent.total ? spent.text : '—') + UI.stat('Falta (aprox.)', pendingCost.total ? pendingCost.text : '—') + '</div>' +
      UI.progress(bought / all.length, 'success'), { cls: 'stack' });
    // Durante el viaje: lo que toca comprar en la ciudad donde estás.
    const here = t.phase === 'during' && t.city ? giftsPendingIn(t.city.id) : [];
    if (here.length) html += UI.banner('accent', 'gift', 'En ' + t.city.name + ': ' + here.length + (here.length === 1 ? ' regalo por comprar' : ' regalos por comprar'), here.map((g) => g.idea + (g.person ? ' (' + g.person + ')' : '')).join(' · '));
    html += '<div class="seg" role="tablist">' + [['all', 'Todos'], ['pending', 'Por comprar · ' + (all.length - bought)], ['bought', 'Comprados · ' + bought]].map((o) =>
      '<button type="button" role="tab" class="seg__item' + (st.show === o[0] ? ' is-on' : '') + '" aria-selected="' + (st.show === o[0]) + '" data-act="giftShow" data-value="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    const list = all.filter((g) => st.show === 'all' || (st.show === 'bought' ? g.bought : !g.bought));
    if (!list.length) return { html: html + '<p class="muted center">' + (st.show === 'bought' ? 'Aún no has comprado ninguno.' : 'Todo comprado 🎉') + '</p>' };
    const people = {};
    list.forEach((g) => { const k = (g.person || '').trim() || 'Sin asignar'; (people[k] = people[k] || []).push(g); });
    const total = (p) => all.filter((g) => ((g.person || '').trim() || 'Sin asignar') === p);
    html += Object.keys(people).sort((a, b) => (a === 'Sin asignar') - (b === 'Sin asignar') || a.localeCompare(b, 'es')).map(function (p, i) {
      const mine = total(p), done = mine.filter((x) => x.bought).length;
      const tone = ['indigo', 'pink', 'teal', 'orange', 'violet', 'blue', 'green', 'amber'][i % 8];
      return '<section class="section"><div class="section__hdr"><h2 class="gift__person"><span class="avatar tone-' + tone + '" aria-hidden="true">' + esc(p.charAt(0).toUpperCase()) + '</span>' + esc(p) + '</h2>' +
        '<small class="' + (done === mine.length ? 'success' : 'muted') + '">' + (done === mine.length ? '✓ Todo comprado' : done + ' de ' + mine.length) + '</small></div>' +
        people[p].map(giftCard).join('') + '</section>';
    }).join('');
    return { html: html };
  };
  A.giftShow = (el) => { (JT.uiState.gifts || (JT.uiState.gifts = {})).show = el.dataset.value; JT.app.render(); };

  A.toggleGift = async function (el) {
    const g = S.get().gifts[el.dataset.id];
    if (!g) return;
    S.update('gifts', g.id, { bought: !g.bought });
    if (g.bought || giftExpense(g.id)) return; // desmarcado, o ya estaba en Gastos
    if (await UI.confirm('¡Comprado! 🎁', '¿Lo apuntas también en Gastos?', { ok: 'Apuntar en Gastos', danger: false })) {
      F.expense(null, { amount: g.cost, currency: g.currency || 'JPY', category: 'gifts', description: 'Regalo · ' + (g.person ? g.person + ': ' : '') + g.idea, cityId: g.cityId, giftId: g.id });
    }
  };

  F.gift = function (id) {
    const s = S.get(), ex = id ? s.gifts[id] : null, t = S.today();
    const g = ex || { person: '', idea: '', currency: 'JPY', cityId: t.phase === 'during' && t.city ? t.city.id : undefined };
    const people = Array.from(new Set(Object.values(s.gifts).map((x) => (x.person || '').trim()).filter(Boolean))).sort();
    const ex2 = ex && giftExpense(ex.id);
    return formSheet({
      id: 'fGift', title: ex ? 'Editar regalo' : 'Nuevo regalo',
      body: UI.field('Para quién', '<input class="input" name="person" list="giftPeople" value="' + esc(g.person || '') + '" placeholder="p.ej. Mamá"' + (ex ? '' : ' autofocus') + ' autocomplete="off"><datalist id="giftPeople">' + people.map((p) => '<option value="' + esc(p) + '">').join('') + '</datalist>') +
        UI.field('Idea', UI.input('idea', g.idea || '', { placeholder: 'p.ej. Té matcha de Uji' })) +
        UI.field('Notas', UI.textarea('notes', g.notes || '', 'Talla, color, marca, tienda, foto que te enseñaron…'), { optional: true, hint: 'Se ven en la lista, debajo de la idea.' }) +
        '<div class="row row--top">' + UI.field('Precio', UI.input('cost', g.cost ? String(g.cost).replace('.', ',') : '', { inputmode: 'decimal', placeholder: 'aprox.' }), { optional: true }) + UI.field('Moneda', UI.chips('currency', D.CURRENCIES.map((c) => ({ value: c, label: c })), g.currency || 'JPY')) + '</div>' +
        UI.field('Dónde comprarlo', UI.chips('cityId', C.cityOptions(), g.cityId, { allowNone: true, noneLabel: 'Donde sea' }), { optional: true }) +
        UI.chipsMulti('bought', [{ value: '1', label: '✓ Ya comprado' }], g.bought ? ['1'] : []) +
        (ex2 ? UI.listRow({ icon: 'wallet', title: U.money(ex2.amount, ex2.currency), sub: 'Apuntado en Gastos · toca para verlo', data: { act: 'editExpense', id: ex2.id } }) : ''),
      onDelete: ex ? async () => { if (!(await UI.confirm('¿Eliminar regalo?', ex.idea))) return false; S.remove('gifts', ex.id); return true; } : null,
      onSave: function (f) {
        const cost = f.cost ? U.parseAmount(f.cost) : undefined;
        if (!f.idea) return 'Escribe una idea';
        if (cost === null) return 'Precio no válido';
        const data = { person: (f.person || '').trim() || undefined, idea: f.idea, cost: cost || undefined, currency: cost ? f.currency : undefined, cityId: f.cityId || undefined, bought: !!f.bought, notes: f.notes || undefined };
        if (ex) S.update('gifts', ex.id, data); else S.create('gifts', data);
        UI.toast('Regalo guardado');
      }
    });
  };
  A.newGift = () => F.gift(null);
  A.editGift = (el) => F.gift(el.dataset.id);

  /* ══ INFORMACIÓN ÚTIL ════════════════════════════════════════ */

  V.info = function () {
    const s = S.get(), list = Object.values(s.infoArticles).sort((a, b) => a.order - b.order), rates = SV.rates();
    const jpyEur = U.convert(1, 'JPY', 'EUR', rates);
    const conv = UI.card('<small class="eyebrow muted">💱 CONVERSOR JPY → EUR</small>' + (jpyEur
      ? '<input class="input" inputmode="decimal" value="1000" data-input="convJpy" data-rate="' + jpyEur + '" aria-label="Yenes"><h2 class="title" id="convOut">' + U.money(1000, 'JPY') + ' ≈ ' + U.money(1000 * jpyEur, 'EUR') + '</h2><small class="faint">' + (rates.source === 'manual' ? 'Tipo manual' : 'BCE' + (rates.date ? ' · ' + rates.date : '') + (rates.rounding ? ' · yen redondeado al alza' : '')) + '</small>'
      : '<p class="muted">Sin tipo de cambio: conéctate una vez para descargarlo (se guarda para usarlo sin conexión).</p>'), { tone: 'muted', cls: 'stack-sm' });
    return { html: UI.header({ back: true, title: 'Información útil', actions: UI.iconBtn('plus', 'Nueva ficha', { act: 'newInfo' }) }) +
      UI.banner('neutral', 'info', 'Orientativo, no oficial', 'Verifica normativa y datos vigentes en fuentes oficiales (JNTO, embajada, aerolínea). Puedes editar cada ficha.') + conv +
      list.map((a) => '<details class="card info"><summary><span aria-hidden="true">' + esc(a.icon) + '</span><strong class="grow">' + esc(a.title) + '</strong>' + U.icon('down', 16) + '</summary><p class="pre">' + esc(a.body) + '</p>' + UI.btn('Editar', { icon: 'edit', size: 'sm', variant: 'ghost', data: { act: 'editInfo', id: a.id } }) + '</details>').join('') };
  };
  JT.changes.convJpy = function (el) {
    const n = Number(el.value.replace(',', '.')) || 0, out = document.getElementById('convOut');
    if (out) out.textContent = U.money(n, 'JPY') + ' ≈ ' + U.money(n * Number(el.dataset.rate), 'EUR');
  };

  F.info = function (id) {
    const ex = id ? S.get().infoArticles[id] : null, a = ex || { icon: '📌', title: '', body: '' };
    return formSheet({
      id: 'fInfo', title: ex ? 'Editar ficha' : 'Nueva ficha',
      body: '<div class="row row--top"><div style="width:80px">' + UI.field('Icono', UI.input('icon', a.icon)) + '</div>' + UI.field('Título', UI.input('title', a.title)) + '</div>' + UI.field('Contenido', UI.textarea('body', a.body, '', 10)),
      onDelete: ex ? async () => { if (!(await UI.confirm('¿Eliminar ficha?', ex.title))) return false; S.remove('infoArticles', ex.id); return true; } : null,
      onSave: function (f) {
        if (!f.title || !f.body) return 'Escribe título y contenido';
        const data = { icon: f.icon || '📌', title: f.title, body: f.body };
        if (ex) S.update('infoArticles', ex.id, data); else S.create('infoArticles', Object.assign(data, { order: Object.keys(S.get().infoArticles).length }));
      }
    });
  };
  A.newInfo = () => F.info(null);
  A.editInfo = (el) => F.info(el.dataset.id);

  /* ══ FRASES ══════════════════════════════════════════════════ */

  V.phrases = function () {
    const s = S.get(), st = JT.uiState.phrases, q = (st.q || '').trim(), nq = U.normalize(q);
    const all = Object.values(s.phrases);
    // Categorías en el orden de la lista de serie (las nuevas, como «No hablo japonés», justo después de Básicas); las tuyas al final.
    const ORDER = Array.from(new Set(D.PHRASES.map((p) => p[0]))), rank = (c) => (ORDER.indexOf(c) > -1 ? ORDER.indexOf(c) : 999);
    const cats = Array.from(new Set(all.map((p) => p.category))).sort((a, b) => rank(a) - rank(b));
    const list = all.filter((p) => !st.cat || (st.cat === 'fav' ? p.favorite : p.category === st.cat))
      .filter((p) => !nq || U.normalize(p.es + ' ' + p.romaji).indexOf(nq) > -1 || p.ja.indexOf(q) > -1);
    const g = {};
    list.forEach((p) => (g[p.category] = (g[p.category] || []).concat(p)));
    return { html: UI.header({ back: true, title: 'Frases', subtitle: 'Funciona sin conexión · toca una frase para verla en grande', actions: UI.iconBtn('plus', 'Nueva frase', { act: 'newPhrase' }) }) +
      JT.searchBox('phrases', 'Buscar en español o romaji…') + JT.fchips('phrases', 'cat', [{ value: 'fav', label: '♥ Favoritas' }].concat(cats.map((c) => ({ value: c, label: c }))), 'Todas') +
      Object.keys(g).sort((a, b) => rank(a) - rank(b)).map((c) => UI.section(c, g[c].map((p) => '<div class="card card--tap phrase" tabindex="0" data-act="bigPhrase" data-id="' + p.id + '"><div class="grow"><small class="muted">' + esc(p.es) + '</small><div class="phrase__ja">' + esc(p.ja) + '</div><span class="accent">' + esc(p.romaji) + '</span></div>' +
        '<div class="phrase__acts">' + C.speakBtn(p.ja) + '<button type="button" class="iconbtn fav' + (p.favorite ? ' is-on' : '') + '" aria-pressed="' + !!p.favorite + '" aria-label="Favorita" data-act="fav" data-col="phrases" data-id="' + p.id + '">' + U.icon('heart', 20) + '</button></div></div>').join(''))).join('') };
  };
  A.bigPhrase = function (el) {
    const p = S.get().phrases[el.dataset.id];
    const voice = SV.canSpeak();
    // Al girar el móvil a horizontal con la frase abierta, pasa sola a pantalla completa (y vuelve al girarlo de nuevo).
    // Se mira con «resize» además de matchMedia: algunos navegadores no avisan del cambio de orientación.
    const mq = window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;
    let rotated = null, wasLandscape = window.innerWidth > window.innerHeight;
    const onRotate = function () {
      const land = window.innerWidth > window.innerHeight;
      if (land === wasLandscape) return;
      wasLandscape = land;
      if (land && !rotated && !document.querySelector('.showcase')) rotated = C.showcase({ ja: p.ja, sub: p.romaji, es: p.es }, { fullscreen: false, onClose: () => (rotated = null) });
      else if (!land && rotated) rotated();
    };
    const close = UI.sheet({ title: p.es, body: '<div class="bigphrase" lang="ja">' + esc(p.ja) + '</div><p class="title accent center">' + esc(p.romaji) + '</p>' +
        '<div class="row row--center row--wrap">' + (voice ? UI.btn('Escuchar', { icon: 'speaker', variant: 'secondary', data: { act: 'speak', text: p.ja } }) + UI.btn('Despacio', { icon: 'speaker', variant: 'ghost', data: { act: 'speak', text: p.ja, slow: '1' } }) : '') +
          UI.btn('Pantalla completa', { icon: 'expand', variant: 'ghost', data: { act: 'showcase', ja: p.ja, sub: p.romaji, es: p.es } }) + '</div>' +
        '<p class="faint small center">Consejo: gira el móvil y la frase ocupará toda la pantalla.</p>',
      footer: '<div class="row">' + UI.btn('Copiar', { icon: 'copy', variant: 'secondary', block: true, data: { cp: '1' } }) + (p.isCustom ? UI.btn('Eliminar', { icon: 'trash', variant: 'danger', data: { rm: '1' } }) : '') + '</div>',
      onClose: function () { if (mq && mq.removeEventListener) mq.removeEventListener('change', onRotate); window.removeEventListener('resize', onRotate); if (rotated) rotated(); },
      onMount: function (root) {
        if (mq && mq.addEventListener) mq.addEventListener('change', onRotate);
        window.addEventListener('resize', onRotate);
        root.querySelector('[data-cp]').addEventListener('click', async () => { await SV.copy(p.ja); UI.toast('Copiado'); });
        const rm = root.querySelector('[data-rm]');
        if (rm) rm.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar frase?', p.es)) { S.remove('phrases', p.id); close(); } });
      } });
  };
  /** 🔊 Lee en japonés con la voz del móvil. */
  let voiceHintShown = false;
  A.speak = function (el) {
    const r = SV.speak(el.dataset.text, el.dataset.slow === '1');
    if (r === 'unsupported') UI.toast('Este navegador no puede leer en voz alta');
    else if (r === 'novoice' && !voiceHintShown) {
      voiceHintShown = true;
      UI.alert('Falta la voz japonesa', 'Tu móvil no tiene instalada la voz en japonés.\n\nEn Android, busca «texto a voz» en los Ajustes del móvil → Motor de Google → Instalar datos de voz → Japonés (日本語).\n\nDescárgala con wifi antes del viaje y funcionará también sin conexión.');
    }
  };

  A.newPhrase = () => formSheet({
    id: 'fPh', title: 'Nueva frase',
    body: UI.field('En español', UI.input('es', '', { autofocus: true })) + UI.field('En japonés', UI.input('ja', '')) + UI.field('Pronunciación (romaji)', UI.input('romaji', ''), { optional: true }),
    onSave: (f) => { if (!f.es || !f.ja) return 'Escribe la frase en español y en japonés'; S.create('phrases', { es: f.es, ja: f.ja, romaji: f.romaji, category: 'Mis frases', favorite: true, isCustom: true }); }
  });

  /* ══ DOCUMENTOS (cofre cifrado para lo sensible) ═════════════ */

  /* ══ EMERGENCIA ══════════════════════════════════════════════
     Ficha para enseñar a un médico, a la policía o en un restaurante:
     lo importante en japonés y en grande. Se guarda SIN cifrar a
     propósito, para verla sin PIN; por eso no admite pasaporte ni
     tarjetas (eso va en Documentos, cifrado). */

  const BLOOD = ['A', 'B', 'AB', 'O'];

  V.emergency = function () {
    const s = S.get(), e = s.emergency || {}, me = Object.values(s.travelers).find((t) => t.isMe);
    const allergens = D.ALLERGENS.filter((a) => (e.allergies || []).indexOf(a[0]) > -1);
    const tel = (n) => 'tel:' + String(n).replace(/[^\d+]/g, '');
    const row = (ja, romaji, es, value, phone) => value ? '<div class="sos__row"><div class="sos__label"><span lang="ja">' + ja + '</span><small>' + esc(romaji) + ' · ' + esc(es) + '</small></div>' +
      '<div class="sos__value">' + esc(value) + (phone ? ' <a class="btn btn--secondary btn--sm" href="' + esc(tel(phone)) + '">' + U.icon('phone', 16) + '<span>Llamar</span></a>' : '') + '</div></div>' : '';
    const filled = allergens.length || e.allergyOther || e.conditions || e.meds || e.blood || e.insurer || e.contactName || e.embassyPhone;

    let html = UI.header({ back: true, eyebrow: '緊急時の情報 · KINKYŪJI NO JŌHŌ', title: 'Emergencia', subtitle: 'Enséñala si necesitas ayuda', actions: UI.iconBtn('edit', 'Editar ficha', { act: 'editEmergency' }) });
    html += UI.section('Llamar', UI.card(D.EMERGENCY_NUMBERS.map((x) => '<a class="lr lr--tap" href="' + esc(tel(x[0])) + '"><span class="lr__icon">' + U.icon('phone', 18) + '</span><span class="lr__text"><span class="lr__title mono">' + esc(x[0]) + '</span><span class="lr__sub">' + esc(x[1]) + '</span></span></a>').join(''), { cls: 'card--list' }));
    if (!filled) {
      html += UI.empty('🩺', 'Rellena tu ficha', 'Alergias, medicación, grupo sanguíneo, seguro y a quién avisar. Se verá aquí en japonés y en grande.', UI.btn('Rellenar ficha', { icon: 'edit', data: { act: 'editEmergency' } }));
    } else {
      html += UI.card((me ? '<div class="sos__who">' + esc(me.name) + '</div>' : '') +
        (allergens.length || e.allergyOther ? '<div class="sos__alert" lang="ja"><div class="row row--between"><p>次のものにアレルギーがあります：</p>' + (allergens.length ? C.speakBtn('次のものにアレルギーがあります。' + allergens.map((a) => a[2]).join('、'), 'Escuchar las alergias') : '') + '</div><strong>' + esc(allergens.map((a) => a[2]).join('、') || e.allergyOther) + '</strong>' +
          '<small>Tengo alergia a: ' + esc(allergens.map((a) => a[1]).concat(e.allergyOther && allergens.length ? [e.allergyOther] : []).join(', ')) + '</small></div>' : '') +
        row('持病', 'Jibyō', 'Enfermedades', e.conditions) + row('服用中の薬', 'Fukuyō-chū no kusuri', 'Medicación', e.meds) +
        row('血液型', 'Ketsueki-gata', 'Grupo sanguíneo', e.blood ? e.blood + (e.rh ? ' Rh' + e.rh : '') + '型' : '') +
        row('保険', 'Hoken', 'Seguro', [e.insurer, e.policy].filter(Boolean).join(' · '), e.insurerPhone) +
        row('緊急連絡先', 'Kinkyū renrakusaki', 'Contacto de emergencia', [e.contactName, e.contactPhone].filter(Boolean).join(' · '), e.contactPhone) +
        row('大使館', 'Taishikan', 'Embajada / consulado', e.embassyPhone, e.embassyPhone), { cls: 'stack sos' });
    }
    html += UI.section('Frases para pedir ayuda', UI.card([['助けて！', 'Tasukete!', '¡Ayuda!'], ['救急車を呼んでください', 'Kyūkyūsha o yonde kudasai', 'Llame a una ambulancia'], ['病院に連れて行ってください', 'Byōin ni tsurete itte kudasai', 'Lléveme a un hospital']]
      .map((p) => '<div class="row"><div class="sos__phrase grow"><span lang="ja">' + p[0] + '</span><small>' + esc(p[1]) + ' · ' + esc(p[2]) + '</small></div>' + C.speakBtn(p[0]) + '</div>').join(''), { cls: 'stack' }));
    html += '<p class="faint small">Esta ficha se guarda sin cifrar para poder verla sin PIN en una emergencia. No pongas aquí el pasaporte ni tarjetas: eso va en Documentos, cifrado.</p>';
    return { html: html };
  };

  /* ── Mis alergias: para enseñar en un restaurante, a pantalla completa ── */

  /** Alergias de la ficha: { list: [[key, es, ja, romaji]], other } o null si no hay ninguna. */
  function myAllergies() {
    const e = S.get().emergency || {};
    const list = D.ALLERGENS.filter((a) => (e.allergies || []).indexOf(a[0]) > -1);
    return list.length || e.allergyOther ? { list: list, other: e.allergyOther || '' } : null;
  }
  JT.cards.hasAllergies = () => !!myAllergies();

  A.allergyCard = function () {
    const al = myAllergies();
    if (!al) {
      return UI.sheet({ title: 'Mis alergias', body: UI.empty('🥜', 'No hay alergias en tu ficha', 'Añádelas en la ficha de emergencia y aquí saldrán en japonés, listas para enseñar en un restaurante.'),
        footer: UI.btn('Rellenar ficha', { icon: 'edit', block: true, data: { act: 'editEmergency' } }) });
    }
    const ja = al.list.map((a) => a[2]).join('、'), romaji = al.list.map((a) => a[3]).join(', '), es = al.list.map((a) => a[1].toLowerCase()).join(', ');
    // Frases montadas con tus alergias (gramática fija: «この料理に X は入っていますか？»).
    const phrases = ja ? [
      ['この料理に' + ja + 'は入っていますか？', 'Kono ryōri ni ' + romaji + ' wa haitte imasu ka?', '¿Este plato lleva ' + es + '?'],
      [ja + 'が入っていない料理はありますか？', romaji + ' ga haitte inai ryōri wa arimasu ka?', '¿Tienen algún plato sin ' + es + '?'],
      ['少しでも食べられません', 'Sukoshi demo taberaremasen', 'No puedo comer ni un poco']
    ] : [];
    const main = (ja ? '次のものにアレルギーがあります：\n' + ja : '');
    UI.sheet({
      title: 'Mis alergias',
      body: (ja ? '<div class="sos__alert" lang="ja"><p>次のものにアレルギーがあります：</p><strong>' + esc(ja) + '</strong><small>Tengo alergia a: ' + esc(es) + '</small></div>' : '') +
        (al.other ? UI.banner('warn', 'alert', 'También: ' + al.other, 'Esto no está traducido (lo escribiste tú): enséñalo con el traductor del móvil.') : '') +
        phrases.map((p) => '<div class="card stack-sm"><div class="row row--top"><div class="grow"><div class="phrase__ja" lang="ja">' + esc(p[0]) + '</div><span class="accent small">' + esc(p[1]) + '</span><small class="muted block">' + esc(p[2]) + '</small></div>' +
          C.speakBtn(p[0]) + UI.iconBtn('expand', 'Pantalla completa', { act: 'showcase', ja: p[0], sub: p[1], es: p[2] }, { size: 20 }) + '</div></div>').join(''),
      footer: '<div class="row">' + (main ? UI.btn('Enseñar a pantalla completa', { icon: 'expand', block: true, data: { act: 'showcase', ja: main, sub: 'Tengo alergia a: ' + es, es: 'Mis alergias' } }) : '') +
        UI.btn('Editar', { icon: 'edit', variant: 'secondary', data: { act: 'editEmergency' } }) + '</div>'
    });
  };

  F.emergency = function () {
    const e = S.get().emergency || {};
    return formSheet({
      id: 'fSos', title: 'Ficha de emergencia',
      body: UI.field('Alergias', UI.chipsMulti('allergies', D.ALLERGENS.map((a) => ({ value: a[0], label: a[1] })), e.allergies || []), { optional: true, hint: 'Salen en japonés en la ficha.' }) +
        UI.field('Otra alergia', UI.input('allergyOther', e.allergyOther || '', { placeholder: 'Escríbela como la diría un médico' }), { optional: true }) +
        UI.field('Enfermedades', UI.textarea('conditions', e.conditions, 'p.ej. asma, diabetes'), { optional: true }) +
        UI.field('Medicación', UI.textarea('meds', e.meds, 'Nombre del medicamento y dosis'), { optional: true }) +
        '<div class="row row--top">' + UI.field('Grupo sanguíneo', UI.chips('blood', BLOOD.map((b) => ({ value: b, label: b })), e.blood, { allowNone: true, noneLabel: '—' }), { optional: true }) +
        UI.field('Rh', UI.chips('rh', [{ value: '+', label: '+' }, { value: '-', label: '−' }], e.rh, { allowNone: true, noneLabel: '—' }), { optional: true }) + '</div>' +
        UI.field('Seguro de viaje', UI.input('insurer', e.insurer || '', { placeholder: 'Compañía' }), { optional: true }) +
        '<div class="row row--top">' + UI.field('Nº de póliza', UI.input('policy', e.policy || ''), { optional: true }) + UI.field('Teléfono del seguro', UI.input('insurerPhone', e.insurerPhone || '', { type: 'tel' }), { optional: true }) + '</div>' +
        '<div class="row row--top">' + UI.field('Contacto de emergencia', UI.input('contactName', e.contactName || '', { placeholder: 'Nombre' }), { optional: true }) + UI.field('Su teléfono', UI.input('contactPhone', e.contactPhone || '', { type: 'tel' }), { optional: true }) + '</div>' +
        UI.field('Teléfono de la embajada o consulado', UI.input('embassyPhone', e.embassyPhone || '', { type: 'tel' }), { optional: true, hint: 'Búscalo en exteriores.gob.es → Embajada de España en Tokio. No lo ponemos nosotros para no darte un número desactualizado.' }),
      onSave: function (f) {
        S.setEmergency({ allergies: UI.list(f.allergies), allergyOther: f.allergyOther || undefined, conditions: f.conditions || undefined, meds: f.meds || undefined, blood: f.blood || undefined, rh: f.rh || undefined,
          insurer: f.insurer || undefined, policy: f.policy || undefined, insurerPhone: f.insurerPhone || undefined, contactName: f.contactName || undefined, contactPhone: f.contactPhone || undefined, embassyPhone: f.embassyPhone || undefined });
        UI.toast('Ficha de emergencia guardada');
      }
    });
  };
  A.editEmergency = () => F.emergency();

  V.documents = function () {
    const s = S.get(), list = Object.values(s.docs).sort((a, b) => a.title.localeCompare(b.title));
    const unlocked = SV.vaultUnlocked();
    let html = UI.header({ back: true, title: 'Documentos', subtitle: 'Datos importantes del viaje', actions: UI.iconBtn('plus', 'Nuevo dato', { act: 'newDoc' }) });
    html += UI.banner('accent', 'sos', 'Ficha de emergencia', 'Alergias, seguro y a quién avisar, en japonés y sin PIN.', { data: { act: 'go', to: 'emergency' } });
    html += SV.vaultAvailable()
      ? UI.banner(unlocked ? 'success' : 'neutral', 'lock', unlocked ? 'Cofre desbloqueado' : 'Datos sensibles cifrados con PIN', unlocked ? 'Se bloqueará al cerrar la app.' : 'Pólizas, nº de pasaporte o códigos privados se cifran en este navegador con tu PIN y no se exportan.',
        { action: unlocked ? UI.btn('Bloquear', { size: 'sm', variant: 'ghost', data: { act: 'lockVault' } }) : UI.btn(SV.vaultExists() ? 'Desbloquear' : 'Crear PIN', { size: 'sm', variant: 'secondary', data: { act: 'unlockVault' } }) })
      : UI.banner('warn', 'alert', 'Cifrado no disponible', 'Este navegador no permite cifrar aquí. Ábrelo desde https (GitHub Pages) o localhost para guardar datos sensibles.');
    html += list.length ? list.map(function (d) {
      const k = D.DOC_KIND[d.kind], val = d.isSensitive ? (unlocked ? SV.vaultGet(d.id) : null) : d.value;
      return '<div class="card card--tap item" tabindex="0" data-act="editDoc" data-id="' + d.id + '"><span class="item__emoji" aria-hidden="true">' + k[1] + '</span><div class="item__body"><strong>' + esc(d.title) + (d.isSensitive ? ' 🔒' : '') + '</strong>' +
        (d.isSensitive && !unlocked ? '<span class="faint">•••••••• (bloqueado)</span>' : val ? '<span class="pre">' + esc(val) + '</span>' : '<span class="faint">Sin valor</span>') + (d.notes ? '<small class="muted">' + esc(d.notes) + '</small>' : '') + '</div>' +
        (val ? UI.iconBtn('copy', 'Copiar', { act: 'copy', text: val }) : '') + '</div>';
    }).join('') : UI.empty('📄', 'Sin datos', 'Guarda localizadores, la dirección del hotel para el taxi, teléfonos de emergencia, pólizas…', UI.btn('Añadir', { data: { act: 'newDoc' } }));
    return { html: html };
  };

  function askPin() {
    return new Promise(function (resolve) {
      let done = false;
      const creating = !SV.vaultExists();
      formSheet({
        id: 'fPin', title: creating ? 'Crear PIN del cofre' : 'Desbloquear cofre', saveLabel: creating ? 'Crear' : 'Desbloquear',
        body: UI.field('PIN', '<input class="input input--lg" name="pin" type="password" inputmode="numeric" autocomplete="off" minlength="4" autofocus>', { hint: creating ? 'Mínimo 4 caracteres. Si lo olvidas, los datos sensibles no se pueden recuperar.' : '' }),
        onSave: async function (f) {
          if (!f.pin || f.pin.length < 4) return 'Mínimo 4 caracteres';
          try { await SV.vaultUnlock(f.pin); done = true; resolve(true); } catch (e) { return e.message; }
        },
        onClose: () => { if (!done) resolve(false); }
      });
    });
  }
  A.unlockVault = async () => { if (await askPin()) { UI.toast('Cofre desbloqueado'); JT.app.render(); } };
  A.lockVault = () => { SV.vaultLock(); JT.app.render(); };

  F.doc = async function (id) {
    const ex = id ? S.get().docs[id] : null;
    if (ex && ex.isSensitive && !SV.vaultUnlocked() && !(await askPin())) return;
    const d = ex || { title: '', kind: 'other', isSensitive: false };
    const value = d.isSensitive ? SV.vaultGet(d.id) || '' : d.value || '';
    formSheet({
      id: 'fDoc', title: ex ? 'Editar dato' : 'Nuevo dato',
      body: UI.field('Título', UI.input('title', d.title, { placeholder: 'p.ej. Póliza del seguro de viaje', autofocus: !ex })) + UI.field('Tipo', UI.chips('kind', D.options(D.DOC_KIND), d.kind)) +
        UI.field('Valor', UI.textarea('value', value, 'Número, dirección, teléfono…')) +
        (SV.vaultAvailable() ? '<label class="chip"><input type="checkbox" name="sensitive" value="1"' + (d.isSensitive ? ' checked' : '') + '><span>🔒 Sensible: cifrar con PIN</span></label>' : '') +
        UI.field('Notas', UI.textarea('notes', d.notes), { optional: true }),
      onDelete: ex ? async () => { if (!(await UI.confirm('¿Eliminar?', ex.title))) return false; if (ex.isSensitive && SV.vaultUnlocked()) await SV.vaultSet(ex.id, null); S.remove('docs', ex.id); return true; } : null,
      onSave: async function (f) {
        if (!f.title) return 'Escribe un título';
        const sensitive = !!f.sensitive;
        if (sensitive && !SV.vaultUnlocked() && !(await askPin())) return 'Hace falta el PIN para guardar datos sensibles';
        const base = { title: f.title, kind: f.kind, isSensitive: sensitive, notes: f.notes || undefined, value: sensitive ? undefined : f.value || undefined };
        const did = ex ? ex.id : S.create('docs', base);
        if (ex) S.update('docs', did, base);
        if (SV.vaultUnlocked()) await SV.vaultSet(did, sensitive ? f.value : null);
        JT.app.render();
      }
    });
  };
  A.newDoc = () => F.doc(null);
  A.editDoc = (el) => F.doc(el.dataset.id);

  /* ══ BUSCAR ══════════════════════════════════════════════════ */

  const KIND = { activity: ['Itinerario', 'activity/'], place: ['Lugares', 'place/'], restaurant: ['Restaurantes', 'restaurant/'], reservation: ['Reservas', 'reservation/'], note: ['Notas', null], expense: ['Gastos', null], transport: ['Transporte', null], city: ['Ciudades', 'city/'] };
  JT.uiState.search = JT.uiState.search || {};

  V.search = function () {
    const q = JT.uiState.search.q || '', hits = L.search(q);
    let html = UI.header({ back: true, title: 'Buscar' }) + JT.searchBox('search', 'Shibuya, ramen, Shinkansen…');
    if (q.trim().length < 2) html += '<p class="muted center">Busca en actividades, lugares, restaurantes, notas, reservas, gastos, ciudades y transporte.</p>';
    else if (!hits.length) html += UI.empty('🔎', 'Sin resultados', 'Nada coincide con «' + q.trim() + '».');
    else Object.keys(KIND).forEach(function (k) {
      const items = hits.filter((h) => h.kind === k);
      if (!items.length) return;
      html += UI.section(KIND[k][0] + ' (' + items.length + ')', UI.card(items.map((h) => UI.listRow({ emoji: h.emoji, title: h.title, sub: h.sub,
        data: KIND[k][1] ? { act: 'go', to: KIND[k][1] + h.id } : { act: k === 'note' ? 'editNote' : k === 'expense' ? 'editExpense' : 'editTransport', id: h.id } })).join(''), { cls: 'card--list' }));
    });
    return { html: html, mount: (root) => { const i = root.querySelector('.search input'); if (i && !q) i.focus(); } };
  };

  /* ══ IMPORTAR ════════════════════════════════════════════════ */

  JT.uiState.import = JT.uiState.import || { text: '' };

  V.import = function () {
    const st = JT.uiState.import, s = S.get();
    // Texto copiado de «Compartir» de Google Maps (nombre, dirección y enlace corto): también es un solo sitio.
    if (!st.shared && /maps\.app\.goo\.gl/.test(st.text) && st.text.split('\n').filter((l) => l.trim()).length <= 4) { st.shared = L.parseShared({ text: st.text }); st.geoTried = false; }
    // Si llega de «Compartir» (app.js), es un solo sitio; si no, una línea = un elemento.
    const items = st.shared ? [st.shared] : L.parseImportLines(st.text);
    let html = UI.header({ back: true, title: 'Importar', subtitle: 'Enlaces de Google Maps, webs, texto o confirmaciones de reserva' });
    if (st.shared) html += UI.banner('info', 'download', 'Sitio compartido', 'Revisa si es para visitar o para comer y créalo.');
    if (st.shared && st.geoLoading) html += '<div class="loading"><span class="spinner"></span><small class="muted">Buscando su ubicación…</small></div>';
    html += '<label class="field"><span class="field__label">Pega un enlace o texto</span><textarea class="input" rows="5" data-input="importText" placeholder="https://maps.google.com/…&#10;Fushimi Inari Taisha, Kyoto&#10;Ichiran ramen Shibuya">' + esc(st.text) + '</textarea></label>';
    html += '<div class="row">' + UI.btn('Pegar', { icon: 'clipboard', size: 'sm', variant: 'secondary', data: { act: 'pasteImport' } }) + (st.text ? UI.btn('Borrar', { size: 'sm', variant: 'ghost', data: { act: 'clearImport' } }) : '') + '</div>';
    if (items.length > 1) html += UI.banner('info', 'list', items.length + ' elementos detectados', 'Revísalos uno a uno o créalos todos (luego podrás completar sus datos).', { action: UI.btn('Crear todos', { size: 'sm', data: { act: 'importAll' } }) });
    st.items = items;
    html += items.map(function (it, i) {
      const kindPill = it.kind === 'reservation' ? UI.pill(D.RESERVATION[it.type || 'other'][1] + ' Reserva', 'info') : it.kind === 'restaurant' ? UI.pill(D.CUISINE[it.cuisine || 'other'][1] + ' Restaurante', 'warn') : UI.pill(D.PLACE[it.category || 'other'][1] + ' Lugar');
      return UI.card('<div class="pills">' + kindPill + (it.cityId && s.cities[it.cityId] ? UI.pill(s.cities[it.cityId].name) : '') + (it.coords ? UI.pill('📍 con coordenadas', 'success') : '') + '</div>' +
        '<strong>' + esc(it.name) + '</strong>' + it.notes.map((n) => '<small class="muted block">• ' + esc(n) + '</small>').join('') +
        '<div class="row row--wrap">' + UI.btn(it.kind === 'reservation' ? 'Crear reserva' : it.kind === 'restaurant' ? 'Crear restaurante' : 'Crear lugar', { size: 'sm', data: { act: 'importOne', i: i } }) +
        (it.kind !== 'reservation' ? UI.btn(it.kind === 'restaurant' ? 'Es un lugar' : 'Es un restaurante', { size: 'sm', variant: 'ghost', data: { act: 'importOne', i: i, swap: '1' } }) : '') + '</div>', { cls: 'stack-sm' });
    }).join('');
    if (!st.text.trim()) html += '<p class="faint small">Truco: en Google Maps, abre un sitio y pulsa Compartir → Japón Travel. Si el texto no trae coordenadas, podrás buscarlas por nombre al crear el lugar (requiere conexión).</p>';
    return { html: html, mount: () => locateShared(st) };
  };

  /** El enlace corto de Google Maps no se puede leer: se busca la ubicación por nombre y ciudad, luego por dirección. */
  async function locateShared(st) {
    const it = st.shared;
    if (!it || !it.needsCoords || st.geoTried || !SV.online()) return;
    st.geoTried = true;
    st.geoLoading = true;
    JT.app.render();
    const city = it.cityId && S.get().cities[it.cityId];
    const tries = [city ? it.name + ', ' + city.name : null, it.address, it.name].filter(Boolean);
    let hit = null;
    for (const q of tries) {
      try { hit = (await SV.geocode(q))[0]; } catch (e) { hit = null; }
      if (hit) break;
    }
    st.geoLoading = false;
    if (st.shared !== it) return; // el usuario ya ha cambiado de texto
    if (hit) {
      it.coords = hit.coords;
      it.notes.push('📍 Ubicación encontrada: ' + hit.display.split(',').slice(0, 3).join(',') + ' (compruébala al crearlo)');
      if (!it.cityId) { const c = L.matchCity(hit.display); if (c) it.cityId = c.id; }
    } else {
      it.notes.push('No se encontró la ubicación por el nombre; se guarda el enlace de Google Maps para abrirlo desde la ficha.');
    }
    JT.app.render();
  }

  JT.changes.importText = JT.utils.debounce(function (el) { const st = JT.uiState.import; st.text = el.value; st.shared = null; JT.app.render({ keepFocus: true }); }, 350);
  A.pasteImport = async function () {
    try { JT.uiState.import.text = await navigator.clipboard.readText(); JT.uiState.import.shared = null; JT.app.render(); } catch (e) { UI.toast('El navegador no deja leer el portapapeles: pega con mantener pulsado'); }
  };
  A.clearImport = () => { JT.uiState.import = { text: '' }; JT.app.render(); };
  A.importOne = function (el) {
    const it = Object.assign({}, JT.uiState.import.items[+el.dataset.i]);
    if (el.dataset.swap) it.kind = it.kind === 'restaurant' ? 'place' : 'restaurant';
    if (it.kind === 'reservation') F.reservation(null, { type: it.type, name: it.name, date: it.date, time: it.time, code: it.code, cityId: it.cityId });
    else if (it.kind === 'restaurant') F.restaurant(null, { name: it.name, cuisine: it.cuisine || 'other', coords: it.coords, url: it.url, address: it.address, cityId: it.cityId });
    else F.place(null, { name: it.name, category: it.category || 'other', coords: it.coords, url: it.url, address: it.address, cityId: it.cityId });
  };
  A.importAll = function () {
    let n = 0;
    JT.uiState.import.items.forEach(function (it) {
      if (it.kind === 'reservation') return;
      if (it.kind === 'restaurant') S.create('restaurants', { name: it.name, cuisine: it.cuisine || 'other', cityId: it.cityId, coords: it.coords, url: it.url, address: it.address, status: 'want', favorite: false });
      else S.create('places', { name: it.name, category: it.category || 'other', cityId: it.cityId, coords: it.coords, url: it.url, address: it.address, priority: 'medium', status: 'pending', favorite: false });
      n++;
    });
    JT.uiState.import.text = '';
    UI.toast(n + ' elementos creados');
    JT.app.render();
  };

  /* ══ AJUSTES ═════════════════════════════════════════════════ */

  /* ══ ¿LISTO PARA EL VIAJE? ═══════════════════════════════════
     Repaso antes de salir. Lo que se sabe al momento se calcula aquí;
     lo que pregunta al navegador (copia offline, protección, voces)
     se rellena después en mount(). Nada se inventa: si el navegador
     no lo puede saber, lo dice. */

  function syncChecks() {
    const s = S.get(), e = s.emergency || {}, out = [];
    const last = SV.lastExport(), days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    out.push({ id: 'backup', title: 'Copia de seguridad', ok: days !== null && days < 7,
      sub: days === null ? 'Aún no has exportado ninguna. Guárdala fuera del móvil (Drive, correo…).' : days < 7 ? 'Hecha hace ' + (days === 0 ? 'menos de un día' : days + (days === 1 ? ' día' : ' días')) + '.' : 'La última es de hace ' + days + ' días.',
      action: UI.btn('Exportar', { size: 'sm', variant: 'secondary', data: { act: 'exportJson' } }) });
    const filled = (e.allergies && e.allergies.length) || e.allergyOther || e.conditions || e.meds || e.blood || e.insurer || e.contactName;
    out.push({ id: 'sos', title: 'Ficha de emergencia', ok: !!filled, sub: filled ? (e.insurer ? 'Con seguro' : 'Sin seguro apuntado') + (e.contactName ? ' · con contacto' : ' · sin contacto') + '.' : 'Alergias, seguro y a quién avisar, en japonés.',
      action: UI.btn(filled ? 'Ver' : 'Rellenar', { size: 'sm', variant: 'secondary', data: { act: 'go', to: 'emergency' } }) });
    const hotels = Object.values(s.reservations).filter((r) => r.type === 'hotel' && !r.isSample).sort((a, b) => a.date.localeCompare(b.date));
    const noJa = hotels.filter((r) => !r.addressJa), noOut = hotels.filter((r) => r.endDate && !r.checkoutTime);
    out.push({ id: 'hotels', title: 'Hoteles para el taxista', ok: hotels.length > 0 && !noJa.length,
      sub: !hotels.length ? 'Aún no hay ningún hotel en Reservas.' : noJa.length ? 'Sin dirección en japonés: ' + noJa.map((r) => r.name).join(', ') + '.' : 'Los ' + hotels.length + ' tienen la dirección en japonés.',
      action: noJa.length ? UI.btn('Completar', { size: 'sm', variant: 'secondary', data: { act: 'editReservation', id: noJa[0].id } }) : !hotels.length ? UI.btn('Añadir', { size: 'sm', variant: 'secondary', data: { act: 'newReservation', type: 'hotel' } }) : '' });
    if (hotels.length) out.push({ id: 'checkout', title: 'Hora de check-out', ok: !noOut.length,
      sub: noOut.length ? 'Falta en: ' + noOut.map((r) => r.name).join(', ') + '. Sin ella, el aviso no dice a qué hora salir.' : 'Todos los hoteles la tienen.',
      action: noOut.length ? UI.btn('Completar', { size: 'sm', variant: 'secondary', data: { act: 'editReservation', id: noOut[0].id } }) : '' });
    const rates = SV.rates();
    out.push({ id: 'rates', title: 'Tipo de cambio guardado', ok: !!rates, sub: rates ? (rates.source === 'manual' ? 'Tipo manual.' : 'BCE' + (rates.date ? ' del ' + rates.date : '') + ': funciona sin conexión.') : 'Conéctate una vez para descargarlo.',
      action: !rates && SV.online() ? UI.btn('Descargar', { size: 'sm', variant: 'secondary', data: { act: 'refreshRates' } }) : '' });
    const lists = Object.values(s.checklists).filter((c) => c.section === 'before').map((c) => c.id);
    const pend = Object.values(s.checklistItems).filter((i) => lists.indexOf(i.checklistId) > -1 && !i.done).length;
    out.push({ id: 'todo', title: 'Checklist «Antes del viaje»', ok: !pend, sub: pend ? pend + (pend === 1 ? ' tarea pendiente.' : ' tareas pendientes.') : 'Todo hecho.',
      action: pend ? UI.btn('Ver', { size: 'sm', variant: 'secondary', data: { act: 'go', to: 'checklist' } }) : '' });
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    out.push({ id: 'app', title: 'Abierta como app', ok: standalone,
      sub: standalone ? 'La estás usando desde el icono instalado.' : 'La estás usando en el navegador. Instalada es más fácil de abrir sin conexión y el navegador protege mejor sus datos.',
      action: !standalone && JT.uiState.installPrompt ? UI.btn('Instalar', { size: 'sm', variant: 'secondary', data: { act: 'installApp' } }) : '' });
    return out;
  }

  JT.ready = { syncSummary: () => { const c = syncChecks(); return { pending: c.filter((x) => !x.ok).length, total: c.length }; } };

  function readyRow(c) {
    const icon = c.ok === null ? '<span class="ready__dot is-wait" aria-label="Comprobando">…</span>' : c.ok ? '<span class="ready__dot is-ok" aria-label="Listo">' + U.icon('check', 14) + '</span>' : '<span class="ready__dot is-warn" aria-label="Pendiente">!</span>';
    return '<div class="ready__row" id="ready-' + c.id + '">' + icon + '<div class="grow"><strong class="block">' + esc(c.title) + '</strong><small class="muted">' + esc(c.sub) + '</small></div>' + (c.ok ? '' : c.action || '') + '</div>';
  }

  V.ready = function () {
    const t = S.today(), checks = syncChecks();
    const async = [
      { id: 'offline', title: 'Copia sin conexión', ok: null, sub: 'Comprobando…' },
      { id: 'persist', title: 'Datos protegidos', ok: null, sub: 'Comprobando…' },
      { id: 'voice', title: 'Voz japonesa', ok: null, sub: 'Comprobando…' }
    ];
    const all = async.concat(checks);
    return {
      html: UI.header({ back: true, title: '¿Listo para el viaje?', subtitle: t.phase === 'before' ? (t.daysUntil === 1 ? 'Os vais mañana' : 'Faltan ' + t.daysUntil + ' días') : '' }) +
        UI.card('<div class="row row--between"><strong id="readyCount">' + checks.filter((c) => c.ok).length + ' de ' + all.length + ' listo</strong><small class="faint">Se comprueba en este móvil</small></div>' +
          '<div class="progress"><div class="progress__fill progress__fill--info" id="readyBar" style="width:' + (checks.filter((c) => c.ok).length / all.length) * 100 + '%"></div></div>', { cls: 'stack-sm' }) +
        UI.card(all.map(readyRow).join(''), { cls: 'ready' }) +
        '<p class="faint small">Hazlo en el móvil que vas a llevar: la copia sin conexión, la voz y la protección de datos son de cada navegador.</p>',
      mount: function (root) {
        const results = {};
        checks.forEach((c) => (results[c.id] = c.ok));
        const put = function (c) {
          results[c.id] = c.ok;
          const el = root.querySelector('#ready-' + c.id);
          if (el) el.outerHTML = readyRow(c);
          const ok = Object.keys(results).filter((k) => results[k]).length;
          const cnt = root.querySelector('#readyCount'), bar = root.querySelector('#readyBar');
          if (cnt) cnt.textContent = ok + ' de ' + all.length + ' listo';
          if (bar) bar.style.width = (ok / all.length) * 100 + '%';
        };
        SV.offlineCopy().then(function (c) {
          if (location.protocol === 'file:' || !window.caches) put({ id: 'offline', title: 'Copia sin conexión', ok: false, sub: 'Abierta como archivo: sólo funciona sin conexión desde la web publicada.' });
          else if (!c) put({ id: 'offline', title: 'Copia sin conexión', ok: false, sub: 'Aún no hay copia. Ábrela con conexión y recarga una vez.' });
          else put({ id: 'offline', title: 'Copia sin conexión', ok: !c.stale, sub: c.stale ? 'Tienes la v' + c.version + ' guardada; recarga con conexión para guardar la v' + U.VERSION + '.' : 'Guardada la v' + c.version + ' (' + Math.round(c.bytes / 1024) + ' KB).' });
        }).catch(() => put({ id: 'offline', title: 'Copia sin conexión', ok: false, sub: 'No se ha podido comprobar.' }));
        SV.persisted().then(function (p) {
          put({ id: 'persist', title: 'Datos protegidos', ok: p === true,
            sub: p === true ? 'El navegador no borrará tus datos para hacer sitio.' : p === false ? 'El navegador podría borrarlos si falta espacio: instálala y ábrela desde el icono, y ten una copia exportada.' : 'Este navegador no permite saberlo: ten una copia exportada.',
            action: p === false && JT.uiState.installPrompt ? UI.btn('Instalar', { size: 'sm', variant: 'secondary', data: { act: 'installApp' } }) : '' });
        });
        const voice = function (final) {
          const vs = SV.canSpeak() ? window.speechSynthesis.getVoices() : [];
          const ja = vs.filter((v) => /^ja/i.test(v.lang));
          if (!vs.length && !final) return false;
          put({ id: 'voice', title: 'Voz japonesa', ok: ja.length > 0,
            sub: !SV.canSpeak() ? 'Este navegador no puede leer en voz alta.' : ja.length ? 'Instalada (' + ja[0].name + '). Para usarla sin conexión, que esté descargada en el móvil.' : 'No está instalada. Busca «texto a voz» en los Ajustes del móvil → Motor de Google → Instalar datos de voz → Japonés.',
            action: SV.canSpeak() ? UI.btn('Probar', { icon: 'speaker', size: 'sm', variant: 'secondary', data: { act: 'speak', text: 'こんにちは' } }) : '' });
          return true;
        };
        // Chrome carga la lista de voces tarde: se espera un poco antes de decidir.
        if (!voice(false) && SV.canSpeak()) {
          window.speechSynthesis.addEventListener('voiceschanged', function once() { window.speechSynthesis.removeEventListener('voiceschanged', once); voice(true); });
          setTimeout(() => voice(true), 1500);
        }
      }
    };
  };

  /* Ajustes plegados: cada apartado se abre al tocarlo y recuerda si lo dejaste abierto. */
  const FOLD = {
    'Viaje': ['calendar', 'blue', 'Nombre, fechas, moneda y presupuesto'],
    'Viajeros': ['users', 'violet', 'Quién viaja y quién eres tú'],
    'Apariencia y unidades': ['eye', 'pink', 'Tema, tamaño de letra y distancias'],
    'Modo viaje': ['nav', 'red', 'Cuándo se activa y simular un día'],
    'Cambio de moneda': ['swap', 'green', 'Redondeo del yen y tipo del BCE'],
    'Datos': ['download', 'amber', 'Copia de seguridad, importar y borrar'],
    'Esta instalación': ['info', 'slate', 'Versión, espacio y si está lista para el viaje']
  };
  function fold(title, content) {
    const m = FOLD[title] || ['settings', 'slate', ''], open = (JT.uiState.settingsOpen || {})[title];
    return '<details class="fold" data-fold="' + esc(title) + '"' + (open ? ' open' : '') + '><summary class="fold__sum"><span class="fold__icon tone-' + m[1] + '">' + U.icon(m[0], 18) + '</span>' +
      '<span class="grow"><strong class="block">' + esc(title) + '</strong><small class="muted">' + esc(title === 'Esta instalación' ? 'v' + U.VERSION + ' · ' + m[2] : m[2]) + '</small></span>' + U.icon('down', 18) + '</summary>' +
      '<div class="fold__body">' + content + '</div></details>';
  }

  V.settings = function () {
    const s = S.get(), t = s.trip, st = s.settings, rates = SV.rates();
    const seg = (act, value, opts) => '<div class="seg">' + opts.map((o) => '<button type="button" class="seg__item' + (o[0] === value ? ' is-on' : '') + '" aria-pressed="' + (o[0] === value) + '" data-act="' + act + '" data-value="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    const travelers = Object.values(s.travelers).sort((a, b) => a.createdAt - b.createdAt);
    let html = UI.header({ back: true, title: 'Configuración' });

    html += fold('Viaje', UI.card('<form id="fTrip" class="stack">' +
      UI.field('Nombre del viaje', UI.input('name', t.name)) +
      '<div class="row row--top">' + UI.field('Inicio', UI.input('startDate', t.startDate, { type: 'date' })) + UI.field('Fin', UI.input('endDate', t.endDate, { type: 'date' })) + '</div>' +
      UI.field('Moneda principal', UI.chips('mainCurrency', D.CURRENCIES.map((c) => ({ value: c, label: c })), t.mainCurrency)) +
      UI.field('Presupuesto total (' + t.mainCurrency + ')', UI.input('totalBudget', t.totalBudget || '', { inputmode: 'decimal' }), { optional: true }) +
      UI.btn('Guardar viaje', { type: 'submit', variant: 'secondary' }) + '</form>'));

    html += fold('Viajeros', UI.card(travelers.map((x) => '<div class="row"><span class="dot" style="background:' + esc(x.color) + '"></span><strong class="grow">' + esc(x.name) + '</strong>' +
      (x.isMe ? UI.pill('Yo', 'accent') : UI.btn('Soy yo', { size: 'sm', variant: 'ghost', data: { act: 'setMe', id: x.id } })) + UI.iconBtn('trash', 'Eliminar ' + x.name, { act: 'delTraveler', id: x.id }, { size: 18 }) + '</div>').join('') +
      '<form id="fTraveler" class="row"><input class="input" name="name" placeholder="Nombre del viajero" aria-label="Nombre del viajero">' + UI.btn('Añadir', { type: 'submit', size: 'sm' }) + '</form>' +
      '<small class="faint">Con 2 o más viajeros puedes indicar quién pagó cada gasto y repartirlo.</small>', { cls: 'stack' }));

    html += fold('Apariencia y unidades', UI.card(seg('setTheme', st.theme, [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']]) +
      '<span class="field__label">Tamaño de letra</span>' + seg('setTextSize', st.textSize || 'normal', [['normal', 'Normal'], ['large', 'Grande'], ['xl', 'Muy grande']]) +
      '<small class="muted">Agranda toda la app (textos, botones e iconos) para leer mejor en la calle o enseñar la pantalla. Sólo en este dispositivo.</small>' +
      seg('setUnits', st.units, [['km', 'Kilómetros'], ['mi', 'Millas']]), { cls: 'stack' }));

    html += fold('Modo viaje', UI.card(seg('setTravel', st.travelMode, [['auto', 'Automático'], ['on', 'Siempre'], ['off', 'Nunca']]) +
      '<small class="muted">Automático: Inicio cambia al Modo viaje durante las fechas del viaje.</small>' +
      '<form id="fSim" class="stack"><span class="field__label">Simular fecha y hora (para probar)</span><div class="row row--top">' + UI.field('Fecha', UI.input('simulatedDate', st.simulatedDate || '', { type: 'date' })) + UI.field('Hora', UI.input('simulatedTime', st.simulatedTime || '', { type: 'time' }), { optional: true }) + '</div>' +
      '<div class="row row--wrap">' + UI.btn('Aplicar', { type: 'submit', size: 'sm', variant: 'secondary' }) + UI.btn('Simular un día con plan a las 11:45', { size: 'sm', variant: 'secondary', data: { act: 'simulate' } }) + (st.simulatedDate ? UI.btn('Usar fecha real', { size: 'sm', variant: 'danger', data: { act: 'clearSim' } }) : '') + '</div></form>' +
      (st.simulatedDate ? UI.banner('warn', 'clock', 'Simulando ' + st.simulatedDate + (st.simulatedTime ? ' ' + st.simulatedTime : ''), 'Afecta a «hoy», al Modo viaje y a «abierto ahora».') : ''), { cls: 'stack' }));

    // Sólo lo que se usa: el redondeo del yen. Recordatorios y APIs se quitaron en la v1.6.0 (no se usaban).
    const manualSet = Object.keys(st.manualRates || {}).length > 0;
    html += fold('Cambio de moneda', UI.card('<span class="field__label">Redondeo del yen</span>' +
      UI.filterChips([{ value: 'up', label: 'Al alza' }, { value: 'up1', label: 'Al alza +1 ¥' }, { value: 'exact', label: 'Exacto' }], st.yenRounding, 'setYenRounding', { scroll: false }) +
      '<small class="muted">' + esc(yenRoundingExample(rates, t.mainCurrency)) + '</small>' +
      '<small class="faint">Tipo de referencia del BCE' + (rates && rates.date ? ' del ' + esc(rates.date) : '') + '. Se guarda para usarlo sin conexión.</small>' +
      '<div class="row row--wrap">' + (SV.online() ? UI.btn('Actualizar tipo de cambio', { size: 'sm', variant: 'ghost', icon: 'refresh', data: { act: 'refreshRates' } }) : '') +
        (manualSet ? UI.btn('Quitar tipos manuales antiguos', { size: 'sm', variant: 'ghost', data: { act: 'clearManualRates' } }) : '') + '</div>', { cls: 'stack-sm' }));

    const lastExp = SV.lastExport();
    html += fold('Datos', UI.card(UI.btn('Exportar copia de seguridad', { icon: 'download', variant: 'secondary', block: true, data: { act: 'exportJson' } }) +
      '<small class="muted">' + (lastExp ? 'Última copia: ' + new Date(lastExp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Todavía no has hecho ninguna copia.') + ' En el móvil se abre Compartir: elige Drive (se guarda como .txt). En el ordenador se descarga un .json. Importar acepta los dos.</small>' +
      UI.btn('Exportar gastos (CSV)', { icon: 'download', variant: 'secondary', block: true, data: { act: 'exportCsv' } }) +
      UI.btn('Importar copia (.json o .txt)', { icon: 'upload', variant: 'secondary', block: true, data: { act: 'importJson' } }) +
      '<small class="faint">Los datos sensibles cifrados de Documentos no se incluyen en la exportación. PC y móvil no se sincronizan: usa exportar e importar para pasar datos.</small><hr>' +
      (t.isSample ? UI.btn('Quitar datos de ejemplo', { icon: 'flag', variant: 'soft', block: true, data: { act: 'removeSample' } }) : UI.btn('Cargar viaje de ejemplo', { icon: 'flag', variant: 'soft', block: true, data: { act: 'loadSample' } })) +
      UI.btn('Empezar un viaje nuevo', { icon: 'plus', variant: 'soft', block: true, data: { act: 'newTrip' } }) +
      UI.btn('Borrar todos los datos', { icon: 'trash', variant: 'danger', block: true, data: { act: 'wipe' } }), { cls: 'stack' }));

    // Versión, tamaño, espacio y protección (receta de Plantillas/Version-y-espacio.md); se rellena en mount().
    html += fold('Esta instalación', UI.card(UI.btn('¿Listo para el viaje? Repasar', { icon: 'check', variant: 'secondary', block: true, data: { act: 'go', to: 'ready' } }) + (JT.uiState.installPrompt ? UI.btn('Instalar la app en este dispositivo', { icon: 'download', variant: 'secondary', block: true, data: { act: 'installApp' } }) : '') +
      '<div class="build"><span class="build__left"><span>Versión</span><small id="buildQuota"></small><small id="buildPersist" hidden></small></span><strong class="mono build__right" id="buildCache">—</strong></div>' +
      '<p class="small" id="buildHint" hidden></p>' +
      (S.isWritable() ? '' : '<p class="small warn">El navegador está BLOQUEANDO el almacenamiento: no se guardan cambios.</p>') +
      '<small class="faint">Funciona sin conexión; restaurantes cercanos, búsqueda de coordenadas y tipos de cambio requieren Internet.</small>', { tone: 'muted', cls: 'stack-sm' }));

    return {
      html: html,
      mount: function (root) {
        root.querySelector('#fTrip').addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(ev.target), budget = f.totalBudget ? U.parseAmount(f.totalBudget) : undefined;
          if (!f.name) return UI.toast('Escribe un nombre');
          if (budget === null) return UI.toast('Presupuesto no válido');
          if (f.startDate !== t.startDate || f.endDate !== t.endDate) {
            const r = S.setTripDates(f.startDate, f.endDate);
            if (!r.ok) return UI.alert('No se pueden cambiar las fechas', r.error);
          }
          S.setTrip({ name: f.name, mainCurrency: f.mainCurrency, totalBudget: budget || undefined });
          SV.refreshRatesIfStale(true).then(() => JT.app.render()).catch(() => {});
          UI.toast('Viaje guardado');
        });
        root.querySelector('#fTraveler').addEventListener('submit', function (ev) {
          ev.preventDefault();
          const name = ev.target.name.value.trim();
          if (!name) return;
          const n = Object.keys(S.get().travelers).length;
          JT.app.focusAfter = '#fTraveler input';
          S.create('travelers', { name: name, color: ['#C8102E', '#2F6F73', '#B0893E', '#6B8E4E', '#5B5B9A', '#8E4E6B'][n % 6], isMe: n === 0 });
        });
        root.querySelector('#fSim').addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(ev.target);
          S.setSettings({ simulatedDate: f.simulatedDate || '', simulatedTime: f.simulatedTime || '' });
          UI.toast(f.simulatedDate ? 'Simulación aplicada' : 'Usando la fecha real');
        });
        renderBuildInfo(root);
        // Recordar qué apartados están abiertos (al guardar algo se vuelve a pintar la pantalla).
        root.querySelectorAll('details.fold').forEach((d) => d.addEventListener('toggle', function () {
          (JT.uiState.settingsOpen = JT.uiState.settingsOpen || {})[d.dataset.fold] = d.open;
        }));
      }
    };
  };

  /* ── Versión, espacio y protección ────────────────────────────
     Una fila: «Versión … v1.0.5 · 27/10/2026 · 673 KB», debajo los
     datos frente al tope del navegador y si están protegidos; y una
     nota sólo si hay algo que hacer. */

  function formatKB(bytes) {
    const kb = bytes / 1024;
    return kb.toLocaleString('es-ES', { maximumFractionDigits: kb < 10 ? 1 : 0 }) + ' KB';
  }

  function renderBuildInfo(root) {
    const $cache = root.querySelector('#buildCache'), $quota = root.querySelector('#buildQuota');
    const $persist = root.querySelector('#buildPersist'), $hint = root.querySelector('#buildHint');
    const setHint = (text) => { $hint.textContent = text; $hint.hidden = !text; };
    const date = U.BUILD_DATE.split('-').reverse().join('/');

    const use = SV.storageUse(), pct = (use.mine + use.others) / use.max * 100;
    $quota.textContent = 'Datos: ' + formatKB(use.mine) + ' de ' + formatKB(use.max) + ' máx.' +
      (use.others >= 1024 ? ' · otras apps: ' + formatKB(use.others) : '') + (pct >= 1 ? ' (' + Math.round(pct) + ' %)' : '');
    $quota.dataset.state = pct >= 90 ? 'full' : pct >= 70 ? 'high' : 'ok';
    $quota.title = 'El navegador guarda hasta 5 MB por sitio, compartidos con tus otras apps de ' + location.host + '.';

    SV.persisted().then(function (yes) {
      if (yes === null) { $persist.hidden = true; return; }
      $persist.hidden = false;
      $persist.dataset.state = yes ? 'ok' : 'risk';
      $persist.textContent = yes ? '🔒 Protegidos: el navegador no los borrará' : '⚠️ Sin proteger: el navegador podría borrarlos';
      $persist.title = yes ? 'El navegador los trata como persistentes: no los borra aunque le falte espacio.'
        : 'Instalar la app y usarla a menudo suele bastar para que Chrome los proteja. Mientras, exporta copias.';
    });

    // La fecha sólo se pone si la copia guardada es la de este código: de una versión vieja no la sabemos.
    const line = (version, appBytes) => 'v' + version + (version === U.VERSION ? ' · ' + date : '') + ' · ' + formatKB(appBytes + use.mine);
    $cache.dataset.state = 'plain';
    if (location.protocol === 'file:' || !window.caches) {
      $cache.textContent = line(U.VERSION, 0);
      $cache.title = 'Sin caché offline: solo cuentan tus datos';
      return;
    }
    $cache.textContent = 'Comprobando…';
    SV.offlineCopy().then(function (c) {
      if (!c) { $cache.textContent = line(U.VERSION, 0); setHint('Todavía no se ha guardado una copia offline.'); return; }
      $cache.textContent = line(c.version, c.bytes);
      $cache.title = 'App ' + formatKB(c.bytes) + ' + datos ' + formatKB(use.mine);
      $cache.dataset.state = c.stale ? 'stale' : 'ok';
      setHint(c.stale ? 'La copia offline no coincide con la v' + U.VERSION + '. Cierra la app del todo y ábrela otra vez para que se actualice.' : '');
    }).catch(function () {
      $cache.textContent = line(U.VERSION, 0);
      $cache.title = 'No se pudo leer la caché: solo cuentan tus datos';
    });
  }

  /** «Hoy: 1 EUR = 177,32 ¥ en el BCE → la app usa 178 ¥.» con el tipo guardado. */
  function yenRoundingExample(rates, main) {
    const other = main === 'JPY' ? 'EUR' : main;
    const ex = rates && rates.exact ? U.convert(1, other, 'JPY', { base: rates.base, perUnit: rates.exact }) : null;
    if (!ex) return 'Ejemplo: si el BCE da 1 EUR = 177,32 ¥, «Al alza» usa 178 ¥ y «+1» usa 179 ¥.';
    const used = U.convert(1, other, 'JPY', rates);
    return 'Hoy: 1 ' + other + ' = ' + ex.toFixed(2).replace('.', ',') + ' ¥ en el BCE → la app usa ' + U.money(used, 'JPY').replace('¥', '') + ' ¥.';
  }

  /** Abre el diálogo de instalación guardado por app.js (sólo se puede usar una vez). */
  A.installApp = async function () {
    const ev = JT.uiState.installPrompt;
    if (!ev) return UI.alert('Instalar la app', 'Ahora mismo el navegador no ofrece instalarla. Recarga la página en Chrome y vuelve a intentarlo.');
    JT.uiState.installPrompt = null;
    try {
      ev.prompt();
      const r = await ev.userChoice;
      if (r.outcome !== 'accepted') UI.toast('Instalación cancelada');
    } catch (e) { UI.toast('El navegador no ha podido instalarla'); }
    JT.app.render();
  };

  A.setYenRounding =(el) => S.setSettings({ yenRounding: el.dataset.value });
  A.setTheme = (el) => S.setSettings({ theme: el.dataset.value });
  A.setTextSize = (el) => S.setSettings({ textSize: el.dataset.value });
  A.setUnits = (el) => S.setSettings({ units: el.dataset.value });
  A.setTravel = (el) => S.setSettings({ travelMode: el.dataset.value });
  A.clearSim = () => S.setSettings({ simulatedDate: '', simulatedTime: '' });
  A.setLead = (el) => S.setSettings({ notifyLeadMinutes: Number(el.dataset.value) });
  A.setProvider = (el) => S.setSettings({ placesProvider: el.dataset.value });
  A.clearManualRates = () => { S.setSettings({ manualRates: {} }); UI.toast('Se usa el tipo del BCE'); };
  A.delKey = () => { SV.setPlacesKey(''); UI.toast('Clave borrada'); JT.app.render(); };
  A.setNotif = async function (el) {
    if (el.dataset.value === 'on' && SV.notificationsSupported()) await SV.requestNotifications();
    S.setSettings({ notificationsEnabled: el.dataset.value === 'on' });
  };
  A.setMe = (el) => { Object.values(S.get().travelers).forEach((x) => x.isMe && S.update('travelers', x.id, { isMe: false })); S.update('travelers', el.dataset.id, { isMe: true }); };
  A.delTraveler = async (el) => { const x = S.get().travelers[el.dataset.id]; if (await UI.confirm('¿Eliminar a ' + x.name + '?', 'Sus gastos se conservarán sin «quién pagó».')) S.remove('travelers', x.id); };
  /** Copia de seguridad: en el móvil, Compartir → Drive (.txt); en el ordenador se descarga (.json).
      Sin awaits antes de saveCopy: tiene que ir en el mismo toque del botón. */
  A.exportJson = function () {
    SV.saveCopy('japon-travel-' + new Date().toISOString().slice(0, 10), S.exportJson(), function (how) {
      // Sólo cuenta como copia si salió de verdad (cancelar el menú no la marca).
      SV.markExported();
      UI.toast(how === 'shared' ? 'Copia enviada' : 'Copia descargada');
      JT.app.render();
    });
  };
  A.importJson = async function () {
    const f = await SV.pickFile();
    if (!f) return;
    const r = S.parseImport(f.text);
    if (!r.ok) return UI.alert('No se pudo importar', r.error);
    if (await UI.confirm('¿Reemplazar los datos actuales?', r.summary + '\n\nExporta antes una copia si quieres conservar lo actual.', { ok: 'Importar' })) { S.replaceAll(r.data); UI.toast('Datos importados'); }
  };
  A.removeSample = async () => { if (await UI.confirm('¿Quitar los datos de ejemplo?', 'Se borran actividades, lugares, restaurantes, gastos, notas y reservas de ejemplo. Se conservan tus datos, los días, las frases y la información útil.', { ok: 'Quitar' })) { S.removeSample(); UI.toast('Datos de ejemplo eliminados'); } };
  A.loadSample = async () => { if (await UI.confirm('¿Cargar el viaje de ejemplo?', 'Reemplaza todos los datos actuales.', { ok: 'Cargar' })) S.loadSample(); };
  A.wipe = async () => {
    if (!(await UI.confirm('¿Borrar TODOS los datos?', 'No se puede deshacer. Exporta antes una copia.', { ok: 'Borrar todo' }))) return;
    const t = S.get().trip;
    S.startEmptyTrip({ name: 'Mi viaje a Japón', startDate: t.startDate, endDate: t.endDate, mainCurrency: t.mainCurrency });
    SV.vaultReset();
    UI.toast('Datos borrados');
  };
  A.newTrip = function () {
    const today = new Date().toISOString().slice(0, 10);
    formSheet({
      id: 'fNewTrip', title: 'Viaje nuevo', saveLabel: 'Crear viaje',
      body: UI.field('Nombre', UI.input('name', 'Japón', { autofocus: true })) + '<div class="row row--top">' + UI.field('Inicio', UI.input('start', today, { type: 'date' })) + UI.field('Fin', UI.input('end', U.addDays(today, 14), { type: 'date' })) + '</div>' +
        UI.field('Moneda principal', UI.chips('cur', D.CURRENCIES.map((c) => ({ value: c, label: c })), 'JPY')) +
        '<small class="muted">Se crean los días vacíos, la checklist base, las frases y la información útil. Reemplaza los datos actuales: exporta antes una copia si la necesitas.</small>',
      onSave: function (f) {
        if (!f.name) return 'Escribe un nombre';
        if (!U.isISODate(f.start) || !U.isISODate(f.end) || f.end < f.start) return 'Fechas no válidas';
        if (U.diffDays(f.start, f.end) >= 120) return 'Máximo 120 días';
        S.startEmptyTrip({ name: f.name, startDate: f.start, endDate: f.end, mainCurrency: f.cur });
        UI.toast('Viaje creado');
        JT.go('');
      }
    });
  };
})();
