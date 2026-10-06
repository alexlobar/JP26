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

  /* ══ MÁS ═════════════════════════════════════════════════════ */

  V.more = function () {
    const s = S.get(), n = (k) => Object.keys(s[k]).length;
    const pending = Object.values(s.checklistItems).filter((i) => !i.done).length;
    const group = (rows) => UI.card(rows.map((r) => UI.listRow({ emoji: r[0], title: r[1], sub: r[2], data: { act: 'go', to: r[3] } })).join(''), { cls: 'card--list' });
    return { html: UI.header({ title: 'Más' }) +
      group([['✨', 'Planificar día', 'Ordena 4-6 sitios por cercanía y horarios', 'planner'], ['🔎', 'Buscar', 'En todo el viaje', 'search'], ['📋', 'Importar enlace o texto', 'Google Maps, webs, confirmaciones', 'import']]) +
      group([['📍', 'Lugares', n('places') + ' guardados', 'places'], ['🏙️', 'Ciudades', n('cities') + ' ciudades', 'cities'], ['🎫', 'Reservas', n('reservations') + ' reservas', 'reservations'],
        ['🚄', 'Transporte', n('transports') + ' trayectos', 'transport'], ['🗒️', 'Notas', n('notes') + ' notas', 'notes'], ['✅', 'Checklist', pending ? pending + ' pendientes' : 'Todo listo', 'checklist'], ['📄', 'Documentos', n('docs') + ' datos importantes', 'documents']]) +
      group([['🗾', 'Información útil', 'Enchufes, emergencias, propinas…', 'info'], ['🗣️', 'Frases', 'Japonés básico offline', 'phrases'], ['⚙️', 'Configuración', 'Viaje, viajeros, APIs, datos', 'settings']]) };
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
      subtitle: U.fmtDay(r.date) + (r.time ? ' · ' + r.time : '') + (r.endDate ? ' → ' + U.fmtDay(r.endDate) : ''),
      actions: UI.iconBtn('share', 'Compartir', { act: 'shareReservation', id: r.id }) + UI.iconBtn('edit', 'Editar', { act: 'editReservation', id: r.id }) });
    if (r.confirmationCode) html += UI.card('<small class="muted">Nº DE RESERVA · toca para copiar</small><div class="display code">' + esc(r.confirmationCode) + '</div>', { tone: 'info', data: { act: 'copy', text: r.confirmationCode } });
    html += '<div class="row row--wrap">' + (dir ? '<a class="btn btn--primary btn--sm" href="' + esc(dir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Cómo llegar</span></a>' : '') +
      (r.phone ? '<a class="btn btn--secondary btn--sm" href="tel:' + esc(r.phone.replace(/[^\d+]/g, '')) + '">' + U.icon('phone', 16) + '<span>Llamar</span></a>' : '') +
      (r.url ? UI.btn('Web', { icon: 'link', size: 'sm', variant: 'secondary', data: { act: 'openUrl', url: r.url } }) : '') + '</div>';
    html += UI.card((loc.name || loc.address ? UI.listRow({ icon: 'pin', title: loc.name || loc.address, sub: loc.name ? loc.address : '' }) : '') + (r.phone ? UI.listRow({ icon: 'phone', title: r.phone }) : '') +
      (r.cost ? UI.listRow({ icon: 'wallet', title: U.money(r.cost, r.currency || 'JPY'), sub: 'Coste' }) : '') + (!loc.name && !loc.address && !r.phone && !r.cost ? '<p class="muted">Sin más datos.</p>' : ''));
    if (r.notes) html += UI.section('Notas', UI.card('<p class="pre">' + esc(r.notes) + '</p>', { tone: 'warn' }));
    if (linked.length) html += UI.section('En el itinerario', UI.card(linked.map((a) => UI.listRow({ icon: 'calendar', title: a.title, sub: a.startTime, data: { act: 'go', to: 'activity/' + a.id } })).join('')));
    return { html: html };
  };
  A.copy = async (el) => { await SV.copy(el.dataset.text); UI.toast('Copiado'); };
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
        UI.field('Salida (hoteles)', UI.input('endDate', r.endDate || '', { type: 'date' }), { optional: true }) +
        UI.field('Lugar', UI.input('locName', loc.name || ''), { optional: true }) + UI.field('Dirección', UI.input('address', loc.address || ''), { optional: true }) + C.coordsField(loc.coords) +
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
        const data = { type: f.type, name: f.name, confirmationCode: f.confirmationCode || undefined, date: f.date, time: f.time || undefined, endDate: f.endDate || undefined, location: location, cityId: f.cityId || undefined, cost: cost || undefined, currency: cost ? f.currency : undefined, phone: f.phone || undefined, url: f.url || undefined, notes: f.notes || undefined };
        if (ex) S.update('reservations', ex.id, data); else S.create('reservations', data);
        UI.toast('Reserva guardada');
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
        const data = { kind: f.kind, origin: f.origin, destination: f.destination, date: f.date, arriveDate: arriveDate, departTime: f.departTime || undefined, arriveTime: f.arriveTime || undefined, durationMinutes: dur, number: f.number || undefined, seat: f.seat || undefined, stops: st.stops.length ? st.stops : undefined, bookingCode: f.bookingCode || undefined, cost: cost || undefined, currency: cost ? f.currency : undefined, notes: f.notes || undefined };
        if (ex) S.update('transports', ex.id, data); else S.create('transports', data);
        UI.toast('Trayecto guardado');
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

  /* ══ INFORMACIÓN ÚTIL ════════════════════════════════════════ */

  V.info = function () {
    const s = S.get(), list = Object.values(s.infoArticles).sort((a, b) => a.order - b.order), rates = SV.rates();
    const jpyEur = U.convert(1, 'JPY', 'EUR', rates);
    const conv = UI.card('<small class="eyebrow muted">💱 CONVERSOR JPY → EUR</small>' + (jpyEur
      ? '<input class="input" inputmode="decimal" value="1000" data-input="convJpy" data-rate="' + jpyEur + '" aria-label="Yenes"><h2 class="title" id="convOut">' + U.money(1000, 'JPY') + ' ≈ ' + U.money(1000 * jpyEur, 'EUR') + '</h2><small class="faint">' + (rates.source === 'manual' ? 'Tipo manual' : 'BCE' + (rates.date ? ' · ' + rates.date : '') + (rates.rounding ? ' · yen redondeado al alza' : '')) + '</small>'
      : '<p class="muted">Sin tipo de cambio: conéctate una vez para descargarlo (se guarda para usarlo sin conexión) o defínelo en Ajustes.</p>'), { tone: 'muted', cls: 'stack-sm' });
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
    const cats = Array.from(new Set(all.map((p) => p.category)));
    const list = all.filter((p) => !st.cat || (st.cat === 'fav' ? p.favorite : p.category === st.cat))
      .filter((p) => !nq || U.normalize(p.es + ' ' + p.romaji).indexOf(nq) > -1 || p.ja.indexOf(q) > -1);
    const g = {};
    list.forEach((p) => (g[p.category] = (g[p.category] || []).concat(p)));
    return { html: UI.header({ back: true, title: 'Frases', subtitle: 'Funciona sin conexión · toca una frase para verla en grande', actions: UI.iconBtn('plus', 'Nueva frase', { act: 'newPhrase' }) }) +
      JT.searchBox('phrases', 'Buscar en español o romaji…') + JT.fchips('phrases', 'cat', [{ value: 'fav', label: '♥ Favoritas' }].concat(cats.map((c) => ({ value: c, label: c }))), 'Todas') +
      Object.keys(g).map((c) => UI.section(c, g[c].map((p) => '<div class="card card--tap phrase" tabindex="0" data-act="bigPhrase" data-id="' + p.id + '"><div class="grow"><small class="muted">' + esc(p.es) + '</small><div class="phrase__ja">' + esc(p.ja) + '</div><span class="accent">' + esc(p.romaji) + '</span></div>' +
        '<button type="button" class="iconbtn fav' + (p.favorite ? ' is-on' : '') + '" aria-pressed="' + !!p.favorite + '" aria-label="Favorita" data-act="fav" data-col="phrases" data-id="' + p.id + '">' + U.icon('heart', 20) + '</button></div>').join(''))).join('') };
  };
  A.bigPhrase = function (el) {
    const p = S.get().phrases[el.dataset.id];
    const close = UI.sheet({ title: p.es, body: '<div class="bigphrase" lang="ja">' + esc(p.ja) + '</div><p class="title accent center">' + esc(p.romaji) + '</p>',
      footer: '<div class="row">' + UI.btn('Copiar', { icon: 'copy', variant: 'secondary', block: true, data: { cp: '1' } }) + (p.isCustom ? UI.btn('Eliminar', { icon: 'trash', variant: 'danger', data: { rm: '1' } }) : '') + '</div>',
      onMount: function (root) {
        root.querySelector('[data-cp]').addEventListener('click', async () => { await SV.copy(p.ja); UI.toast('Copiado'); });
        const rm = root.querySelector('[data-rm]');
        if (rm) rm.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar frase?', p.es)) { S.remove('phrases', p.id); close(); } });
      } });
  };
  A.newPhrase = () => formSheet({
    id: 'fPh', title: 'Nueva frase',
    body: UI.field('En español', UI.input('es', '', { autofocus: true })) + UI.field('En japonés', UI.input('ja', '')) + UI.field('Pronunciación (romaji)', UI.input('romaji', ''), { optional: true }),
    onSave: (f) => { if (!f.es || !f.ja) return 'Escribe la frase en español y en japonés'; S.create('phrases', { es: f.es, ja: f.ja, romaji: f.romaji, category: 'Mis frases', favorite: true, isCustom: true }); }
  });

  /* ══ DOCUMENTOS (cofre cifrado para lo sensible) ═════════════ */

  V.documents = function () {
    const s = S.get(), list = Object.values(s.docs).sort((a, b) => a.title.localeCompare(b.title));
    const unlocked = SV.vaultUnlocked();
    let html = UI.header({ back: true, title: 'Documentos', subtitle: 'Datos importantes del viaje', actions: UI.iconBtn('plus', 'Nuevo dato', { act: 'newDoc' }) });
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
    const st = JT.uiState.import, items = L.parseImportLines(st.text), s = S.get();
    let html = UI.header({ back: true, title: 'Importar', subtitle: 'Enlaces de Google Maps, webs, texto o confirmaciones de reserva' });
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
    if (!st.text.trim()) html += '<p class="faint small">Si el texto no trae coordenadas, podrás buscarlas por nombre al crear el lugar (requiere conexión).</p>';
    return { html: html };
  };
  JT.changes.importText = JT.utils.debounce(function (el) { JT.uiState.import.text = el.value; JT.app.render({ keepFocus: true }); }, 350);
  A.pasteImport = async function () {
    try { JT.uiState.import.text = await navigator.clipboard.readText(); JT.app.render(); } catch (e) { UI.toast('El navegador no deja leer el portapapeles: pega con mantener pulsado'); }
  };
  A.clearImport = () => { JT.uiState.import.text = ''; JT.app.render(); };
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

  V.settings = function () {
    const s = S.get(), t = s.trip, st = s.settings, rates = SV.rates();
    const seg = (act, value, opts) => '<div class="seg">' + opts.map((o) => '<button type="button" class="seg__item' + (o[0] === value ? ' is-on' : '') + '" aria-pressed="' + (o[0] === value) + '" data-act="' + act + '" data-value="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    const travelers = Object.values(s.travelers).sort((a, b) => a.createdAt - b.createdAt);
    const pending = L.reminders(st.notifyLeadMinutes, Date.now()).length;
    let html = UI.header({ back: true, title: 'Configuración' });

    html += UI.section('Viaje', UI.card('<form id="fTrip" class="stack">' +
      UI.field('Nombre del viaje', UI.input('name', t.name)) +
      '<div class="row row--top">' + UI.field('Inicio', UI.input('startDate', t.startDate, { type: 'date' })) + UI.field('Fin', UI.input('endDate', t.endDate, { type: 'date' })) + '</div>' +
      UI.field('Moneda principal', UI.chips('mainCurrency', D.CURRENCIES.map((c) => ({ value: c, label: c })), t.mainCurrency)) +
      UI.field('Presupuesto total (' + t.mainCurrency + ')', UI.input('totalBudget', t.totalBudget || '', { inputmode: 'decimal' }), { optional: true }) +
      UI.btn('Guardar viaje', { type: 'submit', variant: 'secondary' }) + '</form>'));

    html += UI.section('Viajeros', UI.card(travelers.map((x) => '<div class="row"><span class="dot" style="background:' + esc(x.color) + '"></span><strong class="grow">' + esc(x.name) + '</strong>' +
      (x.isMe ? UI.pill('Yo', 'accent') : UI.btn('Soy yo', { size: 'sm', variant: 'ghost', data: { act: 'setMe', id: x.id } })) + UI.iconBtn('trash', 'Eliminar ' + x.name, { act: 'delTraveler', id: x.id }, { size: 18 }) + '</div>').join('') +
      '<form id="fTraveler" class="row"><input class="input" name="name" placeholder="Nombre del viajero" aria-label="Nombre del viajero">' + UI.btn('Añadir', { type: 'submit', size: 'sm' }) + '</form>' +
      '<small class="faint">Con 2 o más viajeros puedes indicar quién pagó cada gasto y repartirlo.</small>', { cls: 'stack' }));

    html += UI.section('Apariencia y unidades', UI.card(seg('setTheme', st.theme, [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']]) + seg('setUnits', st.units, [['km', 'Kilómetros'], ['mi', 'Millas']]), { cls: 'stack' }));

    html += UI.section('Modo viaje', UI.card(seg('setTravel', st.travelMode, [['auto', 'Automático'], ['on', 'Siempre'], ['off', 'Nunca']]) +
      '<small class="muted">Automático: Inicio cambia al Modo viaje durante las fechas del viaje.</small>' +
      '<form id="fSim" class="stack"><span class="field__label">Simular fecha y hora (para probar)</span><div class="row row--top">' + UI.field('Fecha', UI.input('simulatedDate', st.simulatedDate || '', { type: 'date' })) + UI.field('Hora', UI.input('simulatedTime', st.simulatedTime || '', { type: 'time' }), { optional: true }) + '</div>' +
      '<div class="row row--wrap">' + UI.btn('Aplicar', { type: 'submit', size: 'sm', variant: 'secondary' }) + UI.btn('Simular un día con plan a las 11:45', { size: 'sm', variant: 'secondary', data: { act: 'simulate' } }) + (st.simulatedDate ? UI.btn('Usar fecha real', { size: 'sm', variant: 'danger', data: { act: 'clearSim' } }) : '') + '</div></form>' +
      (st.simulatedDate ? UI.banner('warn', 'clock', 'Simulando ' + st.simulatedDate + (st.simulatedTime ? ' ' + st.simulatedTime : ''), 'Afecta a «hoy», al Modo viaje y a «abierto ahora».') : ''), { cls: 'stack' }));

    html += UI.section('Recordatorios', UI.card((SV.notificationsSupported() ? '' : UI.banner('neutral', 'bell', 'Este navegador no muestra notificaciones', 'Los avisos aparecerán dentro de la app.')) +
      seg('setNotif', st.notificationsEnabled ? 'on' : 'off', [['off', 'Desactivados'], ['on', 'Activados']]) +
      '<span class="field__label">Avisar antes de reservas y trenes</span>' + UI.filterChips([15, 30, 60, 90].map((m) => ({ value: m, label: m + ' min' })), st.notifyLeadMinutes, 'setLead', { scroll: false }) +
      '<small class="muted">Sólo avisos útiles: reservas con hora, trenes y vuelos (la víspera a las 20:00 y antes de salir), check-in online 24 h antes y entrada al hotel. ' + pending + ' próximos. ' +
      'Una web no puede avisar con la app cerrada: los avisos salen mientras está abierta (o en segundo plano reciente).</small>', { cls: 'stack' }));

    html += UI.section('APIs y datos externos', UI.card('<span class="field__label">Restaurantes cercanos</span>' +
      UI.filterChips([{ value: 'auto', label: 'Automático' }, { value: 'google', label: 'Google Places' }, { value: 'osm', label: 'OpenStreetMap' }, { value: 'mock', label: 'Mock (pruebas)' }], st.placesProvider, 'setProvider', { scroll: false }) +
      '<small class="muted">Automático usa Google Places si hay clave; si no, OpenStreetMap (gratis, sin clave, sin valoraciones). Mock genera datos inventados y etiquetados, sólo para desarrollo.</small>' +
      '<form id="fKey" class="stack">' + UI.field('Clave de Google Places API (New)', '<input class="input" name="key" type="password" autocomplete="off" placeholder="' + (SV.getPlacesKey() ? '•••••••• (guardada)' : 'AIza…') + '">', { optional: true, hint: 'Se guarda sólo en este navegador; no va en el código ni en las exportaciones. Restríngela en Google Cloud a tu dominio de GitHub Pages.' }) +
      '<div class="row">' + UI.btn('Guardar clave', { type: 'submit', size: 'sm' }) + (SV.getPlacesKey() ? UI.btn('Borrar clave', { size: 'sm', variant: 'danger', data: { act: 'delKey' } }) : '') + '</div></form>' +
      '<hr><span class="field__label">Redondeo del yen</span>' +
      UI.filterChips([{ value: 'up', label: 'Al alza' }, { value: 'up1', label: 'Al alza +1 ¥' }, { value: 'exact', label: 'Exacto' }], st.yenRounding, 'setYenRounding', { scroll: false }) +
      '<small class="muted">' + esc(yenRoundingExample(rates, t.mainCurrency)) + ' Se aplica al tipo del BCE, no a los manuales.</small>' +
      '<hr><span class="field__label">Tipo de cambio manual (opcional)</span><small class="muted">Por defecto: tipo de referencia del BCE (Frankfurter, sin clave)' + (rates && rates.date ? ', último ' + rates.date : '') + '. Un valor manual tiene prioridad.</small>' +
      '<form id="fRates" class="stack">' + D.CURRENCIES.filter((c) => c !== t.mainCurrency).map((c) => UI.field('1 ' + c + ' = ? ' + t.mainCurrency, UI.input('rate_' + c, st.manualRates[c] || '', { inputmode: 'decimal', placeholder: 'Automático' }), { optional: true })).join('') +
      '<div class="row">' + UI.btn('Guardar tipos', { type: 'submit', size: 'sm', variant: 'secondary' }) + (SV.online() ? UI.btn('Actualizar BCE', { size: 'sm', variant: 'ghost', icon: 'refresh', data: { act: 'refreshRates' } }) : '') + '</div></form>', { cls: 'stack' }));

    html += UI.section('Datos', UI.card(UI.btn('Exportar todo (JSON)', { icon: 'download', variant: 'secondary', block: true, data: { act: 'exportJson' } }) +
      UI.btn('Exportar gastos (CSV)', { icon: 'download', variant: 'secondary', block: true, data: { act: 'exportCsv' } }) +
      UI.btn('Importar (JSON)', { icon: 'upload', variant: 'secondary', block: true, data: { act: 'importJson' } }) +
      '<small class="faint">Los datos sensibles cifrados de Documentos no se incluyen en la exportación. PC y móvil no se sincronizan: usa exportar e importar para pasar datos.</small><hr>' +
      (t.isSample ? UI.btn('Quitar datos de ejemplo', { icon: 'flag', variant: 'soft', block: true, data: { act: 'removeSample' } }) : UI.btn('Cargar viaje de ejemplo', { icon: 'flag', variant: 'soft', block: true, data: { act: 'loadSample' } })) +
      UI.btn('Empezar un viaje nuevo', { icon: 'plus', variant: 'soft', block: true, data: { act: 'newTrip' } }) +
      UI.btn('Borrar todos los datos', { icon: 'trash', variant: 'danger', block: true, data: { act: 'wipe' } }), { cls: 'stack' }));

    html += UI.section('Esta instalación', UI.card('<small class="muted">Japón Travel v' + U.VERSION + ' · ' + esc(location.protocol === 'file:' ? 'Archivo local' : location.host) + ' · datos en el localStorage de este navegador' + (S.isWritable() ? '' : ' (BLOQUEADO: no se guardan cambios)') + '.<br>Funciona sin conexión; mapa base, restaurantes cercanos, geocodificación y tipos de cambio requieren Internet.</small><small class="muted" id="swStatus"></small>', { tone: 'muted', cls: 'stack-sm' }));

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
        root.querySelector('#fKey').addEventListener('submit', function (ev) {
          ev.preventDefault();
          const k = ev.target.key.value.trim();
          if (!k) return;
          SV.setPlacesKey(k);
          UI.toast('Clave guardada en este navegador');
          JT.app.render();
        });
        root.querySelector('#fRates').addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(ev.target), manual = {};
          for (const c of D.CURRENCIES) {
            const v = f['rate_' + c];
            if (v === undefined || v === '') continue;
            const n = Number(String(v).replace(',', '.'));
            if (!(n > 0)) return UI.toast('Tipo no válido para ' + c);
            manual[c] = n;
          }
          S.setSettings({ manualRates: manual });
          UI.toast('Tipos guardados');
        });
        const sw = root.querySelector('#swStatus');
        if ('caches' in window && location.protocol !== 'file:') caches.keys().then((k) => { sw.textContent = k.length ? 'Caché offline: ' + k.join(', ') + (k.indexOf('japon-travel-v' + U.VERSION) === -1 ? ' ⚠️ no coincide con la versión: recarga la página' : ' ✓') : 'Caché offline: todavía no instalada'; });
        else sw.textContent = location.protocol === 'file:' ? 'Abierta como archivo local: sin caché offline ni instalación (publícala en GitHub Pages para eso).' : '';
      }
    };
  };

  /** «Hoy: 1 EUR = 177,32 ¥ en el BCE → la app usa 178 ¥.» con el tipo guardado. */
  function yenRoundingExample(rates, main) {
    const other = main === 'JPY' ? 'EUR' : main;
    const ex = rates && rates.exact ? U.convert(1, other, 'JPY', { base: rates.base, perUnit: rates.exact }) : null;
    if (!ex) return 'Ejemplo: si el BCE da 1 EUR = 177,32 ¥, «Al alza» usa 178 ¥ y «+1» usa 179 ¥.';
    const used = U.convert(1, other, 'JPY', rates);
    return 'Hoy: 1 ' + other + ' = ' + ex.toFixed(2).replace('.', ',') + ' ¥ en el BCE → la app usa ' + U.money(used, 'JPY').replace('¥', '') + ' ¥.';
  }

  A.setYenRounding = (el) => S.setSettings({ yenRounding: el.dataset.value });
  A.setTheme = (el) => S.setSettings({ theme: el.dataset.value });
  A.setUnits = (el) => S.setSettings({ units: el.dataset.value });
  A.setTravel = (el) => S.setSettings({ travelMode: el.dataset.value });
  A.clearSim = () => S.setSettings({ simulatedDate: '', simulatedTime: '' });
  A.setLead = (el) => S.setSettings({ notifyLeadMinutes: Number(el.dataset.value) });
  A.setProvider = (el) => S.setSettings({ placesProvider: el.dataset.value });
  A.delKey = () => { SV.setPlacesKey(''); UI.toast('Clave borrada'); JT.app.render(); };
  A.setNotif = async function (el) {
    if (el.dataset.value === 'on' && SV.notificationsSupported()) await SV.requestNotifications();
    S.setSettings({ notificationsEnabled: el.dataset.value === 'on' });
  };
  A.setMe = (el) => { Object.values(S.get().travelers).forEach((x) => x.isMe && S.update('travelers', x.id, { isMe: false })); S.update('travelers', el.dataset.id, { isMe: true }); };
  A.delTraveler = async (el) => { const x = S.get().travelers[el.dataset.id]; if (await UI.confirm('¿Eliminar a ' + x.name + '?', 'Sus gastos se conservarán sin «quién pagó».')) S.remove('travelers', x.id); };
  A.exportJson = () => SV.download('japon-travel-' + new Date().toISOString().slice(0, 10) + '.json', S.exportJson(), 'application/json');
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
