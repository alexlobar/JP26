/* ============================================================
   store.js — Persistencia y CRUD. Única capa que habla con
   localStorage. No toca el DOM: notifica cambios por suscripción.

   Modelo normalizado: cada colección es { id: entidad } y las
   relaciones van por id (una actividad enlaza placeId/restaurantId
   en vez de copiar la ubicación; las fechas de una ciudad se
   derivan de los días). Así no hay datos duplicados.
   ============================================================ */
window.JT = window.JT || {};

JT.store = (function () {
  'use strict';

  const U = JT.utils;
  const D = JT.data;

  const KEY = 'japonTravel.v1';
  const BACKUP_KEY = 'japonTravel.corrupt-backup';
  const SCHEMA = 1;
  const COLLECTIONS = Object.keys(D.emptyCollections());

  let state = null;
  let listeners = [];
  let writable = true;
  let lastError = null;

  /* ── Carga y guardado ─────────────────────────────────────── */

  function normalize(data) {
    const out = Object.assign(D.emptyCollections(), data);
    COLLECTIONS.forEach(function (c) { if (!out[c] || typeof out[c] !== 'object') out[c] = {}; });
    out.settings = Object.assign({}, D.DEFAULT_SETTINGS, data.settings || {});
    out.trip = Object.assign({ timezoneOffsetMinutes: 540, mainCurrency: 'JPY', emoji: '🇯🇵' }, data.trip || {});
    out.schema = SCHEMA;
    return out;
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      writable = false;
      lastError = 'El navegador bloquea el almacenamiento: los cambios no se guardarán.';
    }
    if (raw) {
      try {
        state = normalize(JSON.parse(raw));
        return;
      } catch (e) {
        // Datos corruptos: se guarda una copia para no perderlos y se arranca con el ejemplo.
        try { localStorage.setItem(BACKUP_KEY, raw); } catch (_) { /* sin espacio */ }
        lastError = 'Los datos guardados estaban dañados. Se ha guardado una copia y se carga el viaje de ejemplo.';
      }
    }
    state = normalize(D.sampleTrip());
    save();
  }

  function save() {
    if (!writable) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      lastError = 'No se pudo guardar (almacenamiento lleno o bloqueado). Exporta una copia desde Ajustes.';
      emit();
    }
  }

  function emit() { listeners.forEach(function (fn) { fn(state); }); }
  function commit() { save(); emit(); }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter((f) => f !== fn); }; }
  function get() { return state; }

  /* ── CRUD genérico ────────────────────────────────────────── */

  function create(col, data) {
    const id = data.id || U.uid(col.slice(0, 2));
    const ts = Date.now();
    state[col][id] = Object.assign({}, data, { id: id, createdAt: ts, updatedAt: ts });
    commit();
    return id;
  }

  function update(col, id, patch) {
    const cur = state[col][id];
    if (!cur) return;
    state[col][id] = Object.assign({}, cur, patch, { id: id, updatedAt: Date.now() });
    commit();
  }

  function remove(col, id) {
    const s = state;
    const unsetCity = (rec) => Object.values(rec).forEach((v) => { if (v.cityId === id) delete v.cityId; });
    const dropNotes = (scope) => Object.keys(s.notes).forEach((k) => { if (s.notes[k].scope === scope && s.notes[k].refId === id) delete s.notes[k]; });

    if (col === 'days') return; // los días se gestionan con setTripDates
    const entity = s[col][id];
    delete s[col][id];

    if (col === 'cities') {
      ['days', 'places', 'restaurants', 'expenses', 'reservations'].forEach((c) => unsetCity(s[c]));
      dropNotes('city');
    } else if (col === 'places' || col === 'restaurants') {
      // Las actividades enlazadas conservan una copia de la ubicación.
      const key = col === 'places' ? 'placeId' : 'restaurantId';
      Object.values(s.activities).forEach((a) => {
        if (a[key] === id) {
          delete a[key];
          a.location = { name: entity && entity.name, address: entity && entity.address, coords: entity && entity.coords };
        }
      });
      dropNotes(col === 'places' ? 'place' : 'restaurant');
    } else if (col === 'reservations') {
      Object.values(s.activities).forEach((a) => { if (a.reservationId === id) delete a.reservationId; });
    } else if (col === 'activities') {
      if (entity) reindex(dayActivities(entity.dayId));
      Object.values(s.expenses).forEach((e) => { if (e.activityId === id) delete e.activityId; });
    } else if (col === 'travelers') {
      Object.values(s.expenses).forEach((e) => {
        if (e.paidById === id) delete e.paidById;
        e.splitWithIds = (e.splitWithIds || []).filter((t) => t !== id);
      });
    } else if (col === 'checklists') {
      Object.keys(s.checklistItems).forEach((k) => { if (s.checklistItems[k].checklistId === id) delete s.checklistItems[k]; });
    }
    commit();
  }

  /* ── Viaje y ajustes ──────────────────────────────────────── */

  function setTrip(patch) { state.trip = Object.assign({}, state.trip, patch); commit(); }
  function setSettings(patch) { state.settings = Object.assign({}, state.settings, patch); commit(); }

  /** Cambia las fechas y regenera los días. Falla si se perderían días con actividades. */
  function setTripDates(start, end) {
    if (!U.isISODate(start) || !U.isISODate(end)) return { ok: false, error: 'Fechas no válidas' };
    if (end < start) return { ok: false, error: 'La fecha de fin es anterior a la de inicio' };
    const dates = U.dateRange(start, end);
    if (dates.length > 120) return { ok: false, error: 'Máximo 120 días' };
    const keep = new Set(dates);
    const lost = Object.values(state.days).filter((d) => !keep.has(d.date));
    const blocked = lost.filter((d) => Object.values(state.activities).some((a) => a.dayId === d.id));
    if (blocked.length) return { ok: false, error: 'Hay actividades en ' + blocked.length + ' día(s) que quedarían fuera. Muévelas primero.' };
    const byDate = {};
    Object.values(state.days).forEach((d) => (byDate[d.date] = d));
    const days = {};
    const ts = Date.now();
    dates.forEach((date) => {
      const ex = byDate[date];
      if (ex) days[ex.id] = ex;
      else { const id = U.uid('d'); days[id] = { id: id, date: date, createdAt: ts, updatedAt: ts }; }
    });
    state.days = days;
    state.trip = Object.assign({}, state.trip, { startDate: start, endDate: end });
    commit();
    return { ok: true };
  }

  /* ── Actividades: orden y hora ────────────────────────────────
     `order` manda; al crear o cambiar la hora, la actividad se coloca
     según su hora y las que no tienen hora mantienen su posición. */

  function dayActivities(dayId) {
    return Object.values(state.activities).filter((a) => a.dayId === dayId).sort((a, b) => a.order - b.order);
  }

  function reindex(list) { list.forEach((a, i) => { state.activities[a.id].order = i; }); }

  function insertIndex(list, time) {
    if (!time) return list.length;
    const i = list.findIndex((a) => a.startTime && U.cmpTime(time, a.startTime) < 0);
    return i === -1 ? list.length : i;
  }

  function addActivity(data) {
    const id = U.uid('a');
    const ts = Date.now();
    const list = dayActivities(data.dayId);
    const a = Object.assign({ priority: 'medium', status: 'pending' }, data, { id: id, createdAt: ts, updatedAt: ts, order: 0 });
    state.activities[id] = a;
    list.splice(data.order !== undefined ? data.order : insertIndex(list, data.startTime), 0, a);
    reindex(list);
    commit();
    return id;
  }

  function updateActivity(id, patch) {
    const cur = state.activities[id];
    if (!cur) return;
    const upd = Object.assign({}, cur, patch, { id: id, updatedAt: Date.now() });
    state.activities[id] = upd;
    const timeChanged = 'startTime' in patch && patch.startTime !== cur.startTime;
    const dayChanged = 'dayId' in patch && patch.dayId !== cur.dayId;
    if (timeChanged || dayChanged) {
      if (dayChanged) reindex(dayActivities(cur.dayId));
      const list = dayActivities(upd.dayId).filter((a) => a.id !== id);
      list.splice(insertIndex(list, upd.startTime), 0, upd);
      reindex(list);
    }
    commit();
  }

  function toggleDone(id) {
    const a = state.activities[id];
    if (a) updateActivity(id, { status: a.status === 'done' ? 'pending' : 'done' });
  }

  function duplicateActivity(id) {
    const a = state.activities[id];
    if (!a) return null;
    const copy = Object.assign({}, a, { title: a.title + ' (copia)', status: 'pending', order: a.order + 1 });
    delete copy.id; delete copy.isSample;
    return addActivity(copy);
  }

  function shiftActivity(id, dir) {
    const a = state.activities[id];
    if (!a) return;
    const list = dayActivities(a.dayId);
    const i = list.findIndex((x) => x.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    reindex(list);
    commit();
  }

  function sortDayByTime(dayId) {
    const list = dayActivities(dayId).map((a, i) => ({ a: a, i: i }))
      .sort((x, y) => U.cmpTime(x.a.startTime, y.a.startTime) || x.i - y.i).map((x) => x.a);
    reindex(list);
    commit();
  }

  /* ── Datos completos ──────────────────────────────────────── */

  function replaceAll(data) { state = normalize(data); commit(); }
  function loadSample() { state = normalize(D.sampleTrip()); commit(); }

  function startEmptyTrip(input) {
    const ts = Date.now();
    const days = {};
    U.dateRange(input.startDate, input.endDate).forEach((date) => { const id = U.uid('d'); days[id] = { id: id, date: date, createdAt: ts, updatedAt: ts }; });
    const meId = U.uid('p');
    const next = Object.assign(D.emptyCollections(), D.baseContent(ts), {
      trip: { id: U.uid('t'), name: input.name, emoji: '🇯🇵', startDate: input.startDate, endDate: input.endDate, mainCurrency: input.mainCurrency, totalBudget: input.totalBudget, timezoneOffsetMinutes: 540 },
      settings: Object.assign({}, state.settings, { simulatedDate: '', simulatedTime: '' }),
      days: days,
      travelers: {}
    });
    next.travelers[meId] = { id: meId, name: 'Yo', color: '#C8102E', isMe: true, createdAt: ts, updatedAt: ts };
    state = normalize(next);
    commit();
  }

  /** Quita lo de ejemplo; conserva lo del usuario, los días, frases, info y checklists. */
  function removeSample() {
    const keepBase = ['phrases', 'infoArticles', 'checklists', 'checklistItems', 'days'];
    COLLECTIONS.forEach(function (c) {
      if (keepBase.includes(c)) return;
      Object.keys(state[c]).forEach((k) => { if (state[c][k].isSample) delete state[c][k]; });
    });
    Object.values(state.days).forEach((d) => {
      if (d.cityId && !state.cities[d.cityId]) { delete d.cityId; delete d.title; }
      delete d.isSample;
    });
    state.trip = Object.assign({}, state.trip, { isSample: false });
    commit();
  }

  function exportJson() {
    // Los valores sensibles de Documentos están cifrados aparte (vault) y no se exportan.
    return JSON.stringify({ app: 'japon-travel', schema: SCHEMA, exportedAt: new Date().toISOString(), data: state }, null, 2);
  }

  function parseImport(text) {
    let p;
    try { p = JSON.parse(text); } catch (e) { return { ok: false, error: 'El fichero no es un JSON válido' }; }
    if (p && p.app && p.app !== 'japon-travel') return { ok: false, error: 'El fichero es de otra aplicación' };
    const data = p && p.data ? p.data : p;
    if (!data || !data.trip) return { ok: false, error: 'No contiene un viaje de esta app' };
    if ((p.schema || 1) > SCHEMA) return { ok: false, error: 'El fichero es de una versión más nueva de la app' };
    const t = data.trip;
    if (typeof t.name !== 'string' || !U.isISODate(t.startDate) || !U.isISODate(t.endDate)) return { ok: false, error: 'Datos del viaje incompletos (nombre o fechas)' };
    const n = normalize(data);
    const c = (k) => Object.keys(n[k]).length;
    return { ok: true, data: n, summary: t.name + ': ' + c('days') + ' días, ' + c('activities') + ' actividades, ' + c('places') + ' lugares, ' + c('restaurants') + ' restaurantes, ' + c('expenses') + ' gastos, ' + c('notes') + ' notas' };
  }

  /* ── Selectores (derivados, sin guardar) ──────────────────── */

  function sortedDays() { return Object.values(state.days).sort((a, b) => a.date.localeCompare(b.date)); }
  function dayNumber(dayId) { return sortedDays().findIndex((d) => d.id === dayId) + 1; }

  /** Tramos consecutivos en la misma ciudad (Tokyo puede aparecer dos veces). */
  function cityStays() {
    const out = [];
    sortedDays().forEach(function (d) {
      const last = out[out.length - 1];
      if (d.cityId && last && last.cityId === d.cityId && U.diffDays(last.end, d.date) === 1) { last.end = d.date; last.dayIds.push(d.id); }
      else if (d.cityId) out.push({ cityId: d.cityId, start: d.date, end: d.date, dayIds: [d.id], nights: 0 });
    });
    out.forEach(function (s, i) {
      const next = out[i + 1];
      s.nights = U.diffDays(s.start, s.end) + (next && U.diffDays(s.end, next.start) === 1 ? 1 : 0);
    });
    return out;
  }

  /** Ubicación efectiva de una actividad: lugar o restaurante enlazado, o ubicación libre. */
  function resolveLocation(a) {
    if (a.placeId && state.places[a.placeId]) { const p = state.places[a.placeId]; return { source: 'place', refId: p.id, name: p.name, address: p.address, coords: p.coords }; }
    if (a.restaurantId && state.restaurants[a.restaurantId]) { const r = state.restaurants[a.restaurantId]; return { source: 'restaurant', refId: r.id, name: r.name, address: r.address, coords: r.coords }; }
    if (a.location && (a.location.name || a.location.coords || a.location.address)) return Object.assign({ source: 'free' }, a.location);
    return { source: 'none' };
  }

  function now() {
    const s = state.settings;
    return U.tripNow(state.trip.timezoneOffsetMinutes, s.simulatedDate, s.simulatedTime);
  }

  function today(n) {
    n = n || now();
    const days = sortedDays();
    const t = state.trip;
    const phase = n.date < t.startDate ? 'before' : n.date > t.endDate ? 'after' : 'during';
    const day = phase === 'during' ? days.find((d) => d.date === n.date) : phase === 'before' ? days[0] : days[days.length - 1];
    const idx = day ? days.indexOf(day) : -1;
    const nextDiff = days.slice(idx + 1).find((d) => d.cityId && d.cityId !== (day && day.cityId));
    return {
      now: n, phase: phase, day: day, dayNumber: idx + 1, totalDays: days.length,
      daysUntil: Math.max(0, U.diffDays(n.date, t.startDate)),
      city: day && day.cityId ? state.cities[day.cityId] : undefined,
      nextCity: nextDiff ? state.cities[nextDiff.cityId] : undefined
    };
  }

  function travelModeActive() {
    const m = state.settings.travelMode;
    return m === 'on' || (m === 'auto' && today().phase === 'during');
  }

  /** Actividades pendientes desde "ahora". */
  function upcoming(n, limit) {
    const out = [];
    for (const day of sortedDays().filter((d) => d.date >= n.date)) {
      const isToday = day.date === n.date;
      for (const a of dayActivities(day.id)) {
        if (a.status === 'done') continue;
        if (isToday && a.startTime) {
          const s = U.toMin(a.startTime), e = a.endTime ? U.toMin(a.endTime) : s + 60;
          if (e <= n.minutes) continue;
          out.push({ activity: a, day: day, isToday: true, minutesUntil: s - n.minutes, inProgress: s <= n.minutes && n.minutes < e });
        } else out.push({ activity: a, day: day, isToday: isToday, inProgress: false });
        if (out.length >= (limit || 5)) return out;
      }
    }
    return out;
  }

  function reservationsOn(date) {
    return Object.values(state.reservations)
      .filter((r) => r.date === date || (r.type === 'hotel' && r.endDate && r.date <= date && date < r.endDate))
      .sort((a, b) => U.cmpTime(a.time, b.time));
  }

  /** "Dónde estoy" sin GPS: la última actividad empezada de hoy, o el hotel. */
  function inferArea(day, n) {
    if (!day) return undefined;
    let best;
    for (const a of dayActivities(day.id)) {
      const l = resolveLocation(a);
      if (!l.coords) continue;
      if (!best) best = l.coords;
      if (!a.startTime || U.toMin(a.startTime) <= n.minutes) best = l.coords;
    }
    if (best) return best;
    const h = reservationsOn(day.date).find((r) => r.type === 'hotel' && r.location && r.location.coords);
    return h ? h.location.coords : undefined;
  }

  function savedNear(center, maxKm) {
    return Object.values(state.restaurants).filter((r) => r.coords)
      .map((r) => ({ restaurant: r, km: U.haversine(center, r.coords) }))
      .filter((x) => x.km <= (maxKm || 1.5)).sort((a, b) => a.km - b.km);
  }

  return {
    load, get, subscribe, create, update, remove, setTrip, setSettings, setTripDates,
    addActivity, updateActivity, toggleDone, duplicateActivity, shiftActivity, sortDayByTime,
    replaceAll, loadSample, startEmptyTrip, removeSample, exportJson, parseImport,
    sortedDays, dayNumber, dayActivities, cityStays, resolveLocation, now, today, travelModeActive,
    upcoming, reservationsOn, inferArea, savedNear,
    isWritable: () => writable, lastError: () => lastError, clearError: () => { lastError = null; }
  };
})();
