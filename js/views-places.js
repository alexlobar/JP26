/* ============================================================
   views-places.js — Pestaña Sitios (lugares para visitar +
   restaurantes), restaurantes cerca y ciudades.
   ============================================================ */
(function () {
  'use strict';

  const U = JT.utils, D = JT.data, S = JT.store, L = JT.logic, UI = JT.ui, C = JT.cards, SV = JT.services;
  const esc = U.esc;
  const V = JT.views, F = JT.forms, A = JT.actions;
  JT.changes = JT.changes || {};

  A.fav = (el) => { const e = S.get()[el.dataset.col][el.dataset.id]; if (e) S.update(el.dataset.col, e.id, { favorite: !e.favorite }); };
  A.go = (el) => JT.go(el.dataset.to);
  A.back = () => (history.length > 1 ? history.back() : JT.go(''));

  /** Filtro genérico guardado en JT.uiState[view][key]; data-value vacío = quitar. */
  A.filter = function (el) {
    const st = JT.uiState[el.dataset.view];
    const v = el.dataset.value;
    st[el.dataset.key] = st[el.dataset.key] === v && el.dataset.toggle ? '' : v;
    JT.app.render();
  };
  function fchips(view, key, opts, allLabel) {
    const cur = JT.uiState[view][key] || '';
    return '<div class="chips chips--scroll">' + [{ value: '', label: allLabel || 'Todos' }].concat(opts).map((o) =>
      '<button type="button" class="chip chip--btn' + (String(o.value) === String(cur) ? ' is-on' : '') + '" aria-pressed="' + (String(o.value) === String(cur)) + '" data-act="filter" data-view="' + view + '" data-key="' + key + '" data-value="' + esc(o.value) + '"><span>' + (o.emoji ? o.emoji + ' ' : '') + esc(o.label) + '</span></button>').join('') + '</div>';
  }
  JT.fchips = fchips;

  function searchBox(view, placeholder) {
    return '<label class="search"><span class="search__icon">' + U.icon('search', 18) + '</span><input class="input" type="search" placeholder="' + esc(placeholder) + '" value="' + esc(JT.uiState[view].q || '') + '" data-input="filterText" data-view="' + view + '" aria-label="' + esc(placeholder) + '"></label>';
  }
  JT.searchBox = searchBox;
  JT.changes.filterText = (el) => { JT.uiState[el.dataset.view].q = el.value; JT.app.render({ keepFocus: true }); };

  /* ══ SITIOS ══════════════════════════════════════════════════
     Una pestaña con dos listas: «Para visitar» (#/places) y
     «Para comer» (#/food). #/sites abre la última que usaste. */

  V.sites = (p, q) => (JT.uiState.sites.kind === 'food' ? V.food : V.places)(p, q);

  function sitesHeader(kind) {
    const s = S.get();
    JT.uiState.sites.kind = kind;
    const tabs = [['visit', 'places', '📍 Para visitar', Object.keys(s.places).length], ['food', 'food', '🍜 Para comer', Object.keys(s.restaurants).length]];
    const seg = '<div class="seg" role="tablist">' + tabs.map((t) => '<button type="button" role="tab" class="seg__item' + (t[0] === kind ? ' is-on' : '') + '" aria-selected="' + (t[0] === kind) + '" data-act="go" data-to="' + t[1] + '">' + t[2] + ' · ' + t[3] + '</button>').join('') + '</div>';
    const add = kind === 'food' ? UI.iconBtn('plus', 'Nuevo restaurante', { act: 'newRestaurant', city: JT.uiState.food.city })
      : UI.iconBtn('plus', 'Nuevo lugar', { act: 'newPlace', city: JT.uiState.places.city });
    return UI.header({ title: 'Sitios', subtitle: 'Qué ver y dónde comer', actions: UI.iconBtn('clipboard', 'Importar texto o enlace', { act: 'go', to: 'import' }) + add }) + C.sampleBanner() + seg;
  }

  /* ── Para visitar ── */

  V.places = function () {
    const s = S.get(), st = JT.uiState.places, nq = U.normalize(st.q || '');
    const list = Object.values(s.places)
      .filter((p) => !st.city || p.cityId === st.city)
      .filter((p) => !st.cat || p.category === st.cat)
      .filter((p) => !st.status || (st.status === 'fav' ? p.favorite : p.status === st.status))
      .filter((p) => !nq || U.normalize(p.name + ' ' + (p.neighborhood || '') + ' ' + (p.description || '')).indexOf(nq) > -1)
      .sort((a, b) => b.favorite - a.favorite || (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0) || a.name.localeCompare(b.name));
    const groups = {};
    list.forEach((p) => (groups[p.cityId || ''] = (groups[p.cityId || ''] || []).concat(p)));
    let html = sitesHeader('visit');
    html += searchBox('places', 'Buscar lugares…') +
      fchips('places', 'status', [{ value: 'pending', label: 'Pendientes' }, { value: 'visited', label: 'Visitados' }, { value: 'fav', label: '♥ Favoritos' }]) +
      fchips('places', 'city', C.cityOptions(), 'Todas las ciudades') +
      fchips('places', 'cat', D.options(D.PLACE), 'Todas las categorías');
    html += list.length ? Object.keys(groups).map((cid) => UI.section(s.cities[cid] ? s.cities[cid].name : 'Sin ciudad', groups[cid].map((p) => C.placeCard(p)).join(''))).join('')
      : UI.empty('📍', 'Sin lugares', 'Guarda templos, barrios, miradores… o pega un enlace de Google Maps.', UI.btn('Añadir lugar', { data: { act: 'newPlace', city: st.city } }));
    return { html: html };
  };

  V.place = function (p) {
    const s = S.get(), x = s.places[p.id];
    if (!x) return { html: UI.header({ title: 'Lugar no encontrado', back: true }) + UI.empty('📍', 'Este lugar ya no existe') };
    const c = D.PLACE[x.category], city = x.cityId && s.cities[x.cityId];
    const dir = U.directionsUrl(x, null, 'train');
    const linked = Object.values(s.activities).filter((a) => a.placeId === x.id);
    const notes = Object.values(s.notes).filter((n) => n.scope === 'place' && n.refId === x.id);
    const near = x.coords ? S.savedNear(x.coords, 1).slice(0, 3) : [];
    let html = UI.header({ back: true, eyebrow: (c[1] + ' ' + c[0] + (city ? ' · ' + city.name : '')).toUpperCase(), title: x.name, subtitle: x.neighborhood,
      actions: UI.iconBtn('heart', 'Favorito', { act: 'fav', col: 'places', id: x.id }, { active: x.favorite }) + UI.iconBtn('share', 'Compartir', { act: 'sharePlace', id: x.id }) + UI.iconBtn('edit', 'Editar', { act: 'editPlace', id: x.id }) });
    if (x.imageUrl) html += '<img class="hero-img" src="' + esc(x.imageUrl) + '" alt="' + esc(x.name) + '" loading="lazy" onerror="this.remove()">';
    html += '<div class="row row--wrap">' + UI.btn(x.status === 'visited' ? 'Visitado' : 'Marcar visitado', { icon: 'check', size: 'sm', variant: x.status === 'visited' ? 'soft' : 'primary', data: { act: 'toggleVisited', id: x.id } }) +
      (dir ? '<a class="btn btn--secondary btn--sm" href="' + esc(dir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Cómo llegar</span></a>' : '') +
      (x.coords ? UI.btn('Restaurantes cerca', { emoji: '🍜', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'nearby?' + C.q({ lat: x.coords.lat, lng: x.coords.lng, label: x.name }) } }) : '') +
      UI.btn('Al itinerario', { icon: 'calendar', size: 'sm', variant: 'secondary', data: { act: 'newActivity', place: x.id, title: x.name } }) + '</div>';
    html += UI.card('<div class="pills">' + UI.pill('Prioridad ' + D.PRIORITY[x.priority][0].toLowerCase(), x.priority === 'high' ? 'accent' : 'neutral') + UI.openBadge(x.hours) + (x.priceApprox ? UI.pill(x.priceApprox) : '') + '</div>' +
      (x.hours ? UI.listRow({ icon: 'clock', title: 'Horario', sub: x.hours }) : '') +
      (x.address || x.coords ? UI.listRow({ icon: 'pin', title: x.address || 'Ubicación', sub: x.coords ? x.coords.lat.toFixed(5) + ', ' + x.coords.lng.toFixed(5) : '' }) : '<small class="faint">Sin ubicación: edítalo para buscar coordenadas y tener «Cómo llegar».</small>') +
      (x.url ? UI.listRow({ icon: 'link', title: 'Web', sub: x.url, data: { act: 'openUrl', url: x.url } }) : ''), { cls: 'stack' });
    if (x.description) html += UI.section('Descripción', '<p class="pre">' + esc(x.description) + '</p>');
    if (x.notes) html += UI.section('Notas personales', UI.card('<p class="pre">' + esc(x.notes) + '</p>', { tone: 'warn' }));
    if (linked.length) html += UI.section('En el itinerario', UI.card(linked.map((a) => UI.listRow({ icon: 'calendar', title: a.title, sub: (s.days[a.dayId] ? U.fmtDay(s.days[a.dayId].date) : '') + (a.startTime ? ' · ' + a.startTime : ''), data: { act: 'go', to: 'activity/' + a.id } })).join('')));
    if (near.length) html += UI.section('Restaurantes guardados cerca', near.map((n) => C.restaurantCard(n.restaurant, n.km)).join(''));
    html += UI.section('Notas', notes.map((n) => C.noteCard(n, false)).join(''), UI.btn('Nota', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newNote', scope: 'place', ref: x.id } }));
    return { html: html };
  };

  A.toggleVisited = (el) => { const x = S.get().places[el.dataset.id]; S.update('places', x.id, { status: x.status === 'visited' ? 'pending' : 'visited' }); };
  A.sharePlace = async (el) => { const r = await SV.share(L.sharePlace(S.get().places[el.dataset.id], false)); if (r === 'copied') UI.toast('Copiado'); };

  function hoursHint(v) {
    return v ? (U.parseHours(v) ? '✓ Horario reconocido: se mostrará si está abierto' : 'Formato no reconocido: se mostrará tal cual') : 'Formato: Mo-Su 09:00-17:00 · Tu-Su 10:00-18:00; Mo off · 24/7';
  }
  function bindHoursHint(form) {
    const i = form.querySelector('[name="hours"]'), h = form.querySelector('#hoursHint');
    if (i && h) i.addEventListener('input', () => (h.textContent = hoursHint(i.value.trim())));
  }

  F.place = function (id, def) {
    const s = S.get(), ex = id ? s.places[id] : null;
    def = def || {};
    const x = ex || { name: def.name || '', cityId: def.cityId, category: def.category || 'temple', priority: 'medium', coords: def.coords, url: def.url, address: def.address };
    const body = '<form id="fPlace" class="stack" novalidate>' +
      UI.field('Nombre', UI.input('name', x.name, { placeholder: 'p.ej. Fushimi Inari Taisha', autofocus: !ex && !def.name })) +
      UI.field('Ciudad', UI.chips('cityId', C.cityOptions(), x.cityId, { allowNone: true, noneLabel: 'Sin ciudad' })) +
      UI.field('Categoría', UI.chips('category', D.options(D.PLACE), x.category)) +
      C.coordsField(x.coords) +
      UI.details('Más detalles',
        UI.field('Prioridad', UI.chips('priority', D.options(D.PRIORITY), x.priority)) +
        '<div class="row row--top">' + UI.field('Barrio', UI.input('neighborhood', x.neighborhood || ''), { optional: true }) + UI.field('Precio aprox.', UI.input('priceApprox', x.priceApprox || '', { placeholder: '≈ ¥500' }), { optional: true }) + '</div>' +
        UI.field('Horario', UI.input('hours', x.hours || ''), { optional: true, hint: hoursHint(x.hours), hintId: 'hoursHint' }) +
        UI.field('Duración de la visita (min)', UI.input('visitMinutes', x.visitMinutes || '', { inputmode: 'numeric', placeholder: String(D.VISIT_MIN[x.category]) }), { optional: true, hint: 'La usa la planificación inteligente del día.' }) +
        UI.field('Dirección', UI.input('address', x.address || ''), { optional: true }) +
        UI.field('Descripción', UI.textarea('description', x.description), { optional: true }) +
        UI.field('Notas personales', UI.textarea('notes', x.notes), { optional: true }) +
        UI.field('URL', UI.input('url', x.url || '', { type: 'url' }), { optional: true }) +
        UI.field('Imagen (URL)', UI.input('imageUrl', x.imageUrl || '', { type: 'url' }), { optional: true, hint: 'Necesita conexión la primera vez que se ve.' }), !!ex) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar lugar' : 'Nuevo lugar', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fPlace', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fPlace');
        bindHoursHint(form);
        C.bindCoords(form, () => { const f = UI.formData(form); return [f.name, f.cityId && s.cities[f.cityId] ? s.cities[f.cityId].name : ''].filter(Boolean).join(', '); });
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar lugar?', 'Las actividades que lo usan conservarán su ubicación.')) { S.remove('places', ex.id); close(); if (location.hash.indexOf(ex.id) > -1) history.back(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          const vm = f.visitMinutes ? Number(f.visitMinutes) : undefined;
          const problem = !f.name ? 'Escribe un nombre' : f.coords && !C.parseCoords(f.coords) ? 'Coordenadas no válidas (formato: lat, lng)' : vm !== undefined && !(vm > 0) ? 'Duración no válida' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const data = { name: f.name, cityId: f.cityId || undefined, category: f.category, coords: C.parseCoords(f.coords), priority: f.priority || 'medium', neighborhood: f.neighborhood || undefined, priceApprox: f.priceApprox || undefined, hours: f.hours || undefined, visitMinutes: vm, address: f.address || undefined, description: f.description || undefined, notes: f.notes || undefined, url: f.url || undefined, imageUrl: f.imageUrl || undefined };
          if (ex) S.update('places', ex.id, data); else S.create('places', Object.assign(data, { status: 'pending', favorite: false }));
          UI.toast(ex ? 'Lugar guardado' : 'Lugar añadido');
          close();
        });
      }
    });
  };
  A.newPlace = (el) => F.place(null, { cityId: el.dataset.city || undefined });
  A.editPlace = (el) => F.place(el.dataset.id);

  /* ── Para comer (restaurantes guardados) ── */

  V.food = function () {
    const s = S.get(), st = JT.uiState.food, t = S.today(), nq = U.normalize(st.q || '');
    if (st.city === undefined) st.city = t.phase === 'during' && t.city ? t.city.id : '';
    const list = Object.values(s.restaurants)
      .filter((r) => !st.city || r.cityId === st.city).filter((r) => !st.cuisine || r.cuisine === st.cuisine)
      .filter((r) => !st.status || (st.status === 'fav' ? r.favorite : r.status === st.status))
      .filter((r) => !nq || U.normalize(r.name + ' ' + (r.neighborhood || '') + ' ' + D.CUISINE[r.cuisine][0] + ' ' + (r.notes || '')).indexOf(nq) > -1)
      .sort((a, b) => b.favorite - a.favorite || a.name.localeCompare(b.name));
    let html = sitesHeader('food');
    html += UI.btn('Restaurantes cerca de tu próximo plan', { icon: 'calendar', variant: 'secondary', block: true, data: { act: 'nearPlan' } });
    html += searchBox('food', 'Buscar restaurantes…') +
      fchips('food', 'status', [{ value: 'want', label: 'Quiero ir' }, { value: 'tried', label: 'Probados' }, { value: 'fav', label: '♥ Favoritos' }]) +
      fchips('food', 'city', C.cityOptions(), 'Todas las ciudades') + fchips('food', 'cuisine', D.options(D.CUISINE), 'Toda la comida');
    html += list.length ? UI.section(st.city && s.cities[st.city] ? s.cities[st.city].name : 'Todos', list.map((r) => C.restaurantCard(r)).join(''))
      : UI.empty('🍜', 'Nada por aquí', 'Guarda restaurantes que quieras probar o busca cerca de tu próxima actividad.', UI.btn('Añadir restaurante', { data: { act: 'newRestaurant', city: st.city } }));
    return { html: html };
  };

  A.nearPlan = function () {
    const t = S.today(), nx = S.upcoming(t.now, 1)[0], loc = nx && S.resolveLocation(nx.activity);
    const c = (loc && loc.coords) || S.inferArea(t.day, t.now) || (t.city && t.city.coords);
    if (c) JT.go('nearby?' + C.q({ lat: c.lat, lng: c.lng, label: (loc && loc.name) || (t.city && t.city.name) })); else UI.toast('No hay ubicación en tu itinerario');
  };

  V.restaurant = function (p) {
    const s = S.get(), r = s.restaurants[p.id];
    if (!r) return { html: UI.header({ title: 'Restaurante no encontrado', back: true }) + UI.empty('🍜', 'Este restaurante ya no existe') };
    const c = D.CUISINE[r.cuisine], city = r.cityId && s.cities[r.cityId], dir = U.directionsUrl(r, null, 'walk');
    const linked = Object.values(s.activities).filter((a) => a.restaurantId === r.id);
    const notes = Object.values(s.notes).filter((n) => n.scope === 'restaurant' && n.refId === r.id);
    let html = UI.header({ back: true, eyebrow: (c[1] + ' ' + c[0] + (r.priceLevel ? ' · ' + D.PRICE[r.priceLevel] : '')).toUpperCase(), title: r.name, subtitle: [r.neighborhood, city && city.name].filter(Boolean).join(' · '),
      actions: UI.iconBtn('heart', 'Favorito', { act: 'fav', col: 'restaurants', id: r.id }, { active: r.favorite }) + UI.iconBtn('share', 'Compartir', { act: 'shareRestaurant', id: r.id }) + UI.iconBtn('edit', 'Editar', { act: 'editRestaurant', id: r.id }) });
    html += '<div class="row row--wrap">' + (dir ? '<a class="btn btn--primary btn--sm" href="' + esc(dir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Cómo llegar</span></a>' : '') +
      UI.btn('Al itinerario', { icon: 'calendar', size: 'sm', variant: 'secondary', data: { act: 'newActivity', restaurant: r.id, title: r.name, category: r.cuisine === 'cafe' ? 'cafe' : 'restaurant' } }) +
      UI.btn('Gasto', { icon: 'plus', size: 'sm', variant: 'secondary', data: { act: 'newExpense', city: r.cityId, place: r.name } }) +
      UI.btn('Reserva', { emoji: '🎫', size: 'sm', variant: 'secondary', data: { act: 'newReservation', type: 'restaurant', name: r.name } }) + '</div>';
    html += UI.card('<div class="chips">' + [['want', '📌 Quiero ir'], ['tried', '✅ Probado']].map((o) => '<button type="button" class="chip chip--btn' + (r.status === o[0] ? ' is-on' : '') + '" aria-pressed="' + (r.status === o[0]) + '" data-act="restStatus" data-id="' + r.id + '" data-value="' + o[0] + '"><span>' + o[1] + '</span></button>').join('') + '</div>' +
      '<div class="stack-sm"><small class="muted">Mi valoración</small>' + UI.stars(r.rating, { act: 'rate', id: r.id }) + '</div>', { cls: 'stack' });
    html += UI.card('<div class="pills">' + UI.openBadge(r.hours) + '</div>' + (r.hours ? UI.listRow({ icon: 'clock', title: 'Horario', sub: r.hours }) : '') + (r.priceApprox ? UI.listRow({ icon: 'wallet', title: 'Precio', sub: r.priceApprox }) : '') +
      (r.address || r.coords ? UI.listRow({ icon: 'pin', title: r.address || 'Ubicación', sub: r.coords ? r.coords.lat.toFixed(5) + ', ' + r.coords.lng.toFixed(5) : '' }) : '<small class="faint">Sin ubicación: edítalo para añadir coordenadas.</small>') +
      (r.url ? UI.listRow({ icon: 'link', title: 'Web / reserva', sub: r.url, data: { act: 'openUrl', url: r.url } }) : ''), { cls: 'stack' });
    if (r.notes) html += UI.section('Notas', UI.card('<p class="pre">' + esc(r.notes) + '</p>', { tone: 'warn' }));
    if (linked.length) html += UI.section('En el itinerario', UI.card(linked.map((a) => UI.listRow({ icon: 'calendar', title: a.title, sub: (s.days[a.dayId] ? U.fmtDay(s.days[a.dayId].date) : '') + (a.startTime ? ' · ' + a.startTime : ''), data: { act: 'go', to: 'activity/' + a.id } })).join('')));
    html += UI.section('Más notas', notes.map((n) => C.noteCard(n, false)).join(''), UI.btn('Nota', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newNote', scope: 'restaurant', ref: r.id } }));
    return { html: html };
  };

  A.restStatus = (el) => { const r = S.get().restaurants[el.dataset.id]; S.update('restaurants', r.id, { status: r.status === el.dataset.value ? 'none' : el.dataset.value }); };
  A.rate = (el) => { const v = Number(el.dataset.value); const r = S.get().restaurants[el.dataset.id]; S.update('restaurants', r.id, { rating: v || undefined, status: v ? 'tried' : r.status }); };
  A.shareRestaurant = async (el) => { const r = await SV.share(L.sharePlace(S.get().restaurants[el.dataset.id], true)); if (r === 'copied') UI.toast('Copiado'); };

  F.restaurant = function (id, def) {
    const s = S.get(), ex = id ? s.restaurants[id] : null;
    def = def || {};
    const r = ex || { name: def.name || '', cityId: def.cityId, cuisine: def.cuisine || 'ramen', status: 'want', coords: def.coords, url: def.url, address: def.address, hours: def.hours, priceLevel: def.priceLevel, notes: def.notes };
    const body = '<form id="fRest" class="stack" novalidate>' +
      UI.field('Nombre', UI.input('name', r.name, { placeholder: 'p.ej. Ichiran Shibuya', autofocus: !ex && !def.name })) +
      UI.field('Tipo de comida', UI.chips('cuisine', D.options(D.CUISINE), r.cuisine)) +
      UI.field('Ciudad', UI.chips('cityId', C.cityOptions(), r.cityId, { allowNone: true, noneLabel: 'Sin ciudad' })) +
      '<div class="row row--top row--wrap">' + UI.field('Precio', UI.chips('priceLevel', [1, 2, 3, 4].map((n) => ({ value: n, label: D.PRICE[n] })), r.priceLevel, { allowNone: true, noneLabel: '—' })) +
      UI.field('Estado', UI.chips('status', [{ value: 'want', label: 'Quiero ir' }, { value: 'tried', label: 'Probado' }], r.status, { allowNone: true, noneLabel: '—' })) + '</div>' +
      C.coordsField(r.coords) +
      UI.details('Más detalles',
        '<div class="row row--top">' + UI.field('Barrio', UI.input('neighborhood', r.neighborhood || ''), { optional: true }) + UI.field('Precio aprox.', UI.input('priceApprox', r.priceApprox || '', { placeholder: '¥1.000–2.000' }), { optional: true }) + '</div>' +
        UI.field('Dirección', UI.input('address', r.address || ''), { optional: true }) +
        UI.field('Horario', UI.input('hours', r.hours || ''), { optional: true, hint: hoursHint(r.hours), hintId: 'hoursHint' }) +
        UI.field('URL', UI.input('url', r.url || '', { type: 'url' }), { optional: true }) +
        UI.field('Notas', UI.textarea('notes', r.notes), { optional: true }), !!ex) +
      '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar restaurante' : 'Nuevo restaurante', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fRest', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fRest');
        bindHoursHint(form);
        C.bindCoords(form, () => { const f = UI.formData(form); return [f.name, f.neighborhood, f.cityId && s.cities[f.cityId] ? s.cities[f.cityId].name : ''].filter(Boolean).join(', '); });
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar restaurante?', ex.name)) { S.remove('restaurants', ex.id); close(); if (location.hash.indexOf(ex.id) > -1) history.back(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          const problem = !f.name ? 'Escribe un nombre' : f.coords && !C.parseCoords(f.coords) ? 'Coordenadas no válidas (formato: lat, lng)' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const data = { name: f.name, cuisine: f.cuisine, cityId: f.cityId || undefined, priceLevel: f.priceLevel ? Number(f.priceLevel) : undefined, status: f.status || 'none', coords: C.parseCoords(f.coords), neighborhood: f.neighborhood || undefined, priceApprox: f.priceApprox || undefined, address: f.address || undefined, hours: f.hours || undefined, url: f.url || undefined, notes: f.notes || undefined };
          let newId;
          if (ex) S.update('restaurants', ex.id, data); else newId = S.create('restaurants', Object.assign(data, { favorite: false }));
          UI.toast(ex ? 'Restaurante guardado' : 'Restaurante añadido');
          close();
          if (def.openAfter && newId) JT.go('restaurant/' + newId);
        });
      }
    });
  };
  A.newRestaurant = (el) => F.restaurant(null, { cityId: el.dataset.city || (S.today().phase === 'during' && S.today().city ? S.today().city.id : undefined) });
  A.editRestaurant = (el) => F.restaurant(el.dataset.id);

  /* ══ RESTAURANTES CERCA ══════════════════════════════════════
     Primero tus guardados (offline); después «Descubrir» con un
     proveedor externo (OpenStreetMap por defecto, sin clave). */

  const nearbyState = { radius: 1000, cuisine: '', open: false, result: null, error: null, loading: false, key: '' };

  V.nearby = function (p, q) {
    const center = q.lat && q.lng ? { lat: Number(q.lat), lng: Number(q.lng) } : null;
    if (!center || !U.validCoords(center)) return { html: UI.header({ back: true, title: 'Restaurantes cerca' }) + UI.empty('📍', 'Sin ubicación', 'Abre esta pantalla desde un lugar o actividad con coordenadas.') };
    const st = nearbyState, units = S.get().settings.units;
    const key = center.lat + ',' + center.lng + ',' + st.radius;
    if (st.key !== key) { st.key = key; st.result = null; st.error = null; st.loading = false; }
    const saved = S.savedNear(center, st.radius / 1000).filter((x) => !st.cuisine || x.restaurant.cuisine === st.cuisine);
    const savedNames = new Set(Object.values(S.get().restaurants).map((r) => r.name.toLowerCase()));
    const results = st.result ? st.result.results.filter((r) => (!st.cuisine || r.cuisine === st.cuisine) && (!st.open || r.openNow === true)) : [];

    let html = UI.header({ back: true, eyebrow: 'RESTAURANTES CERCA', title: q.label || 'Esta zona', subtitle: center.lat.toFixed(4) + ', ' + center.lng.toFixed(4) });
    html += UI.filterChips([500, 1000, 2000].map((r) => ({ value: r, label: U.fmtKm(r / 1000, units) })), st.radius, 'nearRadius', { scroll: false }) +
      '<div class="chips">' + '<button type="button" class="chip chip--btn' + (st.open ? ' is-on' : '') + '" aria-pressed="' + st.open + '" data-act="nearOpen"><span>🟢 Abierto ahora</span></button></div>' +
      UI.filterChips([{ value: '', label: 'Toda la comida' }].concat(D.options(D.CUISINE)), st.cuisine, 'nearCuisine');
    html += UI.section('Tus guardados (' + saved.length + ')', saved.length ? saved.map((x) => C.restaurantCard(x.restaurant, x.km)).join('') : '<p class="muted small">Ninguno en este radio.</p>');
    let disc = C.offlineBanner('Descubrir restaurantes');
    if (st.result && st.result.source === 'mock') disc += UI.banner('warn', 'alert', 'Datos de prueba (MOCK)', 'Resultados inventados para desarrollo. Cambia el proveedor en Ajustes → APIs.');
    if (st.result && st.result.source === 'osm') disc += '<p class="faint small">Datos de OpenStreetMap (sin valoraciones ni precios). Para valoraciones y «abierto ahora» más fiable, configura Google Places en Ajustes.</p>';
    if (st.loading) disc += '<div class="loading"><span class="spinner"></span><small class="muted">Buscando…</small></div>';
    if (st.error) disc += UI.banner('accent', 'alert', 'No se pudo buscar', st.error, { action: UI.btn('Reintentar', { size: 'sm', variant: 'secondary', data: { act: 'nearRetry' } }) });
    if (st.result && !results.length) disc += '<p class="muted small">Sin resultados con estos filtros.</p>';
    disc += results.map((r) => externalCard(r, savedNames.has(r.name.toLowerCase()), center)).join('');
    if (st.result) disc += '<p class="faint small">' + esc(st.result.label) + ' · los horarios y datos pueden no estar actualizados.</p>';
    html += UI.section('Descubrir', disc, st.result ? UI.pill('Fuente: ' + st.result.label, st.result.source === 'mock' ? 'warn' : 'neutral') : '');
    return {
      html: html,
      mount: function () {
        if (!st.result && !st.loading && !st.error && (SV.online() || S.get().settings.placesProvider === 'mock')) {
          st.loading = true;
          SV.nearby(center, st.radius).then((r) => { if (st.key === key) { st.result = r; st.loading = false; JT.app.render(); } })
            .catch((e) => { if (st.key === key) { st.error = e.message; st.loading = false; JT.app.render(); } });
          JT.app.render();
        }
      }
    };
  };

  function externalCard(r, saved, origin) {
    const c = D.CUISINE[r.cuisine], units = S.get().settings.units;
    const dir = U.directionsUrl({ coords: r.coords, name: r.name }, origin, 'walk');
    nearbyState.byId = nearbyState.byId || {};
    nearbyState.byId[r.id] = r;
    return UI.card('<div class="row row--top"><span class="item__emoji" aria-hidden="true">' + c[1] + '</span><div class="grow"><strong>' + esc(r.name) + '</strong>' +
      '<small class="muted block">' + esc([r.cuisineLabel || c[0], r.priceLevel ? D.PRICE[r.priceLevel] : '', U.fmtKm(r.km, units)].filter(Boolean).join(' · ')) + '</small>' +
      (r.address ? '<small class="faint block">' + esc(r.address) + '</small>' : '') + '</div></div>' +
      '<div class="pills">' + UI.openBadge(r.source === 'google' ? undefined : r.hours, r.openNow) + (r.rating ? UI.stars(Math.round(r.rating)) + '<small class="muted">' + r.rating.toFixed(1) + (r.ratingCount ? ' (' + r.ratingCount + ')' : '') + '</small>' : '') + '</div>' +
      (r.hours ? '<small class="faint">🕐 ' + esc(r.hours) + '</small>' : '') +
      '<div class="row row--wrap"><a class="btn btn--primary btn--sm" href="' + esc(dir) + '" target="_blank" rel="noopener">' + U.icon('nav', 16) + '<span>Ir</span></a>' +
      UI.btn(saved ? 'Guardado' : 'Guardar', { icon: saved ? 'check' : 'plus', size: 'sm', variant: 'secondary', disabled: saved, data: { act: 'saveExternal', id: r.id } }) +
      (r.website || r.mapsUrl ? UI.btn('Ficha', { icon: 'link', size: 'sm', variant: 'ghost', data: { act: 'openUrl', url: r.website || r.mapsUrl } }) : '') + '</div>', { cls: 'stack' });
  }

  A.nearRadius = (el) => { nearbyState.radius = Number(el.dataset.value); JT.app.render(); };
  A.nearCuisine = (el) => { nearbyState.cuisine = el.dataset.value; JT.app.render(); };
  A.nearOpen = () => { nearbyState.open = !nearbyState.open; JT.app.render(); };
  A.nearRetry = () => { nearbyState.error = null; nearbyState.key = ''; JT.app.render(); };
  A.saveExternal = function (el) {
    const r = nearbyState.byId && nearbyState.byId[el.dataset.id];
    if (!r) return;
    const city = L.matchCity(r.address || '');
    F.restaurant(null, { name: r.name, cuisine: r.cuisine, coords: r.coords, address: r.address, hours: r.hours, url: r.website || r.mapsUrl, priceLevel: r.priceLevel, cityId: city && city.id, openAfter: true,
      notes: r.source === 'mock' ? 'Creado desde datos MOCK' : 'Guardado desde ' + (r.source === 'google' ? 'Google Places' : 'OpenStreetMap') });
  };

  /* ══ CIUDADES ════════════════════════════════════════════════
     Las fechas de una ciudad se derivan de los días asignados. */

  V.cities = function () {
    const s = S.get(), stays = S.cityStays(), main = s.trip.mainCurrency;
    const scheduled = new Set(stays.map((x) => x.cityId));
    let html = UI.header({ back: true, title: 'Ciudades', actions: UI.iconBtn('plus', 'Nueva ciudad', { act: 'newCity' }) });
    html += stays.map(function (st) {
      const c = s.cities[st.cityId];
      if (!c) return '';
      const np = Object.values(s.places).filter((p) => p.cityId === c.id).length, nr = Object.values(s.restaurants).filter((r) => r.cityId === c.id).length;
      return '<div class="card card--tap city" tabindex="0" data-act="go" data-to="city/' + c.id + '"><span class="city__bar" style="background:' + esc(c.color || '#C8102E') + '"></span><div class="grow">' +
        '<div class="row"><h2 class="title">' + esc(c.name) + '</h2>' + (c.nameJa ? '<span class="faint">' + esc(c.nameJa) + '</span>' : '') + '</div>' +
        '<p class="muted">' + U.fmtRange(st.start, st.end) + '</p><small class="muted">' + esc([st.nights + (st.nights === 1 ? ' noche' : ' noches'), c.budget ? U.money(c.budget, main) + ' presupuesto' : '', np + ' lugares', nr + ' restaurantes'].filter(Boolean).join(' · ')) + '</small></div></div>';
    }).join('');
    html += Object.values(s.cities).filter((c) => !scheduled.has(c.id)).map((c) => UI.card('<strong>' + esc(c.name) + '</strong><small class="muted block">Sin días asignados</small>', { tone: 'muted', data: { act: 'go', to: 'city/' + c.id } })).join('');
    if (!Object.keys(s.cities).length) html += UI.empty('🏙️', 'Sin ciudades', 'Añade las ciudades y asígnales los días del viaje.', UI.btn('Añadir ciudad', { data: { act: 'newCity' } }));
    return { html: html };
  };

  V.city = function (p) {
    const s = S.get(), c = s.cities[p.id];
    if (!c) return { html: UI.header({ title: 'Ciudad no encontrada', back: true }) + UI.empty('🏙️', 'Esta ciudad ya no existe') };
    const stays = S.cityStays().filter((x) => x.cityId === c.id), main = s.trip.mainCurrency;
    const nights = stays.reduce((a, x) => a + x.nights, 0);
    const spent = C.moneySum(Object.values(s.expenses).filter((e) => e.cityId === c.id));
    const hotels = Object.values(s.reservations).filter((r) => r.type === 'hotel' && r.cityId === c.id);
    const places = Object.values(s.places).filter((x) => x.cityId === c.id), rests = Object.values(s.restaurants).filter((x) => x.cityId === c.id);
    const notes = Object.values(s.notes).filter((n) => n.scope === 'city' && n.refId === c.id);
    let html = UI.header({ back: true, eyebrow: c.nameJa, title: c.name, subtitle: stays.map((x) => U.fmtRange(x.start, x.end)).join(' · ') || 'Sin días asignados', actions: UI.iconBtn('edit', 'Editar ciudad', { act: 'editCity', id: c.id }) });
    html += UI.card('<div class="stats">' + UI.stat('Noches', String(nights)) + UI.stat('Gastado', spent.text, '', true) + UI.stat('Presupuesto', c.budget ? U.money(c.budget, main) : '—') + '</div>' + (c.budget ? UI.progress(spent.total / c.budget, spent.total > c.budget ? 'accent' : 'info') : ''), { cls: 'stack' });
    html += '<div class="row row--wrap">' + (stays[0] ? UI.btn('Ver días', { icon: 'calendar', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'day/' + stays[0].dayIds[0] } }) : '') +
      (c.coords ? UI.btn('Comer cerca', { emoji: '🍜', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'nearby?' + C.q({ lat: c.coords.lat, lng: c.coords.lng, label: c.name }) } }) : '') +
      UI.btn('Planificar día', { icon: 'sparkle', size: 'sm', variant: 'secondary', data: { act: 'go', to: 'planner' + (stays[0] ? '?day=' + stays[0].dayIds[0] : '') } }) + '</div>';
    html += UI.section('Alojamiento', hotels.length ? hotels.map(C.reservationCard).join('') : '<p class="muted small">Sin alojamiento guardado.</p>', UI.btn('Añadir', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newReservation', type: 'hotel', date: stays[0] && stays[0].start, city: c.id } }));
    html += UI.section('Lugares (' + places.length + ')', places.map((x) => C.placeCard(x)).join(''), UI.btn('Añadir', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newPlace', city: c.id } }));
    html += UI.section('Restaurantes (' + rests.length + ')', rests.map((x) => C.restaurantCard(x)).join(''), UI.btn('Añadir', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newRestaurant', city: c.id } }));
    html += UI.section('Notas', notes.map((n) => C.noteCard(n, false)).join(''), UI.btn('Nota', { size: 'sm', variant: 'ghost', icon: 'plus', data: { act: 'newNote', scope: 'city', ref: c.id } }));
    return { html: html };
  };

  const COLORS = ['#C8102E', '#2F6F73', '#B0893E', '#6B8E4E', '#5B5B9A', '#1C1C1E'];

  F.city = function (id) {
    const s = S.get(), ex = id ? s.cities[id] : null, days = S.sortedDays();
    const c = ex || { name: '', color: COLORS[Object.keys(s.cities).length % COLORS.length] };
    const body = '<form id="fCity" class="stack" novalidate>' +
      UI.field('Nombre', UI.input('name', c.name, { placeholder: 'Kyoto', autofocus: !ex })) +
      UI.field('Nombre en japonés', UI.input('nameJa', c.nameJa || '', { placeholder: '京都' }), { optional: true }) +
      UI.field('Días en esta ciudad', UI.chipsMulti('days', days.map((d, i) => ({ value: d.id, label: 'D' + (i + 1) + ' · ' + U.fmtShort(d.date) + (d.cityId && (!ex || d.cityId !== ex.id) && s.cities[d.cityId] ? ' (' + s.cities[d.cityId].name + ')' : '') })), ex ? days.filter((d) => d.cityId === ex.id).map((d) => d.id) : []),
        { hint: 'Las fechas de la ciudad se calculan a partir de estos días. Un día asignado a otra ciudad se moverá a esta.' }) +
      UI.field('Presupuesto (' + s.trip.mainCurrency + ')', UI.input('budget', c.budget || '', { inputmode: 'decimal' }), { optional: true }) +
      UI.field('Color', '<div class="swatches">' + COLORS.map((col) => '<label class="swatch" style="--c:' + col + '"><input type="radio" name="color" value="' + col + '"' + (col === c.color ? ' checked' : '') + ' aria-label="Color ' + col + '"><span></span></label>').join('') + '</div>') +
      C.coordsField(c.coords) + '<p class="error" hidden></p></form>';
    const close = UI.sheet({
      title: ex ? 'Editar ciudad' : 'Nueva ciudad', body: body,
      footer: '<div class="row">' + (ex ? UI.btn('Eliminar', { variant: 'danger', icon: 'trash', data: { del: '1' } }) : '') + UI.btn('Guardar', { type: 'submit', form: 'fCity', block: true }) + '</div>',
      onMount: function (root) {
        const form = root.querySelector('#fCity');
        C.bindCoords(form, () => form.querySelector('[name="name"]').value + ', Japón');
        const del = root.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar ' + ex.name + '?', 'Los lugares, días y gastos quedarán sin ciudad.')) { S.remove('cities', ex.id); close(); if (location.hash.indexOf(ex.id) > -1) history.back(); } });
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          const f = UI.formData(form), err = form.querySelector('.error');
          const budget = f.budget ? U.parseAmount(f.budget) : undefined;
          const problem = !f.name ? 'Escribe el nombre' : budget === null ? 'Presupuesto no válido' : f.coords && !C.parseCoords(f.coords) ? 'Coordenadas no válidas' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return; }
          const data = { name: f.name, nameJa: f.nameJa || undefined, budget: budget || undefined, color: f.color, coords: C.parseCoords(f.coords) };
          const cid = ex ? ex.id : S.create('cities', data);
          if (ex) S.update('cities', cid, data);
          const sel = UI.list(f.days);
          days.forEach(function (d) {
            const on = sel.indexOf(d.id) > -1;
            if (on && d.cityId !== cid) S.update('days', d.id, { cityId: cid });
            if (!on && d.cityId === cid) S.update('days', d.id, { cityId: undefined });
          });
          UI.toast('Ciudad guardada');
          close();
        });
      }
    });
  };
  A.newCity = () => F.city(null);
  A.editCity = (el) => F.city(el.dataset.id);
})();
