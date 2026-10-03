/* ============================================================
   logic.js — Lógica de dominio sin DOM: planificador del día,
   reparto de gastos, búsqueda global, importación de texto,
   recordatorios y textos para compartir.
   ============================================================ */
window.JT = window.JT || {};

JT.logic = (function () {
  'use strict';

  const U = JT.utils;
  const D = JT.data;
  const S = JT.store;

  /* ── Planificación inteligente del día ────────────────────────
     Ordena 2-8 paradas minimizando desplazamientos y esperas, respeta
     horarios de apertura conocidos e inserta huecos para comer cerca
     de donde estés a esa hora. Hasta 7 paradas prueba todas las
     combinaciones; con 8, vecino más cercano + mejora 2-opt. */

  const PENALTY = 600;

  function travel(a, b, mode) {
    if (!a || !b || U.haversine(a, b) < 0.05) return null;
    return U.estimateTravel(a, b, mode);
  }

  function pickMeal(at, meal, cands, used) {
    if (!at) return null;
    let best = null, bestScore = Infinity;
    cands.forEach(function (c) {
      if (c.suitableFor.indexOf(meal) === -1 || used.has(c.id)) return;
      const km = U.haversine(at, c.coords);
      if (km > 2) return;
      const score = km - c.preference * 0.4;
      if (score < bestScore) { bestScore = score; best = Object.assign({}, c, { km: km }); }
    });
    return best;
  }

  function simulate(order, input, withMeals) {
    const items = [], warnings = [], used = new Set();
    let t = input.startMinutes, pos = input.start && input.start.coords;
    let travelTotal = 0, waitTotal = 0, penalty = 0;
    let lunchDone = !withMeals || !input.lunch.enabled, dinnerDone = !withMeals || !input.dinner.enabled;

    const addTravel = (to) => {
      const tr = travel(pos, to, input.mode);
      if (!tr) return;
      items.push({ kind: 'travel', start: t, end: t + tr.minutes, mode: tr.mode, km: tr.routeKm });
      t += tr.minutes; travelTotal += tr.minutes;
    };
    const addMeal = (meal) => {
      const cfg = input[meal];
      const sug = pickMeal(pos, meal, input.restaurants, used);
      if (sug) {
        used.add(sug.id);
        const tr = travel(pos, sug.coords, 'walk');
        pos = sug.coords;
        const s = Math.max(t + (tr ? tr.minutes : 0), cfg.from);
        travelTotal += tr ? tr.minutes : 0;
        items.push({ kind: 'meal', meal: meal, start: s, end: s + cfg.duration, coords: pos, suggestion: sug });
        t = s + cfg.duration;
      } else {
        const s = Math.max(t, cfg.from);
        items.push({ kind: 'meal', meal: meal, start: s, end: s + cfg.duration, coords: pos });
        t = s + cfg.duration;
      }
    };
    const due = (cfg, nextEnd) => t >= cfg.from || nextEnd > cfg.to;

    order.forEach(function (stop) {
      const tr = travel(pos, stop.coords, input.mode);
      const arrival = t + (tr ? tr.minutes : 0);
      if (!lunchDone && due(input.lunch, arrival + stop.duration)) { addMeal('lunch'); lunchDone = true; }
      else if (lunchDone && !dinnerDone && due(input.dinner, arrival + stop.duration)) { addMeal('dinner'); dinnerDone = true; }
      addTravel(stop.coords);
      if (stop.coords) pos = stop.coords;
      let begin = t, warning;
      if (U.parseHours(stop.hours)) {
        const slot = U.earliestOpen(stop.hours, input.weekday, t, stop.duration);
        if (slot === undefined) { warning = 'Cerrado o sin tiempo suficiente según su horario'; penalty += PENALTY; }
        else begin = slot;
      }
      const wait = begin - t;
      if (wait > 0) waitTotal += wait;
      items.push({ kind: 'visit', stop: stop, start: begin, end: begin + stop.duration, wait: wait, warning: warning });
      if (warning) warnings.push(stop.name + ': ' + warning.toLowerCase());
      t = begin + stop.duration;
    });
    if (!lunchDone && t > input.lunch.from - 30) addMeal('lunch');
    if (withMeals && input.dinner.enabled && !dinnerDone) addMeal('dinner');
    if (input.returnToStart && input.start) addTravel(input.start.coords);

    return { items: items, order: order.map((s) => s.id), travel: travelTotal, wait: waitTotal, end: t, warnings: warnings, score: t + travelTotal + waitTotal * 0.5 + penalty };
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach(function (x, i) {
      permutations(arr.slice(0, i).concat(arr.slice(i + 1))).forEach((p) => out.push([x].concat(p)));
    });
    return out;
  }

  function planDay(input) {
    const located = input.stops.filter((s) => s.coords);
    const unplaced = input.stops.filter((s) => !s.coords);
    let best;
    if (located.length <= 7) {
      let bestScore = Infinity;
      best = located;
      permutations(located).forEach(function (p) {
        const r = simulate(p, input, false);
        if (r.score < bestScore) { bestScore = r.score; best = p; }
      });
    } else {
      const rem = located.slice(); best = [];
      let pos = input.start ? input.start.coords : rem[0].coords;
      while (rem.length) {
        let bi = 0, bd = Infinity;
        rem.forEach((s, i) => { const dd = U.haversine(pos, s.coords); if (dd < bd) { bd = dd; bi = i; } });
        const nx = rem.splice(bi, 1)[0]; best.push(nx); pos = nx.coords;
      }
      let improved = true, bs = simulate(best, input, false).score;
      while (improved) {
        improved = false;
        for (let i = 0; i < best.length - 1; i++) for (let j = i + 1; j < best.length; j++) {
          const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
          const sc = simulate(cand, input, false).score;
          if (sc < bs - 0.01) { bs = sc; best = cand; improved = true; }
        }
      }
    }
    const r = simulate(best.concat(unplaced), input, true);
    if (unplaced.length) r.warnings.push(unplaced.length + ' parada(s) sin coordenadas: se añaden al final sin optimizar');
    if (r.end > 22 * 60) r.warnings.push('El plan termina muy tarde: considera quitar alguna parada');
    return r;
  }

  /* ── Reparto de gastos ────────────────────────────────────── */

  function balances(expenses, ids, toMain) {
    const paid = {}, share = {};
    ids.forEach((id) => { paid[id] = 0; share[id] = 0; });
    let skipped = 0;
    expenses.forEach(function (e) {
      if (!e.paidById || paid[e.paidById] === undefined) return;
      const v = toMain(e);
      if (v === null) { skipped++; return; }
      const parts = ((e.splitWithIds && e.splitWithIds.length) ? e.splitWithIds : [e.paidById]).filter((x) => share[x] !== undefined);
      if (!parts.length) return;
      paid[e.paidById] += v;
      parts.forEach((p) => (share[p] += v / parts.length));
    });
    const list = ids.map((id) => ({ id: id, paid: paid[id], share: share[id], balance: paid[id] - share[id] }));
    const EPS = 0.5;
    const debt = list.filter((b) => b.balance < -EPS).map((b) => ({ id: b.id, v: -b.balance })).sort((a, b) => b.v - a.v);
    const cred = list.filter((b) => b.balance > EPS).map((b) => ({ id: b.id, v: b.balance })).sort((a, b) => b.v - a.v);
    const transfers = [];
    let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const amt = Math.min(debt[i].v, cred[j].v);
      if (amt > EPS) transfers.push({ from: debt[i].id, to: cred[j].id, amount: amt });
      debt[i].v -= amt; cred[j].v -= amt;
      if (debt[i].v <= EPS) i++;
      if (cred[j].v <= EPS) j++;
    }
    return { list: list, transfers: transfers, skipped: skipped };
  }

  /* ── Búsqueda global ──────────────────────────────────────── */

  function score(q, fields) {
    let best = 0;
    fields.forEach(function (f, i) {
      if (!f) return;
      const n = U.normalize(f), w = i === 0 ? 3 : 1;
      if (n.startsWith(q)) best = Math.max(best, 3 * w);
      else if (n.indexOf(' ' + q) > -1) best = Math.max(best, 2 * w);
      else if (n.indexOf(q) > -1) best = Math.max(best, w);
    });
    return best;
  }

  function search(raw) {
    const q = U.normalize(String(raw || '').trim());
    if (q.length < 2) return [];
    const s = S.get(), hits = [];
    const city = (id) => (id && s.cities[id] ? s.cities[id].name : undefined);
    const push = (h, fields) => { const sc = score(q, fields); if (sc) hits.push(Object.assign(h, { score: sc })); };

    Object.values(s.activities).forEach(function (a) {
      const day = s.days[a.dayId], p = a.placeId && s.places[a.placeId], r = a.restaurantId && s.restaurants[a.restaurantId];
      push({ kind: 'activity', id: a.id, title: a.title, emoji: D.ACTIVITY[a.category][1], sub: [day && U.fmtShort(day.date), a.startTime, city(day && day.cityId)].filter(Boolean).join(' · ') },
        [a.title, a.description, a.notes, a.location && a.location.name, a.location && a.location.address, p && p.name, p && p.neighborhood, r && r.name, r && r.neighborhood, city(day && day.cityId)]);
    });
    Object.values(s.places).forEach((p) => push({ kind: 'place', id: p.id, title: p.name, emoji: D.PLACE[p.category][1], sub: [D.PLACE[p.category][0], p.neighborhood, city(p.cityId)].filter(Boolean).join(' · ') }, [p.name, p.neighborhood, p.description, p.notes, p.address, city(p.cityId)]));
    Object.values(s.restaurants).forEach((r) => push({ kind: 'restaurant', id: r.id, title: r.name, emoji: D.CUISINE[r.cuisine][1], sub: [D.CUISINE[r.cuisine][0], r.neighborhood, city(r.cityId)].filter(Boolean).join(' · ') }, [r.name, r.neighborhood, D.CUISINE[r.cuisine][0], r.notes, r.address, city(r.cityId)]));
    Object.values(s.notes).forEach(function (n) {
      const ref = n.scope === 'city' ? city(n.refId) : n.scope === 'place' ? (s.places[n.refId] || {}).name : n.scope === 'restaurant' ? (s.restaurants[n.refId] || {}).name : n.scope === 'day' && s.days[n.refId] ? U.fmtShort(s.days[n.refId].date) : undefined;
      push({ kind: 'note', id: n.id, title: n.title || n.body.slice(0, 60), emoji: '🗒️', sub: ref ? 'Nota · ' + ref : 'Nota' }, [n.title, n.body, ref]);
    });
    Object.values(s.reservations).forEach((r) => push({ kind: 'reservation', id: r.id, title: r.name, emoji: D.RESERVATION[r.type][1], sub: [D.RESERVATION[r.type][0], U.fmtShort(r.date), r.time, r.confirmationCode].filter(Boolean).join(' · ') }, [r.name, r.location && r.location.name, r.location && r.location.address, r.notes, r.confirmationCode, city(r.cityId)]));
    Object.values(s.expenses).forEach((e) => push({ kind: 'expense', id: e.id, title: e.description || D.EXPENSE[e.category][0], emoji: D.EXPENSE[e.category][1], sub: U.money(e.amount, e.currency) + ' · ' + U.fmtShort(e.date) }, [e.description, e.placeName, e.notes, D.EXPENSE[e.category][0], city(e.cityId)]));
    Object.values(s.cities).forEach((c) => push({ kind: 'city', id: c.id, title: c.name, emoji: '🏙️', sub: c.nameJa }, [c.name, c.nameJa]));
    Object.values(s.transports).forEach((t) => push({ kind: 'transport', id: t.id, title: t.origin + ' → ' + t.destination, emoji: D.TRANSPORT[t.kind][1], sub: [D.TRANSPORT[t.kind][0], U.fmtShort(t.date), t.departTime].filter(Boolean).join(' · ') }, [t.origin, t.destination, t.number, t.notes, t.bookingCode]));
    return hits.sort((a, b) => b.score - a.score).slice(0, 60);
  }

  /* ── Importar texto pegado ────────────────────────────────────
     Enlaces de Google Maps (lee nombre y coordenadas), webs, texto
     libre ("Fushimi Inari Taisha, Kyoto"), coordenadas sueltas y
     confirmaciones de reserva con localizador. */

  const CUISINE_WORDS = [
    [/ramen|ラーメン|らーめん|つけめん/i, 'ramen'], [/sushi|寿司|鮨/i, 'sushi'], [/yakitori|焼き?鳥/i, 'yakitori'], [/izakaya|居酒屋/i, 'izakaya'],
    [/udon|うどん/i, 'udon'], [/soba|そば|蕎麦/i, 'soba'], [/yakiniku|焼肉/i, 'yakiniku'], [/tonkatsu|とんかつ/i, 'tonkatsu'],
    [/tempura|天ぷら/i, 'tempura'], [/okonomiyaki|お好み焼/i, 'okonomiyaki'], [/curry|カレー/i, 'curry'], [/kaiseki|懐石|会席/i, 'kaiseki'],
    [/caf[eé]|coffee|喫茶|カフェ/i, 'cafe'], [/dessert|postre|matcha|parfait|mochi|wagashi/i, 'dessert'], [/restaurant|restaurante|食堂|レストラン|tabelog\.com/i, 'other']
  ];
  const PLACE_WORDS = [
    [/taisha|jinja|jing[uū]|shrine|santuario|神社|神宮|大社/i, 'shrine'], [/-ji\b|dera\b|temple|templo|寺/i, 'temple'],
    [/museum|museo|美術館|博物館/i, 'museum'], [/sky|tower|torre|mirador|observatory|展望/i, 'viewpoint'],
    [/market|mercado|ichiba|市場/i, 'market'], [/park|parque|k[oō]en|gyoen|garden|jard[ií]n|公園|庭園/i, 'park'],
    [/castle|castillo|城/i, 'museum'], [/shop|store|tienda|depato|mall/i, 'shop'],
    [/onsen|experience|experiencia|teamlab|ceremony|ceremonia/i, 'experience'], [/crossing|dori|street|calle|yokocho|barrio|横丁/i, 'neighborhood']
  ];

  function decode(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } }
  function pt(lat, lng) { const p = { lat: Number(lat), lng: Number(lng) }; return U.validCoords(p) ? p : undefined; }

  function matchCity(text) {
    const t = String(text || '').toLowerCase();
    const alias = { tokyo: ['tokio'], kyoto: ['kioto'], osaka: ['ōsaka'] };
    return Object.values(S.get().cities).find(function (c) {
      return [c.name.toLowerCase(), c.nameJa].concat(alias[c.name.toLowerCase()] || []).some((n) => n && t.indexOf(n) > -1);
    });
  }

  function guess(text) {
    for (const r of CUISINE_WORDS) if (r[0].test(text)) return { kind: 'restaurant', cuisine: r[1] };
    for (const r of PLACE_WORDS) if (r[0].test(text)) return { kind: 'place', category: r[1] };
    return { kind: 'place', category: 'other' };
  }

  function parseImport(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const notes = [];
    const code = /(?:reserva|booking|confirmaci[oó]n|confirmation|localizador|予約番号)[^A-Z0-9]{0,20}([A-Z0-9][A-Z0-9-]{4,})/i.exec(raw);
    if (code) {
      const out = { kind: 'reservation', code: code[1].toUpperCase(), notes: notes };
      notes.push('Código de reserva: ' + out.code);
      const iso = /(20\d{2})-(\d{2})-(\d{2})/.exec(raw), eu = /(\d{1,2})[/.](\d{1,2})[/.](20\d{2})/.exec(raw);
      if (iso) out.date = iso[1] + '-' + iso[2] + '-' + iso[3];
      else if (eu) out.date = eu[3] + '-' + eu[2].padStart(2, '0') + '-' + eu[1].padStart(2, '0');
      const tm = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(raw);
      if (tm) out.time = tm[1].padStart(2, '0') + ':' + tm[2];
      if (out.date) notes.push('Fecha: ' + out.date);
      if (out.time) notes.push('Hora: ' + out.time);
      out.type = /hotel|ryokan|hostel|check-?in/i.test(raw) ? 'hotel' : /flight|vuelo|airline/i.test(raw) ? 'flight' : /shinkansen|train|tren|jr\b/i.test(raw) ? 'train' : /restaurant|restaurante|dinner|cena|table/i.test(raw) ? 'restaurant' : 'other';
      const first = raw.split('\n').map((l) => l.trim()).find((l) => l && code[0].indexOf(l) === -1);
      out.name = first && first.length < 80 ? first : 'Reserva';
      const c = matchCity(raw); if (c) out.cityId = c.id;
      return out;
    }
    const co = /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/.exec(raw);
    if (co && pt(co[1], co[2])) return { kind: 'place', name: 'Lugar sin nombre', coords: pt(co[1], co[2]), category: 'other', notes: ['Coordenadas detectadas'] };

    const um = /https?:\/\/\S+/.exec(raw);
    if (um) {
      let url; try { url = new URL(um[0]); } catch (e) { url = null; }
      if (url) {
        const host = url.hostname.replace(/^www\./, '');
        const around = raw.replace(um[0], '').trim();
        if (/maps\.app\.goo\.gl|goo\.gl/.test(host)) {
          return { kind: 'place', name: around || 'Lugar de Google Maps', url: url.href, category: 'other', notes: ['Enlace corto de Google Maps: ábrelo en el navegador, copia la dirección larga y pégala aquí para leer las coordenadas'] };
        }
        if (/^maps\.google\./.test(host) || (/google\.[a-z.]+$/.test(host) && url.pathname.indexOf('/maps') === 0)) {
          let name, coords;
          const pl = /\/maps\/place\/([^/]+)/.exec(url.pathname);
          if (pl) name = decode(pl[1]);
          const precise = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url.href), at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url.href);
          if (precise) coords = pt(precise[1], precise[2]); else if (at) coords = pt(at[1], at[2]);
          const q = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('destination');
          if (q) { const qc = /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/.exec(q); if (qc) coords = coords || pt(qc[1], qc[2]); else name = name || decode(q); }
          if (coords) notes.push('Coordenadas leídas del enlace');
          name = name || around || 'Lugar de Google Maps';
          const c = matchCity(name + ' ' + around);
          return Object.assign(guess(name), { name: name, coords: coords, url: url.href, cityId: c && c.id, notes: notes });
        }
        const slug = decode(url.pathname.split('/').filter(Boolean).pop() || '').replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
        const name = around || (slug && !/^\d+$/.test(slug) ? slug : host);
        const g = /tabelog|gurunavi|hotpepper|retty|opentable|tablecheck/.test(host) ? { kind: 'restaurant', cuisine: guess(name).cuisine || 'other' } : guess(name + ' ' + host);
        notes.push('Enlace de ' + host);
        const c = matchCity(name + ' ' + raw);
        return Object.assign(g, { name: name, url: url.href, cityId: c && c.id, notes: notes });
      }
    }
    const parts = raw.split(/[,\n·|]/).map((p) => p.trim()).filter(Boolean);
    const c = matchCity(raw);
    if (c) notes.push('Ciudad: ' + c.name);
    const g = guess(raw);
    notes.push(g.kind === 'restaurant' ? 'Parece un restaurante' : 'Parece un lugar para visitar');
    return Object.assign(g, { name: parts[0] || raw, address: parts.length > 1 ? parts.slice(1).join(', ') : undefined, cityId: c && c.id, notes: notes });
  }

  function parseImportLines(input) {
    const one = parseImport(input);
    if (one && one.kind === 'reservation') return [one];
    const lines = String(input || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return one ? [one] : [];
    return lines.map(parseImport).filter(Boolean);
  }

  /* ── Recordatorios ────────────────────────────────────────────
     Sólo avisos útiles: reservas con hora (N min antes), trenes y vuelos
     (víspera 20:00 y N min antes), check-in online 24 h antes, hotel. */

  function reminders(lead, nowMs) {
    const s = S.get(), off = s.trip.timezoneOffsetMinutes, out = [];
    Object.values(s.reservations).forEach(function (r) {
      if (!r.time) return;
      const at = U.localToTs(r.date, r.time, off);
      if (r.type === 'hotel') { out.push({ id: 'h' + r.id, at: U.localToTs(r.date, '09:00', off), title: 'Hoy: check-in en ' + r.name, body: 'A partir de las ' + r.time }); return; }
      if (r.type === 'flight') out.push({ id: 'f' + r.id, at: at - 86400000, title: 'Recuerda hacer el check-in', body: r.name + ' sale mañana a las ' + r.time });
      out.push({ id: 'r' + r.id, at: at - lead * 60000, title: 'En ' + lead + ' minutos: ' + r.name, body: 'Reserva a las ' + r.time + (r.confirmationCode ? ' · ' + r.confirmationCode : '') });
    });
    Object.values(s.transports).forEach(function (t) {
      if (!t.departTime) return;
      const k = D.TRANSPORT[t.kind][0];
      out.push({ id: 'e' + t.id, at: U.localToTs(U.addDays(t.date, -1), '20:00', off), title: 'Mañana: ' + k + ' a las ' + t.departTime, body: t.origin + ' → ' + t.destination + (t.number ? ' · ' + t.number : '') });
      out.push({ id: 't' + t.id, at: U.localToTs(t.date, t.departTime, off) - lead * 60000, title: k + ' en ' + lead + ' minutos', body: t.origin + ' → ' + t.destination });
    });
    return out.filter((r) => r.at > nowMs).sort((a, b) => a.at - b.at);
  }

  /* ── Textos para compartir ────────────────────────────────── */

  function shareDay(dayId) {
    const s = S.get(), day = s.days[dayId];
    if (!day) return '';
    const n = S.dayNumber(dayId), c = day.cityId && s.cities[day.cityId];
    const lines = ['📅 Día ' + n + (c ? ' — ' + c.name : ''), U.fmtLong(day.date), ''];
    S.dayActivities(dayId).forEach(function (a) {
      const l = S.resolveLocation(a);
      lines.push((a.startTime || '··:··') + '  ' + D.ACTIVITY[a.category][1] + ' ' + a.title + (l.name && l.name !== a.title ? ' (' + l.name + ')' : ''));
    });
    lines.push('', '— ' + s.trip.name);
    return lines.join('\n');
  }

  function shareReservation(r) {
    return [D.RESERVATION[r.type][1] + ' ' + r.name, U.fmtDay(r.date) + (r.time ? ' · ' + r.time : '') + (r.endDate ? ' → ' + U.fmtDay(r.endDate) : ''),
      r.location && (r.location.name || r.location.address) ? '📍 ' + [r.location.name, r.location.address].filter(Boolean).join(', ') : '',
      r.confirmationCode ? 'Reserva: ' + r.confirmationCode : '', r.phone ? '☎️ ' + r.phone : '', r.url || '', r.notes || ''].filter(Boolean).join('\n');
  }

  function sharePlace(p, isRestaurant) {
    const s = S.get(), c = p.cityId && s.cities[p.cityId];
    const cat = isRestaurant ? D.CUISINE[p.cuisine] : D.PLACE[p.category];
    return [cat[1] + ' ' + p.name, [cat[0], isRestaurant && p.priceLevel ? D.PRICE[p.priceLevel] : '', p.neighborhood, c && c.name].filter(Boolean).join(' · '),
      p.description || '', p.address ? '📍 ' + p.address : '', p.hours ? '🕐 ' + p.hours : '', p.url || '', p.coords ? U.searchUrl(p.name, p.coords) : ''].filter(Boolean).join('\n');
  }

  function shareExpenses(rates) {
    const s = S.get(), main = s.trip.mainCurrency, list = Object.values(s.expenses);
    const total = U.sumIn(list, main, rates), byCat = {};
    list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + U.sumIn([e], main, rates).total; });
    const lines = ['💰 Gastos — ' + s.trip.name, ''];
    Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).forEach((k) => lines.push(D.EXPENSE[k][1] + ' ' + D.EXPENSE[k][0] + ': ' + U.money(byCat[k], main)));
    lines.push('', 'Total: ' + U.money(total.total, main));
    Object.keys(total.unconverted).forEach((c) => lines.push('+ ' + U.money(total.unconverted[c], c) + ' sin convertir'));
    if (s.trip.totalBudget) lines.push('Presupuesto: ' + U.money(s.trip.totalBudget, main));
    if (rates && rates.date) lines.push('(Tipo de cambio del ' + rates.date + ')');
    return lines.join('\n');
  }

  function expensesCsv() {
    const s = S.get();
    const cell = (v) => { const x = v === undefined || v === null ? '' : String(v); return /[",;\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const rows = [['Fecha', 'Descripción', 'Categoría', 'Importe', 'Moneda', 'Ciudad', 'Lugar', 'Método de pago', 'Pagó', 'Repartido entre', 'Notas']];
    Object.values(s.expenses).sort((a, b) => a.date.localeCompare(b.date)).forEach(function (e) {
      rows.push([e.date, e.description, D.EXPENSE[e.category][0], String(e.amount).replace('.', ','), e.currency, e.cityId && s.cities[e.cityId] ? s.cities[e.cityId].name : '',
        e.placeName, e.paymentMethod ? D.PAYMENT[e.paymentMethod][0] : '', e.paidById && s.travelers[e.paidById] ? s.travelers[e.paidById].name : '',
        (e.splitWithIds || []).map((id) => s.travelers[id] && s.travelers[id].name).filter(Boolean).join(', '), e.notes]);
    });
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  }

  /* ── Marcadores del mapa ──────────────────────────────────── */

  function markers(dayId, layers) {
    const s = S.get(), out = [], seenP = new Set(), seenR = new Set();
    const has = (l) => layers.indexOf(l) > -1;
    const days = S.sortedDays(), target = dayId ? days.filter((d) => d.id === dayId) : days;
    if (has('itinerary')) target.forEach(function (day) {
      const dn = days.indexOf(day) + 1;
      S.dayActivities(day.id).forEach(function (a, i) {
        const l = S.resolveLocation(a);
        if (!l.coords) return;
        if (a.placeId) seenP.add(a.placeId);
        if (a.restaurantId) seenR.add(a.restaurantId);
        out.push({ key: 'a' + a.id, kind: 'activity', id: a.id, coords: l.coords, title: a.title, emoji: D.ACTIVITY[a.category][1], order: dayId ? i + 1 : undefined,
          sub: 'Día ' + dn + (a.startTime ? ' · ' + a.startTime : '') + (l.name && l.name !== a.title ? ' · ' + l.name : ''), color: a.status === 'done' ? '#97979C' : '#C8102E' });
      });
    });
    if (has('hotels')) {
      const seen = new Set();
      (dayId ? target.flatMap((d) => S.reservationsOn(d.date)) : Object.values(s.reservations)).forEach(function (r) {
        if (r.type !== 'hotel' || !r.location || !r.location.coords || seen.has(r.id)) return;
        seen.add(r.id);
        out.push({ key: 'h' + r.id, kind: 'hotel', id: r.id, coords: r.location.coords, title: r.name, emoji: '🏨', sub: 'Alojamiento', color: '#2F6F73' });
      });
    }
    if (dayId) return out;
    const favOnly = has('favorites') && !has('places') && !has('restaurants');
    if (has('places') || has('favorites')) Object.values(s.places).forEach(function (p) {
      if (!p.coords || seenP.has(p.id) || ((favOnly || !has('places')) && !p.favorite)) return;
      out.push({ key: 'p' + p.id, kind: 'place', id: p.id, coords: p.coords, title: p.name, emoji: D.PLACE[p.category][1], sub: D.PLACE[p.category][0] + (p.favorite ? ' · ♥' : ''), color: '#1C1C1E' });
    });
    if (has('restaurants') || has('favorites')) Object.values(s.restaurants).forEach(function (r) {
      if (!r.coords || seenR.has(r.id) || ((favOnly || !has('restaurants')) && !r.favorite)) return;
      out.push({ key: 'r' + r.id, kind: 'restaurant', id: r.id, coords: r.coords, title: r.name, emoji: D.CUISINE[r.cuisine][1], sub: D.CUISINE[r.cuisine][0] + (r.favorite ? ' · ♥' : ''), color: '#B0893E' });
    });
    return out;
  }

  return {
    planDay, balances, search, parseImport, parseImportLines, matchCity, reminders,
    shareDay, shareReservation, sharePlace, shareExpenses, expensesCsv, markers
  };
})();
