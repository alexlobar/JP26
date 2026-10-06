/* ============================================================
   services.js — Todo lo que sale a la red o usa APIs del
   navegador: restaurantes cercanos (OpenStreetMap / Google
   Places / mock), tipos de cambio (BCE), geocodificación,
   ubicación, cofre cifrado, avisos, compartir y ficheros.
   Ninguna clave va en el código: la de Google Places la
   introduce el usuario en Ajustes y queda en su navegador.
   ============================================================ */
window.JT = window.JT || {};

JT.services = (function () {
  'use strict';

  const U = JT.utils;
  const D = JT.data;
  const S = JT.store;

  const RATES_KEY = 'japonTravel.rates';
  const PLACES_KEY = 'japonTravel.placesKey';
  const VAULT_KEY = 'japonTravel.vault';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* lleno o bloqueado */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* bloqueado */ } }

  function online() { return navigator.onLine !== false; }

  async function fetchJson(url, init, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
    let res;
    try {
      res = await fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
    } catch (e) {
      throw new Error(online() ? 'El servicio no responde' : 'Sin conexión');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new Error('Clave de API no válida o sin permisos');
    if (res.status === 429) throw new Error('Límite de uso del servicio alcanzado; prueba más tarde');
    if (!res.ok) throw new Error('El servicio respondió con un error (' + res.status + ')');
    try { return await res.json(); } catch (e) { throw new Error('Respuesta del servicio no válida'); }
  }

  /* ── Tipos de cambio (BCE vía Frankfurter, sin clave) ─────────
     El último resultado se guarda con su fecha para usarlo offline.
     Los tipos manuales de Ajustes tienen prioridad. Nunca se inventan. */

  /** perEur = unidades de cada moneda por 1 EUR (como las publica el BCE) → tabla en la base pedida. */
  function tableFrom(perEur, base, date) {
    const perUnit = {};
    if (perEur[base] > 0) D.CURRENCIES.forEach((c) => { if (c !== base && perEur[c] > 0) perUnit[c] = perEur[base] / perEur[c]; });
    return { base: base, perUnit: perUnit, date: date, source: 'api' };
  }

  function cachedRates(base) {
    try {
      const c = JSON.parse(lsGet(RATES_KEY) || 'null');
      if (c && c.perEur) return { table: tableFrom(c.perEur, base, c.date), fetchedAt: c.fetchedAt };
      return c && c.table && c.table.base === base ? c : null; // caché de la v1.0.1
    } catch (e) { return null; }
  }

  async function fetchRates(base) {
    // Siempre en base EUR: son las cifras exactas del BCE (p. ej. 1 EUR = 177,32 JPY), sin redondeos intermedios.
    const j = await fetchJson('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY,USD');
    const perEur = { EUR: 1 };
    Object.keys(j.rates || {}).forEach((c) => { if (j.rates[c] > 0) perEur[c] = j.rates[c]; });
    lsSet(RATES_KEY, JSON.stringify({ perEur: perEur, date: j.date, fetchedAt: Date.now() }));
    return { table: tableFrom(perEur, base, j.date) };
  }

  /**
   * Redondea al alza los yenes que vale cada moneda: 1 EUR = 177,32 ¥ → 178 ¥ ('up') o 179 ¥ ('up1').
   * Sólo se aplica al tipo del BCE; los tipos manuales se usan tal cual.
   */
  function roundYen(perUnit, base, mode) {
    if (mode === 'exact') return perUnit;
    const up = (yen) => Math.ceil(yen - 1e-9) + (mode === 'up1' ? 1 : 0);
    const out = Object.assign({}, perUnit);
    if (base === 'JPY') Object.keys(out).forEach((c) => { out[c] = up(out[c]); });
    else if (out.JPY) out.JPY = 1 / up(1 / out.JPY);
    return out;
  }

  /** Tabla efectiva (API/caché redondeada + manuales) o null. `exact` guarda la del BCE sin redondear. */
  function rates() {
    const s = S.get(), base = s.trip.mainCurrency, mode = s.settings.yenRounding || 'up';
    const api = cachedRates(base);
    const manual = {};
    Object.keys(s.settings.manualRates || {}).forEach((c) => { const v = s.settings.manualRates[c]; if (c !== base && v > 0) manual[c] = v; });
    if (!api && !Object.keys(manual).length) return null;
    return {
      base: base,
      perUnit: Object.assign({}, api ? roundYen(api.table.perUnit, base, mode) : {}, manual),
      exact: api ? api.table.perUnit : undefined,
      rounding: api && mode !== 'exact' ? mode : undefined,
      date: api ? api.table.date : undefined,
      source: api ? (Object.keys(manual).length ? 'mixed' : 'api') : 'manual'
    };
  }

  /** Refresca en segundo plano si la caché tiene más de 6 h. Devuelve true si cambió. */
  async function refreshRatesIfStale(force) {
    const base = S.get().trip.mainCurrency;
    const c = cachedRates(base);
    if (!force && c && Date.now() - c.fetchedAt < 6 * 3600000) return false;
    if (!online()) return false;
    await fetchRates(base);
    return true;
  }

  /* ── Restaurantes cercanos ────────────────────────────────── */

  const CUISINE_RULES = [
    [/ramen|ラーメン|らーめん|拉麺|つけめん|tsukemen/, 'ramen'], [/sushi|kaitenzushi|寿司|鮨|すし/, 'sushi'], [/yakitori|焼き?鳥|やきとり/, 'yakitori'],
    [/izakaya|居酒屋/, 'izakaya'], [/udon|うどん|饂飩|製麺/, 'udon'], [/soba|そば|蕎麦/, 'soba'], [/yakiniku|焼肉|barbecue/, 'yakiniku'],
    [/tonkatsu|katsu|とんかつ/, 'tonkatsu'], [/tempura|天ぷら|天麩羅/, 'tempura'], [/okonomiyaki|takoyaki|monja|お好み焼|たこ焼|もんじゃ/, 'okonomiyaki'],
    [/curry|indian|カレー/, 'curry'], [/kaiseki|懐石|会席|割烹|fine_dining/, 'kaiseki'], [/coffee|cafe|café|tea|カフェ|喫茶|珈琲/, 'cafe'],
    [/dessert|ice_cream|cake|pastry|bakery|confectionery|wagashi|crepe|甘味|パフェ|ケーキ/, 'dessert']
  ];
  function mapCuisine(raw, fallback) {
    const s = String(raw || '').toLowerCase();
    for (const r of CUISINE_RULES) if (r[0].test(s)) return r[1];
    return fallback || 'other';
  }

  function getPlacesKey() { return lsGet(PLACES_KEY) || ''; }
  function setPlacesKey(k) { if (k) lsSet(PLACES_KEY, k.trim()); else lsDel(PLACES_KEY); }

  /** OpenStreetMap vía Overpass: datos reales y abiertos, sin clave (sin valoraciones ni precios). */
  async function overpass(q) {
    const r = Math.round(q.radius);
    const query = '[out:json][timeout:20];(node["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:' + r + ',' + q.lat + ',' + q.lng + ');way["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:' + r + ',' + q.lat + ',' + q.lng + '););out center 80;';
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let lastErr;
    for (const ep of endpoints) {
      try {
        const j = await fetchJson(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) }, 25000);
        return (j.elements || []).map(function (el) {
          const t = el.tags || {};
          const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat, lng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
          if (lat === undefined) return null;
          const coords = { lat: lat, lng: lng };
          const st = U.openStatus(t.opening_hours, q.weekday, q.minutes);
          const name = t['name:es'] || t['name:en'] || t.name;
          const addr = t['addr:full'] || [t['addr:province'], t['addr:city'], t['addr:quarter'] || t['addr:suburb'], t['addr:neighbourhood'], t['addr:block_number'], t['addr:housenumber']].filter(Boolean).join(' ');
          return {
            id: el.type + '/' + el.id, source: 'osm', name: name + (t.name && t.name !== name ? ' (' + t.name + ')' : ''), coords: coords,
            km: U.haversine(q, coords), cuisine: mapCuisine((t.cuisine || '') + ' ' + (t.name || ''), t.amenity === 'cafe' ? 'cafe' : 'other'),
            cuisineLabel: t.cuisine ? t.cuisine.replace(/[_;]/g, ' ') : undefined,
            openNow: st.state === 'unknown' ? undefined : st.state === 'open', hours: t.opening_hours, address: addr || undefined,
            website: t.website || t['contact:website'], mapsUrl: 'https://www.openstreetmap.org/' + el.type + '/' + el.id
          };
        }).filter(Boolean).sort((a, b) => a.km - b.km).slice(0, 40);
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  /** Google Places API (New). Requiere clave con "Places API (New)" (Ajustes → APIs). */
  async function googlePlaces(q) {
    const key = getPlacesKey();
    if (!key) throw new Error('Falta la clave de Google Places (Ajustes → APIs)');
    const mask = ['id', 'displayName', 'shortFormattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel', 'primaryType', 'types', 'currentOpeningHours.openNow', 'regularOpeningHours.weekdayDescriptions', 'googleMapsUri', 'websiteUri'].map((f) => 'places.' + f).join(',');
    const j = await fetchJson('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask },
      body: JSON.stringify({ includedTypes: ['restaurant', 'cafe'], maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'es', locationRestriction: { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: q.radius } } })
    });
    const PRICE = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
    const today = (q.weekday + 6) % 7; // Google empieza en lunes
    return (j.places || []).filter((p) => p.location).map(function (p) {
      const coords = { lat: p.location.latitude, lng: p.location.longitude };
      const name = p.displayName ? p.displayName.text : 'Sin nombre';
      return {
        id: p.id, source: 'google', name: name, coords: coords, km: U.haversine(q, coords),
        cuisine: mapCuisine([p.primaryType].concat(p.types || [], [name]).join(' ')), cuisineLabel: p.primaryType ? p.primaryType.replace(/_/g, ' ') : undefined,
        priceLevel: PRICE[p.priceLevel], rating: p.rating, ratingCount: p.userRatingCount,
        openNow: p.currentOpeningHours ? p.currentOpeningHours.openNow : undefined,
        hours: p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions ? p.regularOpeningHours.weekdayDescriptions[today] : undefined,
        address: p.shortFormattedAddress, website: p.websiteUri, mapsUrl: p.googleMapsUri
      };
    }).sort((a, b) => a.km - b.km);
  }

  /** MOCK sólo para desarrollo: datos inventados y etiquetados como tales. */
  async function mock(q) {
    let seed = Math.abs(Math.round(q.lat * 1000) * 31 + Math.round(q.lng * 1000));
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const kinds = ['ramen', 'sushi', 'izakaya', 'udon', 'cafe', 'tonkatsu', 'curry', 'yakitori'];
    const out = kinds.map(function (c, i) {
      const ang = rnd() * Math.PI * 2, dist = (0.1 + rnd() * 0.9) * (q.radius / 1000);
      const coords = { lat: q.lat + (dist / 111) * Math.cos(ang), lng: q.lng + (dist / (111 * Math.cos((q.lat * Math.PI) / 180))) * Math.sin(ang) };
      return { id: 'mock-' + i, source: 'mock', name: '[MOCK] ' + c[0].toUpperCase() + c.slice(1) + ' ' + (i + 1), coords: coords, km: U.haversine(q, coords), cuisine: c, priceLevel: 1 + (i % 3), rating: Math.round((3.5 + rnd() * 1.5) * 10) / 10, openNow: rnd() > 0.3, hours: 'Mo-Su 11:00-22:00 (mock)', address: 'Dirección de prueba' };
    });
    return out.sort((a, b) => a.km - b.km);
  }

  const PROVIDERS = { google: ['Google Places', googlePlaces], osm: ['OpenStreetMap', overpass], mock: ['Datos de prueba (MOCK)', mock] };
  const nearbyCache = {};

  /** Automático: Google si hay clave; si no, OpenStreetMap. Caché en memoria 15 min. */
  async function nearby(center, radius) {
    const pref = S.get().settings.placesProvider;
    const id = pref === 'auto' ? (getPlacesKey() ? 'google' : 'osm') : pref;
    const n = S.now();
    const key = [id, center.lat.toFixed(3), center.lng.toFixed(3), radius].join('|');
    const hit = nearbyCache[key];
    if (hit && Date.now() - hit.at < 15 * 60000) return hit.value;
    if (id !== 'mock' && !online()) throw new Error('Sin conexión: descubrir restaurantes necesita Internet');
    const results = await PROVIDERS[id][1]({ lat: center.lat, lng: center.lng, radius: radius, weekday: U.weekday(n.date), minutes: n.minutes });
    const value = { results: results, source: id, label: PROVIDERS[id][0] };
    nearbyCache[key] = { at: Date.now(), value: value };
    return value;
  }

  /* ── Geocodificación (Nominatim/OSM, sin clave, uso moderado) ─ */

  async function geocode(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const j = await fetchJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&countrycodes=jp&q=' + encodeURIComponent(q));
    return j.map((r) => ({ name: r.name || r.display_name.split(',')[0], display: r.display_name, coords: { lat: Number(r.lat), lng: Number(r.lon) } }));
  }

  /* ── Ubicación ────────────────────────────────────────────── */

  function locate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('Este navegador no da la ubicación'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => reject(new Error(e.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación')),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 }
      );
    });
  }

  /* ── Cofre cifrado para datos sensibles ───────────────────────
     AES-GCM con clave derivada de un PIN (PBKDF2, 200.000 iteraciones).
     El PIN no se guarda: sin él, los valores no se pueden leer.
     Necesita contexto seguro (https, localhost o archivo local). */

  let vaultKey = null;
  let vaultData = null;

  const vaultAvailable = () => !!(window.crypto && crypto.subtle);
  const vaultExists = () => !!lsGet(VAULT_KEY);
  const vaultUnlocked = () => !!vaultData;
  const b64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(pin, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function vaultSave() {
    const stored = JSON.parse(lsGet(VAULT_KEY) || '{}');
    const salt = stored.salt ? unb64(stored.salt) : crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, vaultKey, new TextEncoder().encode(JSON.stringify(vaultData)));
    lsSet(VAULT_KEY, JSON.stringify({ salt: b64(salt), iv: b64(iv), data: b64(enc) }));
  }

  async function vaultUnlock(pin) {
    if (!vaultAvailable()) throw new Error('El cifrado no está disponible en este navegador');
    const stored = JSON.parse(lsGet(VAULT_KEY) || 'null');
    if (!stored) {
      // Primer uso: crea el cofre con este PIN.
      const salt = crypto.getRandomValues(new Uint8Array(16));
      vaultKey = await deriveKey(pin, salt);
      vaultData = {};
      lsSet(VAULT_KEY, JSON.stringify({ salt: b64(salt) }));
      await vaultSave();
      return;
    }
    const key = await deriveKey(pin, unb64(stored.salt));
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(stored.iv) }, key, unb64(stored.data));
      vaultKey = key;
      vaultData = JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      throw new Error('PIN incorrecto');
    }
  }

  function vaultLock() { vaultKey = null; vaultData = null; }
  function vaultGet(id) { return vaultData ? vaultData[id] : undefined; }
  async function vaultSet(id, value) {
    if (!vaultData) throw new Error('Desbloquea el cofre primero');
    if (value) vaultData[id] = value; else delete vaultData[id];
    await vaultSave();
  }
  function vaultReset() { lsDel(VAULT_KEY); vaultLock(); }

  /* ── Avisos (mientras la app está abierta) ────────────────────
     Una web publicada en GitHub Pages no puede programar notificaciones
     con la app cerrada (eso exige un servidor de push). Mientras está
     abierta —o instalada y en segundo plano reciente— avisa con una
     notificación del sistema si hay permiso, y si no, dentro de la app. */

  const FIRED_KEY = 'japonTravel.firedReminders';
  function notificationsSupported() { return 'Notification' in window; }
  async function requestNotifications() {
    if (!notificationsSupported()) return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  }
  function dueReminders() {
    const s = S.get();
    if (!s.settings.notificationsEnabled) return [];
    const fired = JSON.parse(lsGet(FIRED_KEY) || '{}');
    const nowMs = Date.now();
    // Avisos de los últimos 10 min que aún no se han mostrado.
    const due = JT.logic.reminders(s.settings.notifyLeadMinutes, nowMs - 10 * 60000).filter((r) => r.at <= nowMs && !fired[r.id]);
    due.forEach((r) => (fired[r.id] = nowMs));
    if (due.length) lsSet(FIRED_KEY, JSON.stringify(fired));
    return due;
  }
  function showSystemNotification(r) {
    if (notificationsSupported() && Notification.permission === 'granted') {
      try { new Notification(r.title, { body: r.body, icon: 'icon.svg', tag: r.id }); return true; } catch (e) { return false; }
    }
    return false;
  }

  /* ── Compartir y ficheros ─────────────────────────────────── */

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      return ok;
    }
  }

  /** Hoja nativa de compartir (WhatsApp, Mail…) o, si no hay, copia al portapapeles. */
  async function share(text, title) {
    if (navigator.share) {
      try { await navigator.share({ title: title, text: text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'dismissed'; }
    }
    return (await copy(text)) ? 'copied' : 'failed';
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = accept || 'application/json,.json';
      input.onchange = async function () { const f = input.files && input.files[0]; resolve(f ? { name: f.name, text: await f.text() } : null); };
      input.click();
    });
  }

  function openUrl(url) {
    if (!url) return;
    window.open(/^[a-z]+:/i.test(url) ? url : 'https://' + url, '_blank', 'noopener');
  }

  /* ── Mapa: Leaflet bajo demanda (opcional) ────────────────────
     Se carga de unpkg sólo al abrir el mapa. Si no hay conexión o no
     carga, la app usa su plano esquemático propio. */

  let leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!online()) return reject(new Error('offline'));
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = '';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; js.crossOrigin = '';
      js.onload = () => resolve(window.L);
      js.onerror = () => { leafletPromise = null; reject(new Error('No se pudo cargar el mapa')); };
      document.head.appendChild(js);
      setTimeout(() => { if (!window.L) { leafletPromise = null; reject(new Error('timeout')); } }, 12000);
    });
    return leafletPromise;
  }

  return {
    online, rates, refreshRatesIfStale, fetchRates, nearby, geocode, locate, getPlacesKey, setPlacesKey,
    vaultAvailable, vaultExists, vaultUnlocked, vaultUnlock, vaultLock, vaultGet, vaultSet, vaultReset,
    notificationsSupported, requestNotifications, dueReminders, showSystemNotification,
    copy, share, download, pickFile, openUrl, loadLeaflet
  };
})();
