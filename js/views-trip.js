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
        // Marcarla como hecha (o saltarla) hace que la siguiente pase a primer plano.
        UI.iconBtn('check', 'Marcar como hecha', { act: 'doneNext', id: a.id }, { size: 20 }) + '</div>',
      { tone: item.inProgress ? 'accent' : '', data: { act: 'go', to: 'activity/' + a.id }, cls: 'stack-sm next-card' }
    );
  }

  /** Aviso de check-out: la mañana que dejas un hotel (hasta la hora de salida) y la noche anterior. */
  const checkedText = (r, fallback) => (r.checkoutDone && r.checkoutDone.length ? 'Lista «Antes de salir»: ' + r.checkoutDone.length + ' de ' + C.checkoutTotal + ' revisado' : fallback);

  function checkoutAlerts(n) {
    const out = [], tomorrow = U.addDays(n.date, 1);
    Object.values(S.get().reservations).filter((r) => JT.data.isLodging(r.type) && r.endDate).forEach(function (r) {
      const at = r.checkoutTime ? ' a las ' + r.checkoutTime : '';
      if (r.endDate === n.date && (!r.checkoutTime || n.minutes < U.toMin(r.checkoutTime)))
        out.push(UI.banner('warn', 'bed', 'Hoy dejas ' + r.name + (r.checkoutTime ? ' · salida antes de las ' + r.checkoutTime : ''), checkedText(r, 'Toca para repasar lo que no te puedes dejar.'), { data: { act: 'checkoutList', id: r.id } }));
      else if (r.endDate === tomorrow && n.minutes >= 18 * 60)
        out.push(UI.banner('info', 'bed', 'Mañana dejas ' + r.name + at, checkedText(r, 'Buen momento para ir haciendo la maleta. Toca para ver la lista.'), { data: { act: 'checkoutList', id: r.id } }));
      // Pagar en el alojamiento: tiene coste, no está en Gastos y no lo has marcado como pagado.
      const ex = JT.cards.costExpense ? JT.cards.costExpense('reservations', r.id) : null;
      if (r.cost && !ex && !r.payNoted && (r.endDate === n.date || (r.endDate === tomorrow && n.minutes >= 18 * 60)))
        out.push('<div class="banner banner--accent paybar">' + U.icon('wallet', 20) + '<div class="banner__text"><strong>' + esc((r.endDate === n.date ? 'Hoy pagas en ' : 'Mañana pagas en ') + r.name) + ': ' + U.money(r.cost, r.currency || 'JPY') + '</strong>' +
          '<span>Si ya estaba pagado (por ejemplo, en la web al reservar), márcalo y no vuelve a salir.</span>' +
          '<span class="row row--wrap paybar__btns">' + UI.btn('Apuntar el pago', { icon: 'plus', size: 'sm', data: { act: 'payLodging', id: r.id } }) + UI.btn('Ya estaba pagado', { size: 'sm', variant: 'ghost', data: { act: 'payNoted', id: r.id } }) + '</span></div></div>');
    });
    return out.join('');
  }
  /** Apunta el pago del alojamiento como gasto de hoy (enlazado a la reserva para no repetirlo). */
  A.payLodging = function (el) {
    const r = S.get().reservations[el.dataset.id];
    if (!r) return;
    F.expense(null, { amount: r.cost, currency: r.currency || 'JPY', category: 'hotel', description: r.name, date: S.today().now.date, cityId: r.cityId, reservationId: r.id });
  };
  A.payNoted = function (el) {
    const r = S.get().reservations[el.dataset.id];
    if (!r) return;
    S.update('reservations', r.id, { payNoted: true });
    UI.toast('Marcado como pagado', { label: 'Deshacer', run: () => S.update('reservations', r.id, { payNoted: undefined }) });
  };

  /* ── Taquillas (coin lockers): dónde dejaste la maleta, número, cómo se abre y hasta cuándo ──
     Salen arriba en Inicio y en el Modo viaje hasta que pulsas «Ya la vacié» (entonces se borran, código incluido). */
  const OPENS = { code: ['Código', '🔢'], suica: ['Suica', '🚃'], key: ['Llave', '🔑'], ticket: ['Tique', '🎫'] };
  function lockerLeft(l, n) {
    if (!l.untilTime && !l.untilDate) return null;
    return U.diffDays(n.date, l.untilDate || n.date) * 1440 + (l.untilTime ? U.toMin(l.untilTime) : 1440) - n.minutes;
  }
  function lockerCards(n, addBtn) {
    const list = Object.values(S.get().lockers || {}).sort((a, b) => a.createdAt - b.createdAt);
    const add = addBtn ? '<p class="locker-add">' + UI.btn('Apuntar taquilla', { icon: 'lock', size: 'sm', variant: 'ghost', data: { act: 'newLocker' } }) + UI.btn('Enviar maleta', { icon: 'car', size: 'sm', variant: 'ghost', data: { act: 'newShipment' } }) + '</p>' : '';
    return list.map(function (l) {
      const left = lockerLeft(l, n), late = left !== null && left < 0, soon = left !== null && left >= 0 && left <= 120;
      const op = OPENS[l.opens] || OPENS.code;
      const when = left === null ? '' : late ? 'Se pasó la hora' + (l.untilTime ? ' (' + l.untilTime + ')' : '') + ': puede que te cobren otro día'
        : 'Recoger antes de ' + (l.untilTime ? 'las ' + l.untilTime : 'medianoche') + (l.untilDate && l.untilDate !== n.date ? ' del ' + U.fmtShort(l.untilDate) : '') + ' · quedan ' + U.fmtDur(left);
      return '<div class="card cl locker tone-indigo stack-sm' + (late ? ' is-late' : '') + '"><div class="cl__head"><span class="cl__emoji" aria-hidden="true">🔐</span><span class="grow"><small class="eyebrow muted block">TAQUILLA' + (l.number ? ' Nº ' + esc(l.number) : '') + '</small>' +
        '<strong class="cl__title">' + esc(l.place || 'Taquilla') + '</strong>' + (when ? '<small class="' + (late ? 'accent' : soon ? 'warn' : 'muted') + '">' + esc(when) + '</small>' : '') + '</span></div>' +
        (l.opens === 'code' && l.code ? '<button type="button" class="locker__code mono" data-act="lockerCode" data-id="' + l.id + '" aria-label="Ver el código en grande">' + esc(l.code) + '</button>'
          : '<small class="muted">Se abre con: ' + op[1] + ' ' + op[0] + (l.code ? ' · ' + esc(l.code) : '') + '</small>') +
        (l.note ? '<small class="muted">' + esc(l.note) + '</small>' : '') +
        '<div class="row row--wrap">' + UI.btn('Ya la vacié', { icon: 'check', size: 'sm', data: { act: 'lockerDone', id: l.id } }) + UI.btn('Editar', { icon: 'edit', size: 'sm', variant: 'ghost', data: { act: 'editLocker', id: l.id } }) + '</div></div>';
    }).join('') + shipmentCards(n) + add;
  }
  C.lockerCards = lockerCards;

  /* ── Envío de maletas (takkyubin): de dónde a dónde, número de seguimiento y cuándo llega ──
     Sale arriba en Inicio y en el Modo viaje hasta que pulsas «Ya la tengo». */
  function shipmentCards(n) {
    const list = Object.values(S.get().shipments || {}).sort((a, b) => (a.arrival || '').localeCompare(b.arrival || ''));
    return list.map(function (x) {
      const d = x.arrival ? U.diffDays(n.date, x.arrival) : null;
      const when = d === null ? 'En camino' : d > 1 ? 'Llega el ' + U.fmtShort(x.arrival) + ' (en ' + d + ' días)' : d === 1 ? 'Llega mañana (' + U.fmtShort(x.arrival) + ')' : d === 0 ? 'Llega hoy' : 'Debía llegar el ' + U.fmtShort(x.arrival) + ': pregunta en recepción';
      return '<div class="card cl ship tone-teal stack-sm' + (d !== null && d <= 0 ? ' is-today' : '') + '"><div class="cl__head"><span class="cl__emoji" aria-hidden="true">🧳</span><span class="grow"><small class="eyebrow muted block">MALETA EN CAMINO' + (x.company ? ' · ' + esc(x.company.toUpperCase()) : '') + '</small>' +
        '<strong class="cl__title">' + esc((x.from || '¿?') + ' → ' + (x.to || '¿?')) + '</strong><small class="' + (d !== null && d <= 0 ? 'warn' : 'muted') + '">' + esc(when) + '</small></span></div>' +
        (x.tracking ? '<button type="button" class="locker__code mono ship__code" data-act="shipCode" data-id="' + x.id + '" aria-label="Ver el número de seguimiento en grande">' + esc(x.tracking) + '</button>' : '') +
        (x.note ? '<small class="muted">' + esc(x.note) + '</small>' : '') +
        '<div class="row row--wrap">' + UI.btn('Ya la tengo', { icon: 'check', size: 'sm', data: { act: 'shipDone', id: x.id } }) + UI.btn('Editar', { icon: 'edit', size: 'sm', variant: 'ghost', data: { act: 'editShipment', id: x.id } }) + '</div></div>';
    }).join('');
  }

  F.shipment = function (id) {
    const s = S.get(), x = id ? s.shipments[id] : null, n = S.now(), hotel = S.hotelTonight(n.date);
    const lodgings = Object.values(s.reservations).filter((r) => JT.data.isLodging(r.type)).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((r) => r.name);
    const body = '<form id="fShip" class="stack" novalidate>' +
      UI.field('Desde', UI.input('from', x ? x.from || '' : hotel ? hotel.name : '', { placeholder: 'p.ej. Hotel de Tokio', list: 'shipLodg' })) +
      UI.field('Hasta', UI.input('to', x ? x.to || '' : '', { placeholder: 'p.ej. Ryokan de Takayama', list: 'shipLodg' })) +
      '<datalist id="shipLodg">' + lodgings.map((l) => '<option value="' + esc(l) + '">').join('') + '</datalist>' +
      '<div class="row row--top">' + UI.field('Enviada', UI.input('sent', x ? x.sent || '' : n.date, { type: 'date' })) + UI.field('Llega', UI.input('arrival', x ? x.arrival || '' : U.addDays(n.date, 1), { type: 'date' })) + '</div>' +
      UI.field('Nº de seguimiento', UI.input('tracking', x ? x.tracking || '' : '', { placeholder: 'el del resguardo' }), { optional: true }) +
      UI.field('Empresa', UI.input('company', x ? x.company || '' : '', { placeholder: 'la que pone el resguardo' }), { optional: true }) +
      (x ? '' : '<div class="row row--top">' + UI.field('Coste (¥)', UI.input('cost', '', { inputmode: 'numeric' }), { optional: true }) + '</div>' +
        UI.field('Pagado con', UI.chips('pay', D.options(D.PAYMENT), 'cash', { allowNone: true, noneLabel: '—' }), { optional: true, hint: 'Si pones el coste, se apunta como gasto de transporte.' })) +
      UI.field('Nota', UI.input('note', x ? x.note || '' : '', { placeholder: 'p.ej. 2 maletas, la pequeña va con nosotros' }), { optional: true }) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: x ? 'Editar envío' : 'Enviar maleta', body: body,
      footer: '<div class="row">' + (x ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fShip', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fShip'), del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar el envío?', '')) { S.remove('shipments', x.id); close(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          if (!f.to) { err.textContent = 'Apunta a dónde la envías'; err.hidden = false; return; }
          const data = { from: f.from || undefined, to: f.to, sent: f.sent || undefined, arrival: f.arrival || undefined, tracking: f.tracking || undefined, company: f.company || undefined, note: f.note || undefined };
          if (x) S.update('shipments', x.id, data);
          else {
            S.create('shipments', data);
            const cost = U.parseAmount(f.cost);
            if (cost) {
              const t = S.today(), me = Object.values(s.travelers).find((p) => p.isMe) || Object.values(s.travelers)[0];
              S.create('expenses', { amount: cost, currency: 'JPY', category: 'transport', paymentMethod: f.pay || undefined, description: 'Envío de maleta → ' + f.to, date: f.sent || t.now.date,
                cityId: t.phase === 'during' && t.city ? t.city.id : undefined, paidById: me && me.id, splitWithIds: me ? [me.id] : [] });
            }
          }
          close();
          UI.toast(x ? 'Envío guardado' : 'Envío apuntado: te saldrá arriba hasta que la tengas');
        });
      }
    });
  };
  A.newShipment = () => F.shipment();
  A.editShipment = (el) => F.shipment(el.dataset.id);
  A.shipDone = function (el) {
    const x = S.get().shipments[el.dataset.id];
    if (!x) return;
    const copy = Object.assign({}, x);
    S.remove('shipments', x.id);
    UI.toast('🧳 ¡Maleta recibida!', { label: 'Deshacer', run: () => S.create('shipments', copy) });
  };
  A.shipCode = function (el) {
    const x = S.get().shipments[el.dataset.id];
    if (x && x.tracking) C.showcase({ ja: x.tracking, sub: (x.from || '') + ' → ' + (x.to || ''), es: 'Número de seguimiento', lang: 'none', noSpeak: true }, { fullscreen: true });
  };

  F.locker = function (id) {
    const l = id ? S.get().lockers[id] : null, n = S.now();
    const body = '<form id="fLocker" class="stack" novalidate>' +
      UI.field('Dónde', UI.input('place', l ? l.place || '' : '', { placeholder: 'p.ej. Estación de Kanazawa, salida este', autofocus: !l })) +
      '<div class="row row--top">' + UI.field('Nº de taquilla', UI.input('number', l ? l.number || '' : '', { placeholder: '123' }), { optional: true }) +
        UI.field('Recoger antes de', UI.input('untilTime', l ? l.untilTime || '' : '', { type: 'time' }), { optional: true }) + '</div>' +
      UI.field('Día', UI.input('untilDate', l ? l.untilDate || n.date : n.date, { type: 'date' })) +
      UI.field('Se abre con', UI.chips('opens', Object.keys(OPENS).map((k) => ({ value: k, label: OPENS[k][1] + ' ' + OPENS[k][0] })), l ? l.opens : 'code')) +
      UI.field('Código o número del tique', UI.input('code', l ? l.code || '' : '', { inputmode: 'text', placeholder: 'p.ej. 4821' }), { optional: true, hint: 'Sólo se guarda en este móvil y se borra al pulsar «Ya la vacié».' }) +
      (l ? '' : '<div class="row row--top">' + UI.field('Coste (¥)', UI.input('cost', '', { inputmode: 'numeric', placeholder: '700' }), { optional: true, hint: 'Se apunta como gasto (con Suica o en efectivo, según cómo se abra).' }) + '</div>') +
      UI.field('Nota', UI.input('note', l ? l.note || '' : '', { placeholder: 'p.ej. Maleta grande, fila de abajo' }), { optional: true }) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: l ? 'Editar taquilla' : 'Apuntar una taquilla', body: body,
      footer: '<div class="row">' + (l ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fLocker', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fLocker');
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar la taquilla?', l.place || '')) { S.remove('lockers', l.id); close(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          if (!f.place && !f.number) { err.textContent = 'Apunta al menos dónde está o su número'; err.hidden = false; return; }
          const data = { place: f.place || undefined, number: f.number || undefined, untilTime: f.untilTime || undefined, untilDate: f.untilDate || undefined, opens: f.opens || 'code', code: f.code || undefined, note: f.note || undefined };
          if (l) S.update('lockers', l.id, data);
          else {
            S.create('lockers', data);
            const cost = U.parseAmount(f.cost);
            if (cost) {
              const s = S.get(), t = S.today(), me = Object.values(s.travelers).find((p) => p.isMe) || Object.values(s.travelers)[0];
              S.create('expenses', { amount: cost, currency: 'JPY', category: 'other', paymentMethod: data.opens === 'suica' ? 'ic' : 'cash', description: 'Taquilla' + (data.place ? ' · ' + data.place : ''),
                date: t.now.date, cityId: t.phase === 'during' && t.city ? t.city.id : undefined, paidById: me && me.id, splitWithIds: me ? [me.id] : [] });
            }
          }
          close();
          UI.toast(l ? 'Taquilla guardada' : 'Taquilla apuntada: te saldrá arriba hasta que la vacíes');
        });
      }
    });
  };
  A.newLocker = () => F.locker();
  A.editLocker = (el) => F.locker(el.dataset.id);
  A.lockerDone = function (el) {
    const l = S.get().lockers[el.dataset.id];
    if (!l) return;
    const copy = Object.assign({}, l);
    S.remove('lockers', l.id);
    UI.toast('Taquilla vaciada', { label: 'Deshacer', run: () => S.create('lockers', copy) });
  };
  A.lockerCode = function (el) {
    const l = S.get().lockers[el.dataset.id];
    if (l && l.code) C.showcase({ ja: l.code, sub: [l.place, l.number ? 'Nº ' + l.number : ''].filter(Boolean).join(' · '), es: 'Código de la taquilla', lang: 'none', noSpeak: true }, { fullscreen: true });
  };

  function alerts(t) {
    const s = S.get(), out = [checkoutAlerts(t.now), returnCard(t), lockerCards(t.now, false)], n = t.now;
    // Datos importantes sin completar (ciudades de los días, noches sin alojamiento, hoteles para el taxista).
    const imp = t.phase !== 'after' && JT.missing ? JT.missing.important() : 0;
    if (imp) out.push(UI.banner('neutral', 'list', 'Datos por completar', JT.missing.count() + ' cosas que harían que la app te ayude más: ciudades de los días, alojamientos, horas…', { data: { act: 'go', to: 'missing' } }));
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
      if (!r.time || JT.data.isLodging(r.type) || r.date !== n.date) return;
      const diff = U.toMin(r.time) - n.minutes;
      if (diff > 0 && diff <= 180) out.push(UI.banner('accent', 'bell', 'En ' + diff + ' min: ' + r.name, r.confirmationCode ? 'Reserva ' + r.confirmationCode : '', { data: { act: 'go', to: 'reservation/' + r.id } }));
    });
    // Copia de seguridad: los datos sólo viven en este navegador.
    const last = SV.lastExport(), daysAgo = last ? Math.floor((Date.now() - last) / 86400000) : null;
    const own = ['activities', 'reservations', 'transports', 'expenses', 'places', 'restaurants', 'notes'].some((c) => Object.values(s[c]).some((x) => !x.isSample));
    // Durante el viaje, cada 2 días (cada día apuntas más cosas); antes y después, cada semana.
    const every = t.phase === 'during' ? 2 : 7;
    if (own && (daysAgo === null || daysAgo >= every))
      out.push(UI.banner('warn', 'download', 'Haz una copia de seguridad', daysAgo === null ? 'Aún no has exportado ninguna. Tus datos sólo están en este móvil.' : 'La última es de hace ' + daysAgo + ' días.',
        { action: UI.btn('Exportar', { size: 'sm', variant: 'secondary', data: { act: 'exportJson' } }) }));
    if (Object.values(s.expenses).some((e) => e.currency !== s.trip.mainCurrency) && !SV.rates())
      out.push(UI.banner('neutral', 'swap', 'Sin tipo de cambio', 'Conéctate una vez para descargar el tipo de cambio y sumar gastos en otras monedas.', { data: { act: 'go', to: 'settings' } }));
    const err = S.lastError();
    if (err) out.unshift(UI.banner('accent', 'alert', 'Aviso', err));
    return out.join('');
  }

  V.home = function () {
    const s = S.get(), t = S.today(), n = t.now;
    // Ajustes → Modo viaje → «En Inicio»: los dos (con el selector) o sólo uno de ellos.
    const views = s.settings.homeViews || 'both';
    const travel = views === 'travel' ? true : views === 'overview' ? false : S.travelModeActive();
    const head = UI.header({
      large: true, title: (s.trip.name + ' ' + (s.trip.emoji || '')).trim(), subtitle: U.fmtRange(s.trip.startDate, s.trip.endDate),
      actions: UI.iconBtn('sos', 'Emergencia', { act: 'go', to: 'emergency' }) + UI.iconBtn('swap', 'Conversor ¥ → €', { act: 'go', to: 'convert' }) + UI.iconBtn('search', 'Buscar', { act: 'go', to: 'search' }) + UI.iconBtn('settings', 'Ajustes', { act: 'go', to: 'settings' })
    });
    const seg = views !== 'both' ? '' : '<div class="seg" role="tablist">' +
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
    // Durante el viaje, la tarjeta se tiñe del color de la ciudad donde estás (con su kanji al lado del nombre).
    const tint = t.phase === 'during' && t.city ? cityTint(t.city) : '';
    let html = '<div class="card stack-sm' + (tint ? ' card--city' : t.phase === 'during' ? ' card--accent' : '') + '"' + tint + '><div class="hero"><div class="grow"><div class="eyebrow">' + (t.phase === 'during' ? esc(U.fmtDay(n.date).toUpperCase()) : t.phase === 'before' ? 'CUENTA ATRÁS' : 'FIN') + '</div>' +
      '<h2 class="title">' + esc(title) + (t.phase === 'during' && C.cityJa(t.city) ? ' <span class="ja-name" lang="ja">' + esc(C.cityJa(t.city)) + '</span>' : '') + '</h2><p class="muted small">' + esc(sub) + '</p></div>' +
      (t.phase === 'before' ? UI.btn('Probar Modo viaje', { icon: 'nav', size: 'sm', variant: 'ghost', data: { act: 'simulate' } }) : '') + '</div>' +
      C.clocks(n) + C.cityStrip(n.date) + '</div>';
    // Antes de salir: repaso de lo importante (copia sin conexión, voz, hoteles, emergencia…).
    if (t.phase === 'before' && t.daysUntil <= 30) {
      const r = JT.ready ? JT.ready.syncSummary() : null;
      html += UI.banner(r && r.pending ? 'warn' : 'info', 'check', '¿Listo para el viaje?', r && r.pending ? r.pending + (r.pending === 1 ? ' cosa por preparar' : ' cosas por preparar') + ' · toca para verlas' : 'Comprueba la copia sin conexión, la voz japonesa y lo demás antes de salir.', { data: { act: 'go', to: 'ready' } });
    }
    html += alerts(t);
    if (t.phase === 'during' && t.day && n.minutes >= 18 * 60) html += diaryCard(t.day);
    // Por la noche (y la víspera del viaje), lo de mañana en un vistazo.
    if ((t.phase === 'during' && n.minutes >= 18 * 60) || (t.phase === 'before' && t.daysUntil === 1)) html += tomorrowCard(U.addDays(n.date, 1));
    if (t.phase === 'after') html += UI.banner('accent', 'sparkle', 'Resumen del viaje', 'Días, ciudades, sitios, comidas probadas, gasto y tu mejor día, para compartir.', { data: { act: 'go', to: 'summary' } });
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

  /** Atributo style con el color de la ciudad (para teñir una tarjeta con .card--city). */
  const cityTint = (c) => (c && c.color ? ' style="--city:' + esc(c.color) + '"' : '');

  /** «Mañana en un vistazo»: ciudad, primer plan, trenes y vuelos, cambio de alojamiento y reservas con hora. */
  function tomorrowCard(date) {
    const s = S.get(), day = S.sortedDays().find((d) => d.date === date);
    if (!day) return '';
    const city = day.cityId && s.cities[day.cityId], prev = S.sortedDays().find((d) => d.date === U.addDays(date, -1));
    const moving = city && prev && prev.cityId && prev.cityId !== day.cityId;
    const list = S.dayActivities(day.id), first = list.find((a) => a.startTime && !a.transportId) || list.find((a) => !a.transportId);
    const trips = Object.values(s.transports).filter((x) => x.date === date).sort((a, b) => U.cmpTime(a.departTime, b.departTime));
    const out = Object.values(s.reservations).find((r) => JT.data.isLodging(r.type) && r.endDate === date);
    const inn = Object.values(s.reservations).find((r) => JT.data.isLodging(r.type) && r.date === date);
    const resv = Object.values(s.reservations).filter((r) => r.date === date && r.time && !JT.data.isLodging(r.type) && r.type !== 'flight' && r.type !== 'train').sort((a, b) => U.cmpTime(a.time, b.time));
    const line = (emoji, text, strong) => '<div class="tmw__row"><span aria-hidden="true">' + emoji + '</span><span>' + (strong ? '<b class="mono">' + esc(strong) + '</b> ' : '') + esc(text) + '</span></div>';
    const rows = [
      out && out !== inn ? line('🧳', 'Dejas ' + out.name + (out.checkoutTime ? ' (salida antes de las ' + out.checkoutTime + ')' : '')) : '',
      trips.map((x) => line(D.TRANSPORT[x.kind][1], x.origin + ' → ' + x.destination + (x.number ? ' · ' + x.number : ''), x.departTime)).join(''),
      first ? line('📍', 'Primer plan: ' + first.title, first.startTime) : '',
      resv.map((r) => line(D.RESERVATION[r.type][1], r.name, r.time)).join(''),
      inn ? line('🏨', (inn.time ? 'Check-in desde las ' + inn.time + ' en ' : 'Duermes en ') + inn.name) : ''
    ].join('');
    return UI.card('<div class="row row--between"><span class="eyebrow">MAÑANA · DÍA ' + S.dayNumber(day.id) + (city ? ' · ' + esc(city.name.toUpperCase()) : '') + '</span>' + (moving ? UI.pill('Cambias de ciudad', 'warn') : '') + '</div>' +
      (rows || '<p class="muted small">Día libre: nada planificado todavía.</p>') +
      '<small class="faint">' + list.length + (list.length === 1 ? ' plan' : ' planes') + ' en total</small>' +
      UI.btn('Ver el día de mañana', { icon: 'calendar', size: 'sm', variant: 'ghost', data: { act: 'go', to: 'day/' + day.id } }), { cls: 'stack-sm tmw' });
  }
  C.tomorrowCard = tomorrowCard;

  /* El Modo viaje está hecho de bloques que eliges y ordenas en Ajustes → Modo viaje.
     Los avisos (simulación, check-out) van siempre arriba. */
  const TRAVEL_BLOCKS = [
    ['where', 'Dónde estás (día y ciudades)'], ['now', 'Ahora y siguiente plan'], ['lockers', 'Taquillas y envíos de maletas'], ['quick', 'Accesos rápidos'],
    ['diary', 'Diario (por la noche)'], ['tomorrow', 'Mañana en un vistazo (por la noche)'], ['move', 'Cambio de ciudad (checklist, 2 días antes)'], ['return', 'Antes del vuelo (los 2 últimos días)'], ['converter', 'Conversor ¥ ⇄ €'], ['talk', 'Para comunicarte (frases y alergias)'],
    ['hotel', 'Esta noche duermes en'], ['gifts', 'Regalos y compras por hacer aquí'], ['money', 'Gastos (hoy, total, categorías y últimos)'], ['suica', 'Cartera (Suica y efectivo)'],
    ['reservations', 'Reservas de hoy'], ['later', 'Más tarde hoy'], ['notes', 'Notas de la ciudad'], ['hub', 'Tu viaje (apartados)']
  ];

  /** [{ id, label, on }] en tu orden; los bloques nuevos de futuras versiones se añaden al final, visibles. */
  function travelLayout() {
    const cfg = S.get().settings.travelBlocks || {}, off = cfg.off || [];
    const known = TRAVEL_BLOCKS.map((b) => b[0]);
    const order = (cfg.order || []).filter((id) => known.indexOf(id) > -1);
    // Un bloque nuevo (de una versión posterior) se coloca detrás del que lo precede en el orden de serie.
    known.forEach(function (id, k) {
      if (order.indexOf(id) > -1) return;
      const after = k > 0 ? order.indexOf(known[k - 1]) : -1;
      order.splice(after + 1, 0, id);
    });
    return order.map((id) => ({ id: id, label: TRAVEL_BLOCKS.find((b) => b[0] === id)[1], on: off.indexOf(id) === -1 }));
  }
  C.travelLayout = travelLayout;

  /** Los 3 últimos gastos de hoy (tocar uno lo abre para corregirlo). */
  function lastToday(all, date) {
    // Si hoy aún no hay gastos, los últimos apuntados (de días anteriores se abren bloqueados; «Editar» los desbloquea).
    let list = all.filter((e) => e.date === date).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const today = list.length > 0;
    if (!today) list = all.filter((e) => e.date < date).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) return '';
    return '<div class="mini-exps"><small class="eyebrow muted">' + (today ? 'ÚLTIMOS DE HOY' : 'ÚLTIMOS GASTOS') + '</small>' + list.slice(0, 3).map(function (e) {
      const c = D.EXPENSE[e.category] || ['Gasto', '•'], pay = e.paymentMethod && D.PAYMENT[e.paymentMethod];
      return '<button type="button" class="mini-exp" data-act="editExpense" data-id="' + e.id + '"><span class="mini-exp__emoji" style="--cc:' + C.catColor(e.category) + '" aria-hidden="true">' + c[1] + '</span>' +
        '<span class="grow"><span class="block mini-exp__t">' + esc(e.description || c[0]) + '</span><small class="muted">' + esc([e.date !== date ? '🔒 ' + U.fmtShort(e.date) : '', c[0], pay ? pay[1] + ' ' + pay[0] : ''].filter(Boolean).join(' · ')) + '</small></span>' +
        '<strong class="mono">' + U.money(e.amount, e.currency) + '</strong></button>';
    }).join('') + (today && list.length > 3 ? '<small class="faint">y ' + (list.length - 3) + ' más hoy</small>' : '') +
      '<button type="button" class="mini-exps__all" data-act="expAll">Ver todos los gastos ›</button></div>';
  }

  /* ── Cambios de ciudad (Tokio → Kanazawa → Takayama…) ──
     La checklist «Cada cambio de ciudad» se desmarca entera sola: cuando ya has llegado a una ciudad
     y pasa ese día, queda lista para el siguiente cambio. */
  function cityMoves() {
    const s = S.get(), out = [];
    let prev = null;
    S.sortedDays().filter((d) => d.cityId && s.cities[d.cityId]).forEach(function (d) {
      if (prev && d.cityId !== prev.cityId) out.push({ date: d.date, from: s.cities[prev.cityId], to: s.cities[d.cityId] });
      prev = d;
    });
    return out;
  }
  /** El cambio que toca preparar (el de hoy o el siguiente): { move, index, total, days }. */
  function nextMove(date) {
    const all = cityMoves(), i = all.findIndex((m) => m.date >= date);
    return i < 0 ? { move: null, index: all.length, total: all.length } : { move: all[i], index: i, total: all.length, days: U.diffDays(date, all[i].date) };
  }
  const moveWhen = (d) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días');
  function syncMoveLists() {
    const s = S.get(), nm = nextMove(S.today().now.date), key = nm.move ? nm.move.date : 'end';
    Object.values(s.checklists).filter((l) => l.section === 'move' && l.resetKey !== key).forEach(function (l) {
      if (l.resetKey) Object.values(s.checklistItems).forEach(function (i) { if (i.checklistId === l.id && i.done) { i.done = false; i.updatedAt = Date.now(); } });
      S.update('checklists', l.id, { resetKey: key });
    });
  }
  C.cityMoves = cityMoves; C.nextMove = nextMove; C.moveWhen = moveWhen; C.syncMoveLists = syncMoveLists;

  /* ── Antes del vuelo (los 2 últimos días) ──
     Una lista que sale de lo que ya tiene la app: tax free, saldo de la Welcome Suica, efectivo que sobra,
     maletas en camino, taquillas, regalos por comprar, check-in del vuelo, maletas y copia de seguridad.
     Lo que marcas se guarda (settings.returnDone). */
  function returnItems() {
    const s = S.get(), items = [], n = S.now();
    const flight = Object.values(s.transports).filter((x) => x.kind === 'flight' && x.date && x.date >= n.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    items.push({ k: 'checkin', t: 'Check-in online del vuelo de vuelta', sub: flight ? '✈️ ' + (flight.origin || '') + ' → ' + (flight.destination || '') + ' · ' + U.fmtShort(flight.date) + (flight.departTime ? ' a las ' + flight.departTime : '') : 'Suele abrirse en la web o la app de la aerolínea.' });
    const tf = Object.values(s.expenses).filter((e) => e.taxFree);
    if (tf.length) items.push({ k: 'taxfree', t: 'Compras tax free a mano', sub: tf.length + (tf.length === 1 ? ' compra · ' : ' compras · ') + C.moneySum(tf).text, data: { act: 'expSummary' } });
    const ic = C.walletInfo && C.walletInfo('ic'), cash = C.walletInfo && C.walletInfo('cash');
    if (ic && ic.active && ic.welcome && ic.balance > 0) items.push({ k: 'suica', t: 'Gastar el saldo de la Welcome Suica', sub: U.money(ic.balance, 'JPY') + ' · no se devuelve: konbinis, máquinas, tiendas del aeropuerto' });
    if (cash && cash.active && cash.balance > 0) items.push({ k: 'cash', t: 'Efectivo que te sobra', sub: U.money(cash.balance, 'JPY') + ' · gástalo o guárdalo para otro viaje' });
    Object.values(s.shipments || {}).forEach((x) => items.push({ k: 'ship-' + x.id, t: 'Maleta en camino a ' + (x.to || '¿?'), sub: x.arrival ? 'Llega el ' + U.fmtShort(x.arrival) : 'Sin fecha de llegada' }));
    Object.values(s.lockers || {}).forEach((l) => items.push({ k: 'lock-' + l.id, t: 'Vaciar la taquilla', sub: (l.place || '') + (l.number ? ' · nº ' + l.number : '') }));
    const gifts = Object.values(s.gifts).filter((g) => !g.bought);
    if (gifts.length) items.push({ k: 'gifts', t: gifts.length + (gifts.length === 1 ? ' compra pendiente' : ' compras pendientes'), sub: gifts.slice(0, 3).map((g) => g.idea).join(' · ') + (gifts.length > 3 ? '…' : ''), data: { act: 'go', to: 'gifts' } });
    items.push({ k: 'bags', t: 'Peso y tamaño de las maletas', sub: 'Compáralo con lo que incluye tu billete' });
    items.push({ k: 'backup', t: 'Copia de seguridad del viaje', sub: 'Para tenerlo todo al volver', data: { act: 'exportJson' } });
    return items;
  }
  function returnCard(t) {
    if (t.phase !== 'during' || t.totalDays - t.dayNumber > 1) return '';
    const done = S.get().settings.returnDone || {}, items = returnItems();
    const nDone = items.filter((i) => done[i.k]).length, left = t.totalDays - t.dayNumber;
    const sorted = items.slice().sort((a, b) => !!done[a.k] - !!done[b.k]);
    return '<div class="card cl tone-blue retc stack-sm"><div class="cl__head"><span class="cl__emoji" aria-hidden="true">✈️</span><span class="grow"><small class="eyebrow muted block">ANTES DEL VUELO · ' + (left === 0 ? 'VUELVES HOY' : 'VUELVES MAÑANA') + '</small>' +
      '<strong class="cl__title">Preparar la vuelta</strong><span class="cl__bar"><span style="width:' + (items.length ? (nDone / items.length) * 100 : 0) + '%"></span></span></span><span class="cl__count mono">' + nDone + '/' + items.length + '</span></div>' +
      '<div class="cl__items">' + sorted.map((i) => '<div class="check cl__item' + (done[i.k] ? ' is-done' : '') + '"><button type="button" class="check__main" role="checkbox" aria-checked="' + !!done[i.k] + '" data-act="returnToggle" data-k="' + esc(i.k) + '"><span class="check__box">' + (done[i.k] ? U.icon('check', 16) : '') + '</span><span class="grow"><span class="block">' + esc(i.t) + '</span>' + (i.sub ? '<small class="muted">' + esc(i.sub) + '</small>' : '') + '</span></button>' +
        (i.data && !done[i.k] ? UI.iconBtn('chevron', 'Abrir', i.data, { size: 16 }) : '') + '</div>').join('') + '</div></div>';
  }
  C.returnCard = returnCard;
  A.returnToggle = function (el) {
    const done = Object.assign({}, S.get().settings.returnDone || {}), k = el.dataset.k;
    if (done[k]) delete done[k]; else done[k] = true;
    S.setSettings({ returnDone: done });
  };

  /** Modo viaje: 2 días antes de cada cambio, la checklist con lo pendiente para marcar ahí mismo. */
  function moveCard(date) {
    const s = S.get(), nm = nextMove(date);
    if (!nm.move || nm.days > 2) return '';
    syncMoveLists();
    const lists = Object.values(s.checklists).filter((l) => l.section === 'move');
    if (!lists.length) return '';
    const items = Object.values(s.checklistItems).filter((i) => lists.some((l) => l.id === i.checklistId)).sort((a, b) => a.order - b.order);
    const done = items.filter((i) => i.done).length, pend = items.filter((i) => !i.done);
    return '<div class="card cl tone-teal movec stack-sm"><div class="cl__head"><span class="cl__emoji" aria-hidden="true">🚄</span><span class="grow"><small class="eyebrow muted">CAMBIO ' + (nm.index + 1) + ' DE ' + nm.total + ' · LLEGAS ' + esc(moveWhen(nm.days).toUpperCase()) + '</small>' +
      '<strong class="block">' + esc(nm.move.from.name) + ' → ' + esc(nm.move.to.name) + '</strong><span class="cl__bar"><span style="width:' + (items.length ? (done / items.length) * 100 : 0) + '%"></span></span></span><span class="cl__count mono">' + done + '/' + items.length + '</span></div>' +
      (pend.length ? '<div class="cl__items">' + pend.slice(0, 4).map((i) => '<div class="check cl__item"><button type="button" class="check__main" role="checkbox" aria-checked="false" data-act="toggleItem" data-id="' + i.id + '"><span class="check__box"></span><span>' + esc(i.text) + '</span></button></div>').join('') + '</div>' +
        (pend.length > 4 ? '<small class="faint">y ' + (pend.length - 4) + ' más</small>' : '') : '<p class="success small"><strong>¡Todo listo para el cambio! 🎉</strong></p>') +
      '<div class="row row--end row--wrap">' + UI.btn('Apuntar taquilla', { size: 'sm', variant: 'ghost', icon: 'lock', data: { act: 'newLocker' } }) + UI.btn('Enviar maleta', { size: 'sm', variant: 'ghost', icon: 'car', data: { act: 'newShipment' } }) + UI.btn('Ver la checklist', { size: 'sm', variant: 'ghost', icon: 'checklist', data: { act: 'go', to: 'checklist' } }) + '</div></div>';
  }

  function travelMode(t) {
    const s = S.get(), n = t.now, day = t.day, city = t.city;
    const up = S.upcoming(n, 4);
    // «Dónde estás» sale del plan (última parada de hoy o el hotel), no del GPS: para moverse se usa Google Maps.
    const here = S.inferArea(day, n);
    const current = up.find((u) => u.inProgress), next = up.find((u) => !u.inProgress);
    const hotel = S.hotelTonight(n.date);
    let html = '';
    if (n.simulated) html += UI.banner('warn', 'clock', 'Simulando ' + n.date + ' a las ' + n.time, 'Cámbialo o desactívalo en Ajustes → Modo viaje.', { data: { act: 'go', to: 'settings' } });
    html += checkoutAlerts(n);
    const blocks = {
      where: function () {
        const strip = C.cityStrip(n.date);
        if (!strip || t.phase !== 'during') return '';
        const tint = city ? cityTint(city) : '';
        return '<div class="card stack-sm' + (tint ? ' card--city' : '') + '"' + tint + '><small class="muted">Día ' + t.dayNumber + ' de ' + t.totalDays + (city ? ' · ' + esc(city.name) + (C.cityJa(city) ? ' <span lang="ja">' + esc(C.cityJa(city)) + '</span>' : '') : '') + (t.nextCity ? ' · después: ' + esc(t.nextCity.name) : '') + '</small>' + C.clocks(n) + strip + '</div>';
      },
      now: function () {
        return (current ? nextUpCard(current, 'AHORA') : '') + (next ? nextUpCard(next, 'SIGUIENTE', here, current ? 'la actividad actual' : 'tu última parada') : '') +
          (!current && !next ? UI.empty('🍵', 'Nada más por hoy', 'Disfruta. Puedes escribir el diario o planificar mañana.') : '');
      },
      quick: function () {
        // Con la Suica en marcha, un quinto acceso: gasto ya marcado «Pagado con: Suica».
        const ic = C.walletInfo && C.walletInfo('ic').active;
        return C.quick([
          ['wallet', 'Gasto', { act: 'newExpense' }]].concat(ic ? [['card', 'Gasto Suica', { act: 'newExpense', pay: 'ic' }]] : []).concat([
          ['calendar', ic ? 'Hoy' : 'Día de hoy', day ? { act: 'go', to: 'day/' + day.id } : { act: 'go', to: 'itinerary' }],
          ['chat', 'Frases', { act: 'go', to: 'phrases' }],
          hotel ? ['car', ic ? 'Taxi' : 'Taxi al hotel', { act: 'taxi', id: hotel.id }] : ['ticket', 'Reservas', { act: 'go', to: 'reservations' }]
        ]), ic ? '5' : '');
      },
      move: () => moveCard(n.date),
      return: () => returnCard(t),
      lockers: () => lockerCards(n, true),
      diary: () => (day && n.minutes >= 18 * 60 ? diaryCard(day) : ''),
      tomorrow: () => (n.minutes >= 18 * 60 ? tomorrowCard(U.addDays(n.date, 1)) : ''),
      converter: () => C.quickConverter(),
      talk: () => talkCard((current || next) && (current || next).activity),
      hotel: function () {
        if (!hotel) return '';
        const hl = hotel.location || {}, hdir = hl.coords || hl.name || hl.address ? U.directionsUrl(hl) : null;
        return UI.card('<div class="row"><span class="quick__icon tone-violet">' + U.icon('bed', 20) + '</span><div class="grow"><small class="eyebrow muted">ESTA NOCHE DUERMES EN</small><strong class="block">' + esc(hotel.name) + '</strong>' +
          (hotel.nameJa ? '<small class="muted" lang="ja">' + esc(hotel.nameJa) + '</small>' : '') + '</div></div>' +
          '<div class="row row--wrap">' + UI.btn('Para el taxista', { icon: 'car', size: 'sm', data: { act: 'taxi', id: hotel.id } }) +
          (hdir ? '<a class="btn btn--secondary btn--sm" href="' + esc(hdir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Volver al hotel</span></a>' : '') + '</div>', { cls: 'stack' });
      },
      gifts: function () {
        const gifts = city && C.giftsPendingIn ? C.giftsPendingIn(city.id) : [];
        return gifts.length ? UI.banner('accent', 'gift', 'En ' + city.name + ': ' + gifts.length + ' por comprar', gifts.map((g) => g.idea + (g.mine ? ' (para ti)' : '')).join(' · '), { data: { act: 'go', to: 'gifts' } }) : '';
      },
      money: function () {
        // Igual que «Gastos» del Resumen (total, restante, barra de categorías) más lo de hoy.
        const all = Object.values(s.expenses), spentToday = C.moneySum(all.filter((e) => e.date === n.date)), spentAll = C.moneySum(all), budget = s.trip.totalBudget;
        return UI.section('Gastos', UI.card('<div class="stats">' + UI.stat('Hoy', spentToday.text, '', true) + UI.stat('Total viaje', spentAll.text, budget ? 'de ' + U.money(budget, spentAll.main) : '') + '</div>' +
          (budget ? UI.progress(spentAll.total / budget, spentAll.total > budget ? 'accent' : 'info') + '<small class="muted">' + (spentAll.total > budget ? 'Te has pasado ' + U.money(spentAll.total - budget, spentAll.main) : 'Quedan ' + U.money(budget - spentAll.total, spentAll.main) + ' · ' + Math.round((spentAll.total / budget) * 100) + '% gastado') + '</small>' : '') +
          C.catStack(all, 3) + (spentAll.extra ? '<small class="faint">+ ' + esc(spentAll.extra) + ' sin convertir</small>' : '') + (C.quickExpenseRow ? C.quickExpenseRow() : '') + lastToday(all, n.date), { cls: 'stack', data: { act: 'go', to: 'expenses' } }),
          UI.btn('Detalle', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'expenses' } }));
      },
      suica: function () {
        if (!C.walletInfo) return '';
        return C.walletInfo('ic').active || C.walletInfo('cash').active ? C.walletCard() : '';
      },
      reservations: function () {
        const resv = day ? S.reservationsOffTimeline(day).filter((r) => !hotel || r.id !== hotel.id) : []; // el hotel de esta noche ya tiene su tarjeta
        return resv.length ? UI.section('Reservas de hoy', resv.map(C.reservationCard).join(''), UI.btn('Todas', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'reservations' } })) : '';
      },
      later: function () {
        const later = day ? S.dayActivities(day.id).filter((a) => a.status !== 'done' && a !== (current && current.activity) && a !== (next && next.activity) && (!a.startTime || U.toMin(a.startTime) >= n.minutes)) : [];
        return later.length ? UI.section('Más tarde hoy', UI.card('<div class="mini-tl">' + later.map((a) => '<button type="button" class="mini-tl__row" data-act="go" data-to="activity/' + a.id + '"><span class="mono">' + (a.startTime || '··:··') + '</span><span>' + D.ACTIVITY[a.category][1] + ' ' + esc(a.title) + '</span></button>').join('') + '</div>'),
          UI.btn('Día completo', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'day/' + day.id } })) : '';
      },
      notes: function () {
        const notes = Object.values(s.notes).filter((x) => (city && x.scope === 'city' && x.refId === city.id) || (day && x.scope === 'day' && x.refId === day.id)).sort((a, b) => b.pinned - a.pinned).slice(0, 3);
        return notes.length ? UI.section('Notas · ' + (city ? city.name : 'hoy'), notes.map((x) => C.noteCard(x)).join(''), UI.btn('Todas', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'notes' } })) : '';
      },
      hub: () => C.tripHub()
    };
    // Los bloques con título se pliegan tocándolo (se recuerda en settings.travelFolded).
    const folded = s.settings.travelFolded || [];
    travelLayout().forEach(function (b) { if (!b.on) return; const h = blocks[b.id](); if (h) html += foldable(b.id, h, folded.indexOf(b.id) > -1); });
    html += '<p class="center">' + UI.btn('Personalizar el Modo viaje', { icon: 'settings', size: 'sm', variant: 'ghost', data: { act: 'customizeTravel' } }) + '</p>';
    return html;
  }

  /** Un bloque con título (UI.section) se puede plegar tocando el título: queda sólo la cabecera. */
  function foldable(id, h, isFolded) {
    if (h.indexOf('<section class="section">') !== 0 || h.indexOf('<h2 class="section__title">') < 0) return h;
    return h.replace('<section class="section">', '<section class="section tb' + (isFolded ? ' is-folded' : '') + '" data-tb="' + id + '">')
      .replace(/<h2 class="section__title">([\s\S]*?)<\/h2>/, function (all, title) {
        return '<h2 class="section__title"><button type="button" class="tb__toggle" data-act="tbFold" data-id="' + id + '" aria-expanded="' + !isFolded + '">' + title + U.icon('down', 14) + '</button></h2>';
      });
  }
  A.tbFold = function (el) {
    const list = (S.get().settings.travelFolded || []).slice(), i = list.indexOf(el.dataset.id);
    if (i > -1) list.splice(i, 1); else list.push(el.dataset.id);
    S.setSettings({ travelFolded: list });
  };

  A.customizeTravel = function () {
    (JT.uiState.settingsOpen = JT.uiState.settingsOpen || {})['Modo viaje'] = true;
    JT.go('settings');
    setTimeout(function () { const el = document.querySelector('details.fold[data-fold="Modo viaje"]'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
  };

  /** «Para comunicarte» en el Modo viaje: tus frases ♥ a un toque y, si tienes, tus alergias. */
  /* Frases que suelen hacer falta según el tipo de plan (se buscan por su japonés entre tus frases). */
  const PLAN_PHRASES = {
    restaurant: ['二人です', 'メニューをお願いします', 'お会計をお願いします'],
    cafe: ['これをください', '持ち帰りで', 'お会計をお願いします'],
    transport: ['…に止まりますか？', '…行きは何番線ですか？', '次の駅はどこですか？'],
    hotel: ['予約しています', '荷物を預かってもらえますか？', 'チェックアウトをお願いします'],
    visit: ['大人二枚お願いします', '何時まで開いていますか？', '写真を撮ってもいいですか？'],
    onsen: ['タトゥーがあっても入れますか？', '大人二枚お願いします', '何時まで開いていますか？'],
    shopping: ['いくらですか？', 'カードで払えますか？', '免税できますか？'],
    activity: ['大人二枚お願いします', '予約しています', '写真を撮ってもいいですか？'],
    show: ['大人二枚お願いします', '予約しています', '写真を撮ってもいいですか？'],
    nightlife: ['ビールをください', 'もう一つお願いします', 'お会計は別々にできますか？']
  };

  function talkRow(p) {
    return '<div class="talk__row"><button type="button" class="talk__main" data-act="bigPhrase" data-id="' + p.id + '"><span class="talk__ja" lang="ja">' + esc(p.ja) + '</span><small class="muted">' + esc(p.es) + '</small></button>' + C.speakBtn(p.ja) + '</div>';
  }

  function talkCard(plan) {
    const all = Object.values(S.get().phrases);
    const allFavs = all.filter((p) => p.favorite), favs = allFavs.slice(0, 8);
    const allergy = C.hasAllergies && C.hasAllergies() ? UI.btn('Mis alergias', { icon: 'alert', size: 'sm', variant: 'secondary', data: { act: 'allergyCard' } }) : '';
    const rows = favs.map(talkRow).join('');
    // Para tu próximo plan: 3 frases útiles según su tipo (restaurante, tren, templo, onsen, compras…).
    const want = plan && PLAN_PHRASES[plan.category], forPlan = want ? want.map((ja) => all.find((p) => p.ja === ja)).filter(Boolean) : [];
    const planBlock = forPlan.length ? '<div class="talk__plan"><small class="eyebrow muted">PARA «' + esc(plan.title.toUpperCase()) + '»</small>' + forPlan.map(talkRow).join('') + '</div>' : '';
    return UI.section('Para comunicarte', UI.card(planBlock + (rows ? (planBlock ? '<small class="eyebrow muted">TUS FRASES</small>' : '') + rows + (allFavs.length > favs.length ? '<small class="faint">y ' + (allFavs.length - favs.length) + ' más en Frases → ♥ Favoritas</small>' : '') : '<p class="muted small">Elige las frases que quieres tener aquí a un toque.</p>') +
      '<div class="row row--wrap">' + allergy + UI.btn('Elegir frases', { icon: 'heart', size: 'sm', variant: 'secondary', data: { act: 'pickTalk' } }) + UI.btn('Todas', { icon: 'chat', size: 'sm', variant: 'ghost', data: { act: 'go', to: 'phrases' } }) + '</div>', { cls: 'stack-sm talk' }));
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
    const leaving = Object.values(s.reservations).find((r) => JT.data.isLodging(r.type) && r.endDate === d.date && (!hotel || hotel.id !== r.id));
    const tags = (leaving ? '<span class="daycard__tag">🧳 Check-out' + (leaving.checkoutTime ? ' ' + leaving.checkoutTime : '') + '</span>' : '') + trips.map((x) => '<span class="daycard__tag">' + D.TRANSPORT[x.kind][1] + ' ' + esc(x.origin + ' → ' + x.destination) + (x.departTime ? ' · ' + x.departTime : '') + '</span>').join('') +
      // El día que llegas al hotel: «Check-in 15:00 · nombre»; los demás días, sólo dónde dormís.
      (hotel ? '<span class="daycard__tag">🏨 ' + (hotel.date === d.date ? 'Check-in' + (hotel.time ? ' ' + hotel.time : '') + ' · ' : '') + esc(hotel.name) + '</span>' : '');
    // Pasados más tenues; hoy y mañana resaltados (para centrarte en lo que viene).
    const nowDate = S.today().now.date, isPast = d.date < nowDate, isTomorrow = d.date === U.addDays(nowDate, 1);
    return '<div id="day-' + d.id + '" class="card card--tap daycard' + (isToday ? ' card--accent' : '') + (isPast ? ' is-past' : '') + (isTomorrow ? ' is-tomorrow' : '') + '" style="--city:' + esc(city ? city.color || '#C8102E' : 'transparent') + '" tabindex="0" data-act="go" data-to="day/' + d.id + '">' +
      '<div class="daycard__top"><span class="daynum' + (isToday ? ' is-today' : '') + '"><small>DÍA</small><strong>' + num + '</strong></span>' +
      '<div class="grow"><strong>' + esc(U.fmtDay(d.date)) + '</strong> ' + (isToday ? UI.pill('Hoy', 'accent') : isTomorrow ? UI.pill('Mañana', 'info') : '') + (d.title ? '<small class="muted block">' + esc(d.title) + '</small>' : '') + '</div>' +
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
      body += UI.section((c ? c.name + (C.cityJa(c) ? ' ' + C.cityJa(c) : '') : 'Ciudad') + ' · ' + U.fmtRange(st.start, st.end), ids.map((id) => card(s.days[id])).join(''), '<small class="faint">' + st.nights + (st.nights === 1 ? ' noche' : ' noches') + '</small>');
    });
    const loose = days.filter((d) => !d.cityId && !isPast(d));
    if (loose.length) body += UI.section('Días sin ciudad', loose.map(card).join(''), UI.btn('Asignar', { size: 'sm', variant: 'ghost', data: { act: 'go', to: 'cities' } }));
    html += '<div class="itin">' + body + '</div>';
    html += '<div class="row row--center row--wrap">' + UI.btn('Ciudades', { icon: 'city', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'cities' } }) + UI.btn('Transporte', { icon: 'train', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'transport' } }) + UI.btn('Resumen', { icon: 'sparkle', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'summary' } }) +
      UI.btn('Datos que faltan' + (JT.missing && JT.missing.count() ? ' · ' + JT.missing.count() : ''), { icon: 'list', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'missing' } }) + '</div>';
    return { html: html };
  };
  A.goToday = (el) => { const c = document.getElementById('day-' + el.dataset.id); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  /* ══ VISTA DEL DÍA ═══════════════════════════════════════════ */

  /* ── Deslizar entre días ──────────────────────────────────────
     En la vista de un día, deslizar el dedo a la izquierda va al día siguiente y a la derecha al anterior.
     Se usa replace para que «atrás» vuelva al itinerario y no recorra todos los días vistos. */
  function dayNeighbors(id) {
    const days = S.sortedDays(), i = days.findIndex((d) => d.id === id);
    return { prev: i > 0 ? days[i - 1] : null, next: i > -1 && i < days.length - 1 ? days[i + 1] : null };
  }
  function goDay(id, dir) {
    JT.uiState.daySlide = dir; // animación de entrada (ver app.js → render y styles.css .slide-in-*)
    location.replace('#/day/' + id);
  }
  A.dayGo = (el) => goDay(el.dataset.id, el.dataset.dir);

  let swipeStart = null;
  document.addEventListener('touchstart', function (ev) {
    swipeStart = null;
    if (document.body.dataset.view !== 'day' || ev.touches.length !== 1 || document.querySelector('.sheet-wrap, .showcase')) return;
    // No interferir con cosas que ya se deslizan o se escriben.
    if (ev.target.closest('.chips--scroll, .swipe, input, textarea, select')) return;
    swipeStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', function (ev) {
    if (!swipeStart || document.body.dataset.view !== 'day') return;
    const tch = ev.changedTouches[0], dx = tch.clientX - swipeStart.x, dy = tch.clientY - swipeStart.y, dt = Date.now() - swipeStart.t;
    swipeStart = null;
    // Gesto claramente horizontal, de al menos 70 px y rápido (menos de 0,6 s).
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6 || dt > 600) return;
    const id = (location.hash.match(/day\/([\w-]+)/) || [])[1], nb = id && dayNeighbors(id);
    if (!nb) return;
    if (dx < 0 && nb.next) goDay(nb.next.id, 'next');
    else if (dx > 0 && nb.prev) goDay(nb.prev.id, 'prev');
  }, { passive: true });

  V.day = function (p) {
    const s = S.get(), day = s.days[p.id];
    if (!day) return { html: UI.header({ title: 'Día no encontrado', back: true }) + UI.empty('🗓️', 'Este día ya no existe') };
    const num = S.dayNumber(day.id), city = day.cityId && s.cities[day.cityId], n = S.now();
    const list = S.dayActivities(day.id), locs = list.map(S.resolveLocation);
    const spent = C.moneySum(Object.values(s.expenses).filter((e) => e.date === day.date));
    const est = C.moneySum(list.filter((a) => a.estimatedCost).map((a) => ({ amount: a.estimatedCost, currency: a.costCurrency || 'JPY' })));
    const resv = S.reservationsOffTimeline(day);
    const notes = Object.values(s.notes).filter((x) => (x.scope === 'day' && x.refId === day.id) || (city && x.scope === 'city' && x.refId === city.id));

    let html = UI.header({ back: true, eyebrow: 'DÍA ' + num + (city ? ' · ' + city.name.toUpperCase() : '') + (n.date === day.date ? ' · HOY' : ''), title: U.fmtLong(day.date), subtitle: day.title,
      actions: UI.iconBtn('share', 'Compartir día', { act: 'shareDay', id: day.id }) + UI.iconBtn('edit', 'Editar día', { act: 'editDay', id: day.id }) });
    // Ir al día anterior / siguiente (también deslizando el dedo a izquierda o derecha).
    const nb = dayNeighbors(day.id), sday = (d) => U.fmtDay(d.date).split(' ').slice(0, 2).join(' ');
    html += '<div class="daynav">' + (nb.prev ? '<button type="button" class="daynav__btn" data-act="dayGo" data-id="' + nb.prev.id + '" data-dir="prev">' + U.icon('back', 16) + '<span>Día ' + S.dayNumber(nb.prev.id) + ' · ' + esc(sday(nb.prev)) + '</span></button>' : '<span></span>') +
      '<small class="daynav__hint">desliza</small>' +
      (nb.next ? '<button type="button" class="daynav__btn daynav__btn--next" data-act="dayGo" data-id="' + nb.next.id + '" data-dir="next"><span>Día ' + S.dayNumber(nb.next.id) + ' · ' + esc(sday(nb.next)) + '</span>' + U.icon('chevron', 16) + '</button>' : '<span></span>') + '</div>';
    html += UI.card('<div class="stats">' + UI.stat('Actividades', list.filter((a) => a.status === 'done').length + '/' + list.length) + UI.stat('Gastado', spent.text) + UI.stat('Estimado', est.total ? est.text : '—') + '</div>');
    html += '<div class="row row--wrap">' + UI.btn('Actividad', { icon: 'plus', size: 'sm', data: { act: 'newActivity', day: day.id } }) +
      UI.btn('Planificar', { icon: 'sparkle', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'planner?day=' + day.id } }) +
      UI.btn('Ordenar por hora', { icon: 'swap', size: 'sm', variant: 'secondary', data: { act: 'sortDay', id: day.id } }) + '</div>';
    if (resv.length) html += UI.section('Reservas del día', resv.map(C.reservationCard).join(''));
    html += UI.section('Timeline', list.length
      ? '<div class="timeline">' + C.timeline(day.id) + '</div><p class="faint small tl-hint">Mantén pulsada una actividad para más opciones (mover, duplicar, reordenar…). Tiempos de desplazamiento estimados.</p>'
      : UI.empty('🗓️', 'Día libre', 'Añade actividades o usa la planificación inteligente para ordenar varios sitios.', UI.btn('Añadir actividad', { data: { act: 'newActivity', day: day.id } })));
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

  /** Cierre del día: lo gastado hoy, lo que te queda en la Suica y en efectivo, y el día más caro hasta ahora. */
  function dayClose(day) {
    const s = S.get(), main = s.trip.mainCurrency, rates = SV.rates();
    const spent = C.moneySum(Object.values(s.expenses).filter((e) => e.date === day.date));
    const tiles = ['<div class="dclose__t"><small>Hoy</small><strong class="mono">' + esc(spent.text) + '</strong></div>'];
    ['ic', 'cash'].forEach(function (w) {
      const x = C.walletInfo && C.walletInfo(w);
      if (x && x.active) tiles.push('<div class="dclose__t dclose__t--' + w + '"><small>' + (w === 'ic' ? '🚃 ' + esc(x.name) : '💴 Efectivo') + '</small><strong class="mono' + (x.balance < x.cfg.low ? ' warn' : '') + '">' + U.money(x.balance, 'JPY') + '</strong></div>');
    });
    // El día más caro del viaje hasta hoy (y si hoy lo supera).
    const byDay = {};
    Object.values(s.expenses).filter((e) => e.date >= s.trip.startDate && e.date <= day.date).forEach((e) => { const v = U.convert(e.amount, e.currency, main, rates); if (v !== null) byDay[e.date] = (byDay[e.date] || 0) + v; });
    const top = Object.keys(byDay).sort((a, b) => byDay[b] - byDay[a])[0];
    const topTxt = top ? (top === day.date ? '🔺 Hoy es el día más caro del viaje' : 'Día más caro: ' + U.fmtShort(top) + ' · ' + U.money(byDay[top], main)) : '';
    // Copia de seguridad: durante el viaje, si la última tiene 2 días o más, aquí mismo con su botón.
    const last = SV.lastExport(), ago = last ? Math.floor((Date.now() - last) / 86400000) : null;
    const backup = ago === null || ago >= 2 ? '<div class="row row--between dclose__bk"><small class="warn">💾 ' + (ago === null ? 'Aún no has hecho ninguna copia de seguridad' : 'Última copia hace ' + ago + ' días') + '</small>' + UI.btn('Hacer copia', { icon: 'download', size: 'sm', variant: 'secondary', data: { act: 'exportJson' } }) + '</div>' : '';
    return '<div class="dclose"><div class="dclose__row">' + tiles.join('') + '</div>' + (topTxt ? '<small class="muted">' + esc(topTxt) + '</small>' : '') + backup + '</div>';
  }

  /** Tarjeta «¿Qué tal hoy?»: por la noche en Inicio y en el Modo viaje. */
  function diaryCard(day) {
    const st = dayStats(day), mood = day.mood && D.MOOD[day.mood];
    return UI.card('<div class="row row--between"><span class="eyebrow">' + (day.diary || mood ? 'TU DIARIO DE HOY' : '¿QUÉ TAL HOY?') + '</span>' + (mood ? '<span class="diary__mood" aria-label="' + esc(mood[0]) + '">' + mood[1] + '</span>' : '') + '</div>' +
      '<small class="muted">' + st.done + ' de ' + st.total + ' planes hechos</small>' + dayClose(day) +
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
      actions: UI.iconBtn('sparkle', 'Resumen del viaje', { act: 'go', to: 'summary' }) + (days.length ? UI.iconBtn('share', 'Compartir el diario', { act: 'shareDiary' }) : '') });
    if (!days.length) return { html: head + UI.empty('📔', 'Aún no has escrito nada', 'Cada noche, en Inicio, sale «¿Qué tal hoy?». También puedes escribir desde la vista de cada día.') };
    return { html: head + days.map(function (d) {
      const city = d.cityId && s.cities[d.cityId], mood = d.mood && D.MOOD[d.mood], st = dayStats(d);
      return '<div class="card card--tap stack-sm diary" tabindex="0" data-act="editDiary" data-id="' + d.id + '" style="--city:' + esc(city ? city.color || 'var(--accent)' : 'var(--border)') + '">' +
        '<div class="row row--between"><span class="eyebrow">DÍA ' + S.dayNumber(d.id) + (city ? ' · ' + esc(city.name.toUpperCase()) : '') + '</span>' + (mood ? '<span class="diary__mood" aria-label="' + esc(mood[0]) + '">' + mood[1] + '</span>' : '') + '</div>' +
        '<strong>' + esc(U.fmtLong(d.date)) + '</strong>' + (d.diary ? '<p class="pre">' + esc(d.diary) + '</p>' : '') +
        '<small class="faint">' + st.done + ' de ' + st.total + ' planes · ' + esc(st.spent.text) + '</small></div>';
    }).join('') };
  };

  /* ══ RESUMEN DEL VIAJE ═══════════════════════════════════════
     Todo el viaje de un vistazo: días, ciudades, planes, sitios,
     restaurantes y comidas probadas, gasto, frases aprendidas, regalos
     y tu mejor día según el diario. Durante el viaje es «hasta hoy». */
  const MOOD_RANK = { great: 5, good: 4, ok: 3, tired: 2, bad: 1 };

  function tripStats() {
    const s = S.get(), t = S.today(), days = S.sortedDays();
    const upTo = t.phase === 'during' ? t.now.date : t.phase === 'after' ? (days[days.length - 1] || {}).date : null;
    const lived = upTo ? days.filter((d) => d.date <= upTo) : [];
    const livedIds = new Set(lived.map((d) => d.id));
    const acts = Object.values(s.activities), done = acts.filter((a) => a.status === 'done' && (!upTo || livedIds.has(a.dayId)));
    const places = Object.values(s.places), rests = Object.values(s.restaurants), foods = Object.values(s.foods), gifts = Object.values(s.gifts);
    const inTrip = Object.values(s.expenses).filter((e) => e.date >= s.trip.startDate && e.date <= s.trip.endDate);
    const all = C.moneySum(Object.values(s.expenses)), trip = C.moneySum(inTrip);
    const byDay = {};
    inTrip.forEach((e) => { const v = U.convert(e.amount, e.currency, s.trip.mainCurrency, SV.rates()); if (v !== null) byDay[e.date] = (byDay[e.date] || 0) + v; });
    const topDay = Object.keys(byDay).sort((a, b) => byDay[b] - byDay[a])[0];
    const daysWithSpend = Object.keys(byDay).length;
    const diary = days.filter((d) => d.diary || d.mood);
    const best = diary.filter((d) => d.mood).sort((a, b) => (MOOD_RANK[b.mood] || 0) - (MOOD_RANK[a.mood] || 0) || (b.diary || '').length - (a.diary || '').length)[0];
    return {
      s: s, t: t, days: days, lived: lived, acts: acts, done: done,
      visited: places.filter((p) => p.status === 'visited'), places: places,
      tried: rests.filter((r) => r.status === 'tried'), rests: rests,
      foodsTried: foods.filter((f) => f.tried), foods: foods,
      giftsBought: gifts.filter((g) => g.bought), gifts: gifts,
      learned: Object.values(s.phrases).filter((p) => p.learn === 'known').length, phrases: Object.keys(s.phrases).length,
      all: all, trip: trip, avg: daysWithSpend ? trip.total / daysWithSpend : 0, topDay: topDay, topDayValue: topDay ? byDay[topDay] : 0,
      diary: diary, best: best, stays: S.cityStays()
    };
  }

  V.summary = function () {
    const x = tripStats(), s = x.s, t = x.t, main = s.trip.mainCurrency;
    const status = t.phase === 'before' ? 'Aún no ha empezado: esto es lo que tienes planificado' : t.phase === 'during' ? 'Hasta hoy · día ' + t.dayNumber + ' de ' + t.totalDays : 'Viaje completo · ' + x.days.length + ' días';
    let html = UI.header({ back: true, title: 'Resumen del viaje', subtitle: status, actions: UI.iconBtn('share', 'Compartir el resumen', { act: 'shareSummary' }) });
    html += UI.card('<strong class="title">' + esc(s.trip.name) + '</strong><small class="muted">' + esc(U.fmtRange(s.trip.startDate, s.trip.endDate)) + '</small>' + C.cityStrip(t.phase === 'during' ? t.now.date : ''), { cls: 'stack-sm' });
    const big = (emoji, value, label, sub) => '<div class="sum__tile"><span class="sum__emoji" aria-hidden="true">' + emoji + '</span><b>' + esc(value) + '</b><span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    html += '<div class="sum__grid">' +
      big('🗓️', t.phase === 'before' ? String(x.days.length) : x.lived.length + ' / ' + x.days.length, t.phase === 'before' ? 'días de viaje' : 'días vividos') +
      big('🏙️', String(x.stays.length ? new Set(x.stays.map((st) => st.cityId)).size : 0), 'ciudades', x.stays.map((st) => C.cityJa(s.cities[st.cityId]) || (s.cities[st.cityId] || {}).name).filter((v, i, a) => v && a.indexOf(v) === i).join(' · ')) +
      big('✅', x.done.length + ' / ' + x.acts.length, 'planes hechos') +
      big('🛕', x.visited.length + ' / ' + x.places.length, 'sitios visitados') +
      big('🍜', x.tried.length + ' / ' + x.rests.length, 'restaurantes probados') +
      big('🍱', x.foodsTried.length + ' / ' + x.foods.length, 'comidas probadas') +
      big('💴', x.trip.text, 'gastado en el viaje', x.avg ? 'media ' + U.money(x.avg, main) + ' / día' : '') +
      big('🗣️', x.learned + ' / ' + x.phrases, 'frases aprendidas') +
      big('🎁', x.giftsBought.length + ' / ' + x.gifts.length, 'regalos comprados') +
      big('📔', String(x.diary.length), 'días con diario') + '</div>';
    // Ciudades: noches y gasto de cada una.
    if (x.stays.length) html += UI.section('Por ciudad', UI.card(x.stays.map(function (st) {
      const c = s.cities[st.cityId] || {}, spent = C.moneySum(Object.values(s.expenses).filter((e) => e.cityId === st.cityId && e.date >= st.start && e.date <= st.end));
      return '<div class="sum__city" style="--city:' + esc(c.color || 'var(--accent)') + '"><span class="sum__kanji" lang="ja">' + esc(C.cityJa(c) || '·') + '</span><span class="grow"><strong class="block">' + esc(c.name || 'Ciudad') + '</strong><small class="muted">' + esc(U.fmtRange(st.start, st.end) + ' · ' + st.nights + (st.nights === 1 ? ' noche' : ' noches')) + '</small></span><b class="mono">' + esc(spent.total ? spent.text : '—') + '</b></div>';
    }).join(''), { cls: 'stack-sm' }));
    // Gastos.
    if (x.all.total) html += UI.section('Gastos', UI.card('<div class="stats">' + UI.stat('Total', x.all.text, '', true) + UI.stat('Día más caro', x.topDay ? U.money(x.topDayValue, main) : '—', x.topDay ? U.fmtDay(x.topDay) : '') + '</div>' + C.catStack(Object.values(s.expenses), 4), { cls: 'stack', data: { act: 'go', to: 'expenses' } }));
    // Tu mejor día y el ánimo de cada día.
    if (x.diary.length) {
      const b = x.best;
      html += UI.section('Tu mejor día', (b ? UI.card('<div class="row row--between"><span class="eyebrow">DÍA ' + S.dayNumber(b.id) + (b.cityId && s.cities[b.cityId] ? ' · ' + esc(s.cities[b.cityId].name.toUpperCase()) : '') + '</span><span class="diary__mood">' + D.MOOD[b.mood][1] + '</span></div><strong>' + esc(U.fmtLong(b.date)) + '</strong>' + (b.diary ? '<p class="pre clamp4">' + esc(b.diary) + '</p>' : ''), { cls: 'stack-sm', data: { act: 'go', to: 'diary' } }) : '') +
        '<div class="sum__moods" aria-label="Cómo fue cada día">' + (t.phase === 'during' ? x.lived : x.days).map((d) => '<span title="' + esc('Día ' + S.dayNumber(d.id) + ' · ' + U.fmtShort(d.date)) + '">' + (d.mood ? D.MOOD[d.mood][1] : '·') + '</span>').join('') + '</div>');
    }
    // Comidas probadas y sitios favoritos.
    if (x.foodsTried.length) html += UI.section('Comidas probadas', '<div class="sum__chips">' + x.foodsTried.map((f) => '<span class="chip chip--static">' + esc(f.emoji + ' ' + f.name) + '</span>').join('') + '</div>');
    const favVisited = x.visited.filter((p) => p.favorite).concat(x.tried.filter((r) => r.favorite));
    if (favVisited.length) html += UI.section('Tus favoritos', '<div class="sum__chips">' + favVisited.map((p) => '<span class="chip chip--static">♥ ' + esc(p.name) + '</span>').join('') + '</div>');
    const stamps = Object.values(s.stamps || {});
    if (stamps.length) html += UI.section('Sellos · ' + stamps.length, '<div class="sum__chips">' + stamps.map((x) => '<span class="chip chip--static">🔖 ' + esc(x.name) + '</span>').join('') + '</div>');
    html += '<div class="stack-sm">' + UI.btn('Libro del viaje (imprimir o PDF)', { icon: 'book', block: true, data: { act: 'go', to: 'book' } }) +
      UI.btn('Compartir el resumen', { icon: 'share', block: true, variant: 'secondary', data: { act: 'shareSummary' } }) + '</div>';
    return { html: html };
  };

  /* ══ LIBRO DEL VIAJE ═════════════════════════════════════════
     Una página para imprimir o guardar en PDF (Imprimir → Guardar como PDF):
     portada, ruta, cada día con su diario, planes hechos, comidas y sellos, y al final gastos y favoritos.
     Durante el viaje llega hasta hoy; antes, es el plan. */
  V.book = function () {
    const x = tripStats(), s = x.s, t = x.t, main = s.trip.mainCurrency;
    const days = t.phase === 'during' ? x.lived : x.days;
    const ja = x.stays.map((st) => C.cityJa(s.cities[st.cityId])).filter((v, i, a) => v && a.indexOf(v) === i).join(' · ');
    let html = UI.header({ back: true, title: 'Libro del viaje', subtitle: t.phase === 'during' ? 'Hasta hoy · día ' + t.dayNumber + ' de ' + t.totalDays : t.phase === 'before' ? 'Lo planificado' : 'Viaje completo' }) +
      '<div class="book__actions stack-sm">' + UI.btn('Imprimir o guardar en PDF', { icon: 'download', block: true, data: { act: 'printBook' } }) +
      '<small class="faint center">En el móvil: Compartir o el menú ⋮ → Imprimir → Guardar como PDF.</small></div>';
    html += '<article class="book">';
    // Portada.
    html += '<header class="book__cover"><div class="book__flag" aria-hidden="true">' + esc(s.trip.emoji || '🇯🇵') + '</div><h1 class="book__title">' + esc(s.trip.name) + '</h1>' +
      '<p class="book__dates">' + esc(U.fmtRange(s.trip.startDate, s.trip.endDate)) + '</p>' + (ja ? '<p class="book__ja" lang="ja">' + esc(ja) + '</p>' : '') +
      '<p class="book__stats">' + esc((function () {
        const nCities = new Set(x.stays.map((st) => st.cityId)).size, nSt = Object.keys(s.stamps || {}).length;
        const pl = (n, one, many) => (n ? n + ' ' + (n === 1 ? one : many) : '');
        return [pl(days.length, 'día', 'días'), pl(nCities, 'ciudad', 'ciudades'), pl(x.done.length, 'plan hecho', 'planes hechos'), pl(x.foodsTried.length, 'comida probada', 'comidas probadas'), pl(nSt, 'sello', 'sellos')].filter(Boolean).join(' · ');
      })()) + '</p></header>';
    // Ruta.
    if (x.stays.length) html += '<section class="book__sec"><h2>La ruta</h2>' + x.stays.map(function (st) {
      const c = s.cities[st.cityId] || {};
      return '<div class="book__stay" style="--city:' + esc(c.color || 'var(--accent)') + '"><span class="book__kanji" lang="ja">' + esc(C.cityJa(c) || '·') + '</span><span class="grow"><strong>' + esc(c.name || 'Ciudad') + '</strong><small class="block">' + esc(U.fmtRange(st.start, st.end) + ' · ' + st.nights + (st.nights === 1 ? ' noche' : ' noches')) + '</small></span></div>';
    }).join('') + '</section>';
    // Día a día.
    html += '<section class="book__sec"><h2>Día a día</h2>' + days.map(function (d) {
      const city = d.cityId && s.cities[d.cityId], mood = d.mood && D.MOOD[d.mood];
      const acts = S.dayActivities(d.id).filter((a) => t.phase === 'before' || a.status === 'done');
      const foods = Object.values(s.foods).filter((f) => f.tried && f.triedDate === d.date);
      const stamps = Object.values(s.stamps || {}).filter((st) => st.date === d.date);
      const spent = C.moneySum(Object.values(s.expenses).filter((e) => e.date === d.date));
      return '<div class="book__day" style="--city:' + esc(city ? city.color || 'var(--accent)' : 'var(--border)') + '"><div class="book__dayhead"><span class="book__dayn">Día ' + S.dayNumber(d.id) + '</span><strong class="grow">' + esc(U.fmtLong(d.date)) + (city ? ' · ' + esc(city.name) : '') + '</strong>' + (mood ? '<span class="book__mood">' + mood[1] + '</span>' : '') + '</div>' +
        (d.diary ? '<p class="book__diary pre">' + esc(d.diary) + '</p>' : '') +
        (acts.length ? '<ul class="book__acts">' + acts.map((a) => '<li>' + (a.startTime ? '<span class="mono">' + esc(a.startTime) + '</span> ' : '') + (D.ACTIVITY[a.category] ? D.ACTIVITY[a.category][1] + ' ' : '') + esc(a.title) + '</li>').join('') + '</ul>' : '') +
        (foods.length || stamps.length || spent.total ? '<p class="book__extra">' + [foods.length ? '🍱 ' + foods.map((f) => f.name).join(', ') : '', stamps.length ? '🔖 ' + stamps.map((st) => st.name).join(', ') : '', spent.total ? '💴 ' + spent.text : ''].filter(Boolean).map(esc).join(' · ') + '</p>' : '') + '</div>';
    }).join('') + '</section>';
    // Comidas, sellos, favoritos y gastos.
    if (x.foodsTried.length) html += '<section class="book__sec"><h2>Comidas probadas</h2><p>' + x.foodsTried.map((f) => esc(f.emoji + ' ' + f.name)).join(' · ') + '</p></section>';
    const stampsAll = Object.values(s.stamps || {});
    if (stampsAll.length) html += '<section class="book__sec"><h2>Sellos</h2><p>' + stampsAll.map((st) => '🔖 ' + esc(st.name)).join(' · ') + '</p></section>';
    const favs = x.visited.filter((p) => p.favorite).concat(x.tried.filter((r) => r.favorite));
    if (favs.length) html += '<section class="book__sec"><h2>Favoritos</h2><p>' + favs.map((p) => '♥ ' + esc(p.name)).join(' · ') + '</p></section>';
    if (x.all.total) html += '<section class="book__sec"><h2>Gastos</h2><p><strong>' + esc(x.all.text) + '</strong>' + (x.avg ? ' · media ' + esc(U.money(x.avg, main)) + ' al día' : '') + (x.topDay ? ' · día más caro: ' + esc(U.fmtDay(x.topDay)) : '') + '</p>' +
      C.catStack(Object.values(s.expenses), 6) + '</section>';
    html += '<footer class="book__foot">Hecho con Japón Travel · ' + esc(U.fmtShort(t.now.date)) + '</footer></article>';
    return { html: html };
  };
  A.printBook = () => window.print();

  A.shareSummary = async function () {
    const x = tripStats(), s = x.s, t = x.t;
    const lines = [
      s.trip.name + ' (' + U.fmtRange(s.trip.startDate, s.trip.endDate) + ')' + (t.phase === 'during' ? ' — hasta el día ' + t.dayNumber : ''),
      '',
      '🗓️ ' + (t.phase === 'before' ? x.days.length + ' días de viaje' : x.lived.length + ' de ' + x.days.length + ' días'),
      '🏙️ ' + x.stays.map((st) => (s.cities[st.cityId] || {}).name + ' (' + st.nights + (st.nights === 1 ? ' noche' : ' noches') + ')').join(' → '),
      '✅ ' + x.done.length + ' planes hechos · 🛕 ' + x.visited.length + ' sitios visitados · 🍜 ' + x.tried.length + ' restaurantes',
      '🍱 Comidas probadas: ' + (x.foodsTried.length ? x.foodsTried.map((f) => f.emoji + ' ' + f.name).join(', ') : 'ninguna todavía'),
      '💴 Gastado: ' + x.all.text + (x.avg ? ' (media ' + U.money(x.avg, s.trip.mainCurrency) + ' al día)' : ''),
      '🗣️ ' + x.learned + ' frases aprendidas · 🎁 ' + x.giftsBought.length + ' regalos comprados',
      x.best ? '⭐ Mejor día: ' + U.fmtLong(x.best.date) + ' ' + D.MOOD[x.best.mood][1] + (x.best.diary ? ' — ' + x.best.diary.split('\n')[0] : '') : ''
    ].filter((l, i) => l || i === 1);
    const r = await SV.share(lines.join('\n'), 'Resumen del viaje');
    if (r === 'copied') UI.toast('Copiado');
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
      UI.field('Categoría', C.typePicker('category', D.ACTIVITY, a.category, 'activity')) +
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
  const RES_TYPE = { hotel: 'hotel', restaurant: 'restaurant', cafe: 'restaurant', transport: 'train', activity: 'activity', visit: 'activity', onsen: 'activity', nature: 'tour', show: 'show' };

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
    const hotel = day && S.reservationsOn(day.date).find((r) => JT.data.isLodging(r.type) && r.location && r.location.coords);
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
    const hotel = S.reservationsOn(day.date).find((r) => JT.data.isLodging(r.type) && r.location && r.location.coords);
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
        notes: it.suggestion ? undefined : 'Sin restaurante guardado cerca.' });
      mode = undefined;
    });
    st.result = null; st.selected = [];
    UI.toast('Plan añadido al itinerario');
    JT.go('day/' + day.id);
  };
})();
