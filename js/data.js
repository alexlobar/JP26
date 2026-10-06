/* ============================================================
   data.js — Catálogos (categorías, frases, información útil,
   checklists base) y el viaje de ejemplo.
   ============================================================ */
window.JT = window.JT || {};

JT.data = (function () {
  'use strict';

  const U = JT.utils;

  /* ── Catálogos [valor]: [etiqueta, emoji] ─────────────────── */

  const ACTIVITY = {
    transport: ['Transporte', '✈️'], hotel: ['Hotel', '🏨'], restaurant: ['Restaurante', '🍜'], visit: ['Visita', '🏯'],
    shopping: ['Compras', '🛍️'], activity: ['Actividad', '🎟️'], cafe: ['Café', '☕'], other: ['Otro', '📝']
  };
  const PLACE = {
    temple: ['Templo', '🛕'], shrine: ['Santuario', '⛩️'], museum: ['Museo', '🏛️'], viewpoint: ['Mirador', '🌆'],
    neighborhood: ['Barrio', '🏘️'], shop: ['Tienda', '🛍️'], market: ['Mercado', '🐟'], park: ['Parque', '🌳'],
    experience: ['Experiencia', '🎎'], other: ['Otro', '📍']
  };
  /* Duración de visita por defecto (min) para el planificador. */
  const VISIT_MIN = { temple: 60, shrine: 75, museum: 120, viewpoint: 60, neighborhood: 90, shop: 45, market: 60, park: 60, experience: 120, other: 60 };
  const CUISINE = {
    ramen: ['Ramen', '🍜'], sushi: ['Sushi', '🍣'], yakitori: ['Yakitori', '🍢'], izakaya: ['Izakaya', '🏮'], udon: ['Udon', '🍲'],
    soba: ['Soba', '🥢'], yakiniku: ['Yakiniku', '🥩'], tonkatsu: ['Tonkatsu', '🍖'], tempura: ['Tempura', '🍤'],
    okonomiyaki: ['Okonomiyaki', '🥞'], curry: ['Curry', '🍛'], kaiseki: ['Kaiseki', '🍱'], cafe: ['Cafetería', '☕'],
    dessert: ['Postres', '🍡'], other: ['Otro', '🍽️']
  };
  const PRICE = { 1: '¥', 2: '¥¥', 3: '¥¥¥', 4: '¥¥¥¥' };
  const EXPENSE = {
    flights: ['Vuelos', '✈️'], hotel: ['Hotel', '🏨'], transport: ['Transporte', '🚆'], food: ['Comida', '🍜'],
    shopping: ['Compras', '🛍️'], tickets: ['Entradas', '🎟️'], cafe: ['Café', '☕'], gifts: ['Regalos', '🎁'], other: ['Otros', '📱']
  };
  const PAYMENT = { cash: ['Efectivo', '💴'], card: ['Tarjeta', '💳'], ic: ['Suica/IC', '🚃'], other: ['Otro', '•'] };
  const RESERVATION = {
    hotel: ['Hotel', '🏨'], restaurant: ['Restaurante', '🍜'], train: ['Tren', '🚄'], flight: ['Vuelo', '✈️'],
    activity: ['Actividad', '🎟️'], other: ['Otro', '📌']
  };
  const TRANSPORT = {
    flight: ['Vuelo', '✈️'], train: ['Tren', '🚆'], shinkansen: ['Shinkansen', '🚄'], metro: ['Metro', '🚇'],
    bus: ['Autobús', '🚌'], taxi: ['Taxi', '🚕'], other: ['Otro', '🧭']
  };
  const MODE = {
    walk: ['A pie', '🚶'], train: ['Tren', '🚆'], metro: ['Metro', '🚇'], shinkansen: ['Shinkansen', '🚄'],
    bus: ['Bus', '🚌'], taxi: ['Taxi', '🚕'], other: ['Otro', '🧭']
  };
  const PRIORITY = { high: ['Alta', '🔴'], medium: ['Media', '🟡'], low: ['Baja', '⚪'] };
  const NOTE_SCOPE = { general: ['General', '🗒️'], city: ['Ciudad', '🏙️'], day: ['Día', '📅'], place: ['Lugar', '📍'], restaurant: ['Restaurante', '🍜'] };
  const CHECK_SECTION = { before: ['Antes del viaje', '🧳'], luggage: ['Maleta', '🎒'], during: ['Durante el viaje', '🗾'], custom: ['Personalizadas', '✅'] };
  const DOC_KIND = {
    flight: ['Vuelo', '✈️'], hotel: ['Hotel', '🏨'], insurance: ['Seguro', '🛡️'], emergency: ['Emergencia', '🆘'],
    ticket: ['Billete', '🎫'], id: ['Identificación', '🪪'], other: ['Otro', '📄']
  };
  const CURRENCIES = ['JPY', 'EUR', 'USD'];

  /* ── Frases (offline, romanización Hepburn simplificada) ─── */

  const PHRASES = [
    ['Básicas', 'Hola', 'こんにちは', 'Konnichiwa'],
    ['Básicas', 'Buenos días', 'おはようございます', 'Ohayō gozaimasu'],
    ['Básicas', 'Buenas noches (saludo)', 'こんばんは', 'Konbanwa'],
    ['Básicas', 'Gracias', 'ありがとう', 'Arigatō'],
    ['Básicas', 'Muchas gracias', 'ありがとうございます', 'Arigatō gozaimasu'],
    ['Básicas', 'Perdón / Disculpe', 'すみません', 'Sumimasen'],
    ['Básicas', 'Lo siento', 'ごめんなさい', 'Gomen nasai'],
    ['Básicas', 'Sí', 'はい', 'Hai'],
    ['Básicas', 'No', 'いいえ', 'Iie'],
    ['Básicas', 'Por favor (pidiendo algo)', 'お願いします', 'Onegai shimasu'],
    ['Básicas', 'No entiendo', 'わかりません', 'Wakarimasen'],
    ['Básicas', '¿Habla inglés?', '英語を話せますか？', 'Eigo o hanasemasu ka?'],
    ['Básicas', 'Adiós', 'さようなら', 'Sayōnara'],
    ['Direcciones', '¿Dónde está la estación?', '駅はどこですか？', 'Eki wa doko desu ka?'],
    ['Direcciones', '¿Dónde está el baño?', 'トイレはどこですか？', 'Toire wa doko desu ka?'],
    ['Direcciones', '¿Dónde está esto?', 'これはどこですか？', 'Kore wa doko desu ka?'],
    ['Direcciones', 'Derecha', '右', 'Migi'],
    ['Direcciones', 'Izquierda', '左', 'Hidari'],
    ['Direcciones', 'Todo recto', 'まっすぐ', 'Massugu'],
    ['Direcciones', '¿Este tren va a Kioto?', 'この電車は京都に行きますか？', 'Kono densha wa Kyōto ni ikimasu ka?'],
    ['Direcciones', 'A esta dirección, por favor (taxi)', 'この住所までお願いします', 'Kono jūsho made onegai shimasu'],
    ['Restaurante', 'Mesa para dos, por favor', '二人です', 'Futari desu'],
    ['Restaurante', 'La carta, por favor', 'メニューをお願いします', 'Menyū o onegai shimasu'],
    ['Restaurante', '¿Tienen carta en inglés?', '英語のメニューはありますか？', 'Eigo no menyū wa arimasu ka?'],
    ['Restaurante', 'Esto, por favor', 'これをください', 'Kore o kudasai'],
    ['Restaurante', 'Agua, por favor', 'お水をください', 'Omizu o kudasai'],
    ['Restaurante', 'La cuenta, por favor', 'お会計をお願いします', 'Okaikei o onegai shimasu'],
    ['Restaurante', '¡Que aproveche! (antes de comer)', 'いただきます', 'Itadakimasu'],
    ['Restaurante', 'Gracias por la comida', 'ごちそうさまでした', 'Gochisōsama deshita'],
    ['Restaurante', 'Está delicioso', 'おいしいです', 'Oishii desu'],
    ['Restaurante', 'Soy alérgico/a a…', '…のアレルギーがあります', '… no arerugī ga arimasu'],
    ['Restaurante', 'No como carne', '肉を食べません', 'Niku o tabemasen'],
    ['Compras', '¿Cuánto cuesta?', 'いくらですか？', 'Ikura desu ka?'],
    ['Compras', '¿Puedo pagar con tarjeta?', 'カードで払えますか？', 'Kādo de haraemasu ka?'],
    ['Compras', '¿Es tax free?', '免税できますか？', 'Menzei dekimasu ka?'],
    ['Compras', 'Sólo estoy mirando', '見ているだけです', 'Mite iru dake desu'],
    ['Compras', 'No necesito bolsa', '袋はいりません', 'Fukuro wa irimasen'],
    ['Emergencias', '¡Ayuda!', '助けて！', 'Tasukete!'],
    ['Emergencias', 'Llame a una ambulancia', '救急車を呼んでください', 'Kyūkyūsha o yonde kudasai'],
    ['Emergencias', 'Llame a la policía', '警察を呼んでください', 'Keisatsu o yonde kudasai'],
    ['Emergencias', 'Me encuentro mal', '気分が悪いです', 'Kibun ga warui desu'],
    ['Emergencias', 'He perdido mi pasaporte', 'パスポートをなくしました', 'Pasupōto o nakushimashita'],
    ['Emergencias', '¿Dónde está el hospital?', '病院はどこですか？', 'Byōin wa doko desu ka?']
  ];

  /* ── Información práctica (editable, orientativa, NO oficial) ─ */

  const INFO = [
    ['💴', 'Divisa y pagos', 'La moneda es el yen (JPY). El tipo de cambio actualizado está en Gastos (requiere conexión; se guarda el último para usarlo offline).\n\nMuchos locales pequeños, templos y puestos siguen siendo sólo efectivo. Los cajeros de 7-Eleven (Seven Bank) y de oficinas de correos suelen aceptar tarjetas extranjeras.\n\nLas tarjetas IC (Suica, PASMO, ICOCA) sirven para transporte y para pagar en konbinis y máquinas.'],
    ['🔌', 'Enchufes y voltaje', 'Enchufes tipo A (dos patillas planas) y a veces tipo B. Voltaje 100 V; 50 Hz en el este (Tokio) y 60 Hz en el oeste (Kioto, Osaka).\n\nLos cargadores de móvil y portátil suelen ser multivoltaje (100–240 V): sólo necesitas adaptador. Revisa secadores y planchas.'],
    ['🕘', 'Zona horaria', 'JST, UTC+9, sin horario de verano. Respecto a España peninsular: +8 h en horario de invierno y +7 h en horario de verano.'],
    ['🆘', 'Emergencias', 'Policía: 110\nBomberos y ambulancia: 119\nGuardacostas: 118\n\nJapan Visitor Hotline (JNTO, 24 h, en inglés): +81-50-3816-2787\n\nGuarda en «Documentos» el teléfono de tu seguro de viaje y de la embajada o consulado de tu país.'],
    ['🚆', 'Transporte', 'Los trenes son muy puntuales: llega al andén con unos minutos de margen. El último tren suele salir entre las 23:30 y las 00:30; consúltalo antes de salir de noche.\n\nEn los andenes se hace cola en las marcas del suelo. Habla bajo y evita llamadas en el tren.\n\nCalcula si te compensa el JR Pass comparándolo con los billetes sueltos de tu ruta: su precio ha cambiado en los últimos años.'],
    ['🙇', 'Normas culturales', '• Descálzate cuando veas un escalón de entrada o zapatillas preparadas.\n• En muchas zonas no se come caminando; se come junto al puesto.\n• En templos y santuarios, purifícate en el temizuya y respeta las indicaciones de no fotografiar.\n• Las papeleras escasean: lleva una bolsa para tu basura.\n• En onsen: ducha completa antes, sin bañador, la toalla pequeña fuera del agua. Algunos no admiten tatuajes.'],
    ['🤝', 'Propinas', 'No se dan propinas; puede incluso causar confusión. Un «gochisōsama deshita» al salir es el mejor agradecimiento.'],
    ['🚻', 'Baños públicos', 'Hay baños limpios y gratuitos en estaciones, konbinis, centros comerciales y parques. Muchos inodoros tienen panel con botones: 止 (tomeru) para parar.'],
    ['🧾', 'Tax free', 'Los turistas pueden comprar sin el impuesto al consumo en tiendas adheridas, presentando el pasaporte y superando un importe mínimo por tienda y día.\n\nEl sistema está cambiando: Japón anunció el paso a un sistema de reembolso en el aeropuerto a partir de noviembre de 2026. Verifica las condiciones vigentes antes de comprar.'],
    ['📶', 'Conectividad', 'Una eSIM de datos o un router wifi de bolsillo facilita mapas y traducción. Esta app guarda itinerario, notas, gastos y frases para usarlos sin conexión; los restaurantes cercanos y el mapa base requieren Internet.'],
    ['💡', 'Consejos generales', '• Los konbinis (7-Eleven, Lawson, FamilyMart) abren 24 h: comida, cajeros, envíos.\n• Los restaurantes populares tienen cola: llega antes de la apertura o reserva.\n• Muchas atracciones cierran la venta 30 min antes del cierre.\n• Algunos museos cierran un día a la semana (a menudo el lunes).\n• El envío de maletas entre hoteles (takkyubin) es muy útil al cambiar de ciudad.']
  ];

  const CHECKLISTS = [
    ['Antes del viaje', 'before', ['Pasaporte (vigente)', 'Seguro de viaje', 'Adaptador de enchufe (tipo A)', 'Reservas confirmadas', 'JR Pass / transporte', 'eSIM o wifi de bolsillo', 'Dinero en efectivo / tarjeta sin comisiones', 'Medicamentos', 'Copias de documentos']],
    ['Maleta', 'luggage', ['Ropa', 'Zapatillas cómodas', 'Cargadores', 'Power bank', 'Neceser', 'Cámara']],
    ['Durante el viaje', 'during', ['Recargar tarjeta IC', 'Comprobar último tren', 'Hacer check-in online del vuelo de vuelta']]
  ];

  function emptyCollections() {
    return {
      travelers: {}, cities: {}, days: {}, activities: {}, places: {}, restaurants: {}, expenses: {}, notes: {},
      reservations: {}, transports: {}, checklists: {}, checklistItems: {}, infoArticles: {}, phrases: {}, docs: {}
    };
  }

  const DEFAULT_SETTINGS = {
    theme: 'system', units: 'km', notificationsEnabled: false, notifyLeadMinutes: 30, travelMode: 'auto',
    placesProvider: 'auto', manualRates: {}, yenRounding: 'up', simulatedDate: '', simulatedTime: ''
  };

  /** Frases, información útil y checklists: no son "de ejemplo" y sobreviven al borrarlo. */
  function baseContent(ts) {
    const out = { phrases: {}, infoArticles: {}, checklists: {}, checklistItems: {} };
    PHRASES.forEach(function (p) {
      const id = U.uid('ph');
      out.phrases[id] = { id: id, category: p[0], es: p[1], ja: p[2], romaji: p[3], favorite: false, createdAt: ts, updatedAt: ts };
    });
    INFO.forEach(function (x, i) {
      const id = U.uid('i');
      out.infoArticles[id] = { id: id, icon: x[0], title: x[1], body: x[2], order: i, createdAt: ts, updatedAt: ts };
    });
    CHECKLISTS.forEach(function (c, i) {
      const id = U.uid('cl');
      out.checklists[id] = { id: id, title: c[0], section: c[1], order: i, createdAt: ts, updatedAt: ts };
      c[2].forEach(function (text, j) {
        const iid = U.uid('ci');
        out.checklistItems[iid] = { id: iid, checklistId: id, text: text, done: false, order: j, createdAt: ts, updatedAt: ts };
      });
    });
    return out;
  }

  /* ── Viaje de ejemplo: 19 nov → 16 dic 2026 (28 días) ────────
     Todo lleva isSample: true y la app muestra un aviso.
     Lugares reales con coordenadas aproximadas y horarios orientativos;
     restaurantes, hoteles, códigos de reserva, precios y gastos son FICTICIOS.

     Hay 15 días con plan (índices 0-14 en `dayIds`) repartidos entre los 28
     del viaje; el resto son días libres en la ciudad que toque. */

  const START = '2026-11-19', END = '2026-12-16';
  /* Posición (0-27) de cada uno de los 15 días con plan. */
  const PLANNED = [0, 1, 2, 3, 4, 7, 8, 9, 10, 13, 14, 15, 19, 20, 27];

  function sampleTrip() {
    const ts = Date.now();
    const meta = { createdAt: ts, updatedAt: ts, isSample: true };
    /** Fecha del día con plan i (0-14). */
    const date = (i) => U.addDays(START, PLANNED[i]);
    const d = Object.assign({
      trip: { id: U.uid('t'), name: 'Japón 2026', emoji: '🇯🇵', startDate: START, endDate: END, mainCurrency: 'JPY', totalBudget: 1800000, timezoneOffsetMinutes: 540, isSample: true, demoDate: U.addDays(START, PLANNED[6]) },
      settings: Object.assign({}, DEFAULT_SETTINGS)
    }, emptyCollections(), baseContent(ts));
    const put = (col, prefix, obj) => { const id = U.uid(prefix); d[col][id] = Object.assign({ id: id }, obj, meta); return id; };

    const carlos = put('travelers', 'p', { name: 'Carlos', color: '#C8102E', isMe: true });
    const ana = put('travelers', 'p', { name: 'Ana', color: '#2F6F73' });
    const pablo = put('travelers', 'p', { name: 'Pablo', color: '#B0893E' });
    const all = [carlos, ana, pablo];

    const city = (name, ja, lat, lng, budget, color) => put('cities', 'c', { name: name, nameJa: ja, coords: { lat: lat, lng: lng }, budget: budget, color: color });
    const tokyo = city('Tokyo', '東京', 35.6812, 139.7671, 220000, '#C8102E');
    const kyoto = city('Kyoto', '京都', 35.0116, 135.7681, 140000, '#2F6F73');
    const nara = city('Nara', '奈良', 34.6851, 135.8048, 20000, '#6B8E4E');
    const osaka = city('Osaka', '大阪', 34.6937, 135.5023, 80000, '#B0893E');

    // Ciudad de cada uno de los 28 días: Tokyo 7 · Kyoto 6 · Nara 1 · Osaka 5 · Tokyo 9.
    const cityAt = (pos) => (pos < 7 ? tokyo : pos < 13 ? kyoto : pos < 14 ? nara : pos < 19 ? osaka : tokyo);
    const titles = ['Llegada y Shibuya', 'Tsukiji, teamLab y Ginza', 'Asakusa y Ueno', 'Meiji y Shinjuku', 'Shimokitazawa y Skytree', 'Shinkansen a Kyoto', 'Fushimi Inari y Higashiyama', 'Arashiyama y Kinkaku-ji', 'Este de Kyoto', 'Excursión a Nara', 'Castillo y Dotonbori', 'Umeda y compras', 'Vuelta a Tokyo', 'Skytree y últimas compras', 'Regreso'];
    const dayIds = [];
    U.dateRange(START, END).forEach(function (iso, pos) {
      const planned = PLANNED.indexOf(pos);
      const id = put('days', 'd', { date: iso, cityId: cityAt(pos), title: planned > -1 ? titles[planned] : 'Día libre' });
      if (planned > -1) dayIds[planned] = id;
    });

    const place = (name, cityId, category, lat, lng, extra) => put('places', 'pl', Object.assign({ name: name, cityId: cityId, category: category, coords: { lat: lat, lng: lng }, priority: 'medium', status: 'pending', favorite: false }, extra || {}));
    const P = {
      shibuyaCrossing: place('Cruce de Shibuya', tokyo, 'neighborhood', 35.6595, 139.7005, { neighborhood: 'Shibuya', visitMinutes: 45, description: 'El cruce peatonal más famoso. Mejor vista desde el segundo piso de la estación o desde Shibuya Sky.' }),
      harajuku: place('Takeshita-dori (Harajuku)', tokyo, 'neighborhood', 35.6716, 139.7031, { neighborhood: 'Harajuku', visitMinutes: 75 }),
      shibuyaSky: place('Shibuya Sky', tokyo, 'viewpoint', 35.6585, 139.7024, { neighborhood: 'Shibuya', hours: 'Mo-Su 10:00-22:30', priceApprox: '≈ ¥2.500', priority: 'high', favorite: true, visitMinutes: 75, description: 'Mirador en la azotea de Shibuya Scramble Square. Reservar la franja del atardecer.' }),
      tsukiji: place('Mercado exterior de Tsukiji', tokyo, 'market', 35.6654, 139.7707, { neighborhood: 'Tsukiji', hours: 'Mo-Sa 06:00-14:00; Su off', visitMinutes: 90 }),
      teamlab: place('teamLab Planets', tokyo, 'experience', 35.6491, 139.7898, { neighborhood: 'Toyosu', hours: 'Mo-Su 09:00-22:00', priceApprox: '≈ ¥3.800', priority: 'high', visitMinutes: 120 }),
      ginza: place('Ginza', tokyo, 'neighborhood', 35.6717, 139.765, { neighborhood: 'Ginza', visitMinutes: 90 }),
      sensoji: place('Senso-ji', tokyo, 'temple', 35.7148, 139.7967, { neighborhood: 'Asakusa', hours: 'Mo-Su 06:00-17:00', priority: 'high', favorite: true, visitMinutes: 75, description: 'El templo más antiguo de Tokyo. Calle Nakamise para picar algo.' }),
      ueno: place('Parque de Ueno', tokyo, 'park', 35.7148, 139.7731, { neighborhood: 'Ueno', visitMinutes: 45 }),
      tnm: place('Museo Nacional de Tokyo', tokyo, 'museum', 35.7188, 139.7765, { neighborhood: 'Ueno', hours: 'Tu-Su 09:30-17:00; Mo off', priceApprox: '≈ ¥1.000', visitMinutes: 120 }),
      akihabara: place('Akihabara', tokyo, 'neighborhood', 35.6984, 139.7731, { neighborhood: 'Akihabara', visitMinutes: 120 }),
      meiji: place('Santuario Meiji', tokyo, 'shrine', 35.6764, 139.6993, { neighborhood: 'Harajuku', hours: 'Mo-Su 05:00-18:00', visitMinutes: 60 }),
      gyoen: place('Shinjuku Gyoen', tokyo, 'park', 35.6852, 139.7101, { neighborhood: 'Shinjuku', hours: 'Tu-Su 09:00-17:30; Mo off', priceApprox: '≈ ¥500', visitMinutes: 75 }),
      omoide: place('Omoide Yokocho', tokyo, 'neighborhood', 35.6933, 139.6995, { neighborhood: 'Shinjuku', visitMinutes: 60 }),
      shimokita: place('Shimokitazawa', tokyo, 'neighborhood', 35.6618, 139.6681, { neighborhood: 'Setagaya', visitMinutes: 120, description: 'Barrio de tiendas vintage y cafés.' }),
      skytree: place('Tokyo Skytree', tokyo, 'viewpoint', 35.7101, 139.8107, { neighborhood: 'Oshiage', hours: 'Mo-Su 10:00-21:00', priceApprox: '≈ ¥3.100', visitMinutes: 90 }),
      fushimi: place('Fushimi Inari Taisha', kyoto, 'shrine', 34.9671, 135.7727, { neighborhood: 'Fushimi', hours: '24/7', priority: 'high', favorite: true, visitMinutes: 150, description: 'Miles de torii rojos que suben por el monte Inari. Ir temprano.' }),
      kiyomizu: place('Kiyomizu-dera', kyoto, 'temple', 34.9949, 135.785, { neighborhood: 'Higashiyama', hours: 'Mo-Su 06:00-18:00', priceApprox: '≈ ¥500', priority: 'high', visitMinutes: 90 }),
      gion: place('Gion', kyoto, 'neighborhood', 35.0037, 135.7752, { neighborhood: 'Gion', visitMinutes: 90 }),
      nishiki: place('Mercado de Nishiki', kyoto, 'market', 35.005, 135.7649, { neighborhood: 'Nakagyo', hours: 'Mo-Su 10:00-17:00', visitMinutes: 60 }),
      nijo: place('Castillo de Nijo', kyoto, 'museum', 35.0142, 135.748, { neighborhood: 'Nakagyo', hours: 'Mo-Su 08:45-16:00', priceApprox: '≈ ¥1.300', visitMinutes: 90 }),
      bamboo: place('Bosque de bambú de Arashiyama', kyoto, 'park', 35.017, 135.6713, { neighborhood: 'Arashiyama', hours: '24/7', priority: 'high', visitMinutes: 60 }),
      kinkakuji: place('Kinkaku-ji', kyoto, 'temple', 35.0394, 135.7292, { neighborhood: 'Kita', hours: 'Mo-Su 09:00-17:00', priceApprox: '≈ ¥500', visitMinutes: 60 }),
      ginkakuji: place('Ginkaku-ji', kyoto, 'temple', 35.027, 135.7982, { neighborhood: 'Sakyo', hours: 'Mo-Su 08:30-17:00', visitMinutes: 60 }),
      philosopher: place('Camino del Filósofo', kyoto, 'park', 35.0262, 135.7951, { neighborhood: 'Sakyo', visitMinutes: 45 }),
      todaiji: place('Todai-ji', nara, 'temple', 34.689, 135.8398, { hours: 'Mo-Su 07:30-17:30', priority: 'high', visitMinutes: 75 }),
      naraPark: place('Parque de Nara', nara, 'park', 34.6851, 135.843, { visitMinutes: 60, description: 'Ciervos sueltos: compra las galletas oficiales (shika senbei).' }),
      kasuga: place('Kasuga Taisha', nara, 'shrine', 34.6813, 135.8484, { hours: 'Mo-Su 06:30-17:30', visitMinutes: 60 }),
      osakaCastle: place('Castillo de Osaka', osaka, 'museum', 34.6873, 135.5262, { hours: 'Mo-Su 09:00-17:00', priceApprox: '≈ ¥600', visitMinutes: 90 }),
      kuromon: place('Mercado de Kuromon', osaka, 'market', 34.6655, 135.5066, { neighborhood: 'Nippombashi', hours: 'Mo-Su 09:00-18:00', visitMinutes: 60 }),
      shinsekai: place('Shinsekai', osaka, 'neighborhood', 34.6525, 135.5063, { visitMinutes: 60 }),
      dotonbori: place('Dotonbori', osaka, 'neighborhood', 34.6687, 135.5013, { neighborhood: 'Namba', priority: 'high', favorite: true, visitMinutes: 90 }),
      umeda: place('Umeda Sky Building', osaka, 'viewpoint', 34.7053, 135.4896, { neighborhood: 'Umeda', hours: 'Mo-Su 09:30-22:30', visitMinutes: 60 })
    };

    const rest = (name, cityId, cuisine, lat, lng, price, extra) => put('restaurants', 'r', Object.assign({ name: name, cityId: cityId, cuisine: cuisine, coords: { lat: lat, lng: lng }, priceLevel: price, status: 'want', favorite: false, notes: 'Restaurante ficticio (datos de ejemplo).' }, extra || {}));
    const R = {
      ramenKumo: rest('Ramen Kumo', tokyo, 'ramen', 35.6601, 139.6985, 1, { neighborhood: 'Shibuya', hours: 'Mo-Su 11:00-23:00', priceApprox: '¥1.000–1.500', favorite: true }),
      sushiHoshi: rest('Sushi Hoshi', tokyo, 'sushi', 35.6707, 139.7665, 3, { neighborhood: 'Ginza', hours: 'Tu-Su 11:30-14:00,17:30-22:00; Mo off', priceApprox: '¥4.000–8.000' }),
      izakayaKaze: rest('Izakaya Kaze', tokyo, 'izakaya', 35.6722, 139.7642, 2, { neighborhood: 'Ginza', hours: 'Mo-Sa 17:00-24:00; Su off' }),
      tonkatsuMori: rest('Tonkatsu Mori', tokyo, 'tonkatsu', 35.7125, 139.7745, 2, { neighborhood: 'Ueno', hours: 'Mo-Su 11:00-21:00' }),
      yakitoriTsuki: rest('Yakitori Tsuki', tokyo, 'yakitori', 35.6995, 139.7715, 2, { neighborhood: 'Akihabara', hours: 'Mo-Su 17:00-23:30' }),
      udonNami: rest('Udon Nami', tokyo, 'udon', 35.6895, 139.7005, 1, { neighborhood: 'Shinjuku', hours: 'Mo-Su 10:30-22:00' }),
      cafeMidori: rest('Café Midori', tokyo, 'cafe', 35.6625, 139.6672, 1, { neighborhood: 'Shimokitazawa', hours: 'Mo-Su 09:00-19:00' }),
      tempuraAsa: rest('Tempura Asa', tokyo, 'tempura', 35.7118, 139.7955, 3, { neighborhood: 'Asakusa', hours: 'We-Mo 11:30-15:00,17:00-21:00; Tu off', status: 'tried', rating: 5 }),
      yakinikuHi: rest('Yakiniku Hi', tokyo, 'yakiniku', 35.6928, 139.7012, 3, { neighborhood: 'Shinjuku', hours: 'Mo-Su 17:00-24:00' }),
      sobaKawa: rest('Soba Kawa', kyoto, 'soba', 35.0155, 135.6755, 2, { neighborhood: 'Arashiyama', hours: 'Mo-Su 11:00-17:00' }),
      kaisekiYuki: rest('Kaiseki Yuki', kyoto, 'kaiseki', 35.0029, 135.7769, 4, { neighborhood: 'Gion', hours: 'Th-Tu 17:30-22:00; We off', priceApprox: '¥15.000+', favorite: true }),
      ramenInari: rest('Ramen Inari-ya', kyoto, 'ramen', 34.9695, 135.7705, 1, { neighborhood: 'Fushimi', hours: 'Mo-Su 11:00-15:00,17:30-21:00' }),
      curryHigashi: rest('Curry Higashi', kyoto, 'curry', 34.9975, 135.7808, 1, { neighborhood: 'Higashiyama', hours: 'Mo-Su 11:00-20:00' }),
      dessertMatcha: rest('Matcha Dessert Komo', kyoto, 'dessert', 35.0021, 135.7779, 2, { neighborhood: 'Gion', hours: 'Mo-Su 10:00-18:00' }),
      udonNishiki: rest('Udon Nishiki-dori', kyoto, 'udon', 35.0049, 135.7662, 1, { neighborhood: 'Nakagyo', hours: 'Mo-Su 11:00-20:00' }),
      yakitoriPonto: rest('Yakitori Ponto', kyoto, 'yakitori', 35.0068, 135.7712, 2, { neighborhood: 'Pontocho', hours: 'Mo-Su 17:00-23:00' }),
      kamaNara: rest('Kama-meshi Shika', nara, 'other', 34.6835, 135.8295, 2, { hours: 'Mo-Su 11:00-19:00' }),
      okonomiDoton: rest('Okonomiyaki Doton', osaka, 'okonomiyaki', 34.6688, 135.5025, 1, { neighborhood: 'Namba', hours: 'Mo-Su 11:00-23:00', favorite: true }),
      sushiKuromon: rest('Sushi Kuromon-mae', osaka, 'sushi', 34.6659, 135.5072, 2, { neighborhood: 'Nippombashi', hours: 'Mo-Su 09:00-17:00' }),
      curryUmeda: rest('Curry Umeda Underground', osaka, 'curry', 34.7032, 135.4975, 1, { neighborhood: 'Umeda', hours: 'Mo-Su 10:00-22:00' }),
      yakinikuNamba: rest('Yakiniku Namba-tei', osaka, 'yakiniku', 34.6655, 135.5011, 3, { neighborhood: 'Namba', hours: 'Mo-Su 17:00-24:00' })
    };

    const loc = (name, lat, lng, address) => ({ name: name, address: address, coords: { lat: lat, lng: lng } });
    const resv = (type, name, date, extra) => put('reservations', 'rv', Object.assign({ type: type, name: name, date: date }, extra || {}));
    const RV = {
      hotelTokyo: resv('hotel', 'Hotel Sakura Shinjuku (ficticio)', date(0), { endDate: date(5), time: '15:00', cityId: tokyo, confirmationCode: 'EJ-48213', cost: 95000, currency: 'JPY', phone: '+81 3-0000-0000', location: loc('Hotel Sakura Shinjuku', 35.6909, 139.7003, 'Shinjuku, Tokyo (dirección de ejemplo)'), notes: 'Check-in 15:00 · Check-out 11:00. Se puede dejar la maleta antes.' }),
      hotelKyoto: resv('hotel', 'Ryokan Momiji (ficticio)', date(5), { endDate: date(9), time: '15:00', cityId: kyoto, confirmationCode: 'EJ-77120', cost: 88000, currency: 'JPY', location: loc('Ryokan Momiji', 34.9965, 135.7618, 'Shimogyo, Kyoto (dirección de ejemplo)') }),
      hotelOsaka: resv('hotel', 'Hotel Namba Garden (ficticio)', date(9), { endDate: date(12), time: '15:00', cityId: osaka, confirmationCode: 'EJ-30551', cost: 54000, currency: 'JPY', location: loc('Hotel Namba Garden', 34.6649, 135.5005, 'Namba, Osaka (dirección de ejemplo)') }),
      hotelTokyo2: resv('hotel', 'Hotel Ueno Station (ficticio)', date(12), { endDate: date(14), time: '15:00', cityId: tokyo, confirmationCode: 'EJ-91002', cost: 42000, currency: 'JPY', location: loc('Hotel Ueno Station', 35.7135, 139.7772, 'Ueno, Tokyo (dirección de ejemplo)') }),
      shibuyaSky: resv('activity', 'Entradas Shibuya Sky', date(0), { time: '18:00', cityId: tokyo, confirmationCode: 'EJ-SKY-0412', cost: 7500, currency: 'JPY', location: loc('Shibuya Sky', 35.6585, 139.7024) }),
      teamlab: resv('activity', 'teamLab Planets', date(1), { time: '10:30', cityId: tokyo, confirmationCode: 'EJ-TLP-2210', cost: 11400, currency: 'JPY' }),
      shinkansen1: resv('train', 'Shinkansen Tokyo → Kyoto', date(5), { time: '08:33', confirmationCode: 'EJ-JR-5521', cost: 42000, currency: 'JPY' }),
      dinnerKyoto: resv('restaurant', 'Cena Kaiseki Yuki', date(6), { time: '19:30', cityId: kyoto, confirmationCode: 'EJ-KY-019', location: loc('Kaiseki Yuki', 35.0029, 135.7769), notes: 'Avisar de alergias al llegar. Se paga en el local.' }),
      shinkansen2: resv('train', 'Shinkansen Shin-Osaka → Tokyo', date(12), { time: '10:00', confirmationCode: 'EJ-JR-8830', cost: 43500, currency: 'JPY' }),
      flightBack: resv('flight', 'Vuelo Narita → Madrid (ficticio)', date(14), { time: '14:00', confirmationCode: 'EJ7Q2X' })
    };

    const order = {};
    const act = (di, time, title, category, extra) => {
      const dayId = dayIds[di];
      const o = order[dayId] || 0;
      order[dayId] = o + 1;
      return put('activities', 'a', Object.assign({ dayId: dayId, order: o, title: title, category: category, startTime: time, priority: 'medium', status: 'pending' }, extra || {}));
    };
    const visit = (di, t, pid, extra) => act(di, t, d.places[pid].name, 'visit', Object.assign({ placeId: pid }, extra || {}));
    const eat = (di, t, title, rid, extra) => act(di, t, title, 'restaurant', Object.assign({ restaurantId: rid }, extra || {}));
    const m = (mode) => ({ transportMode: mode });
    const hotelLoc = (id) => d.reservations[id].location;

    act(0, '09:00', 'Llegada a Narita', 'transport', { location: loc('Aeropuerto de Narita', 35.772, 140.3929), priority: 'high' });
    act(0, '11:30', 'Hotel: dejar maletas', 'hotel', Object.assign({ reservationId: RV.hotelTokyo, location: hotelLoc(RV.hotelTokyo) }, m('train')));
    visit(0, '13:00', P.shibuyaCrossing, Object.assign({ endTime: '14:00' }, m('train')));
    visit(0, '15:30', P.harajuku, Object.assign({ endTime: '17:00' }, m('walk')));
    visit(0, '18:00', P.shibuyaSky, Object.assign({ endTime: '19:15', reservationId: RV.shibuyaSky, priority: 'high', estimatedCost: 7500, costCurrency: 'JPY' }, m('train')));
    eat(0, '20:00', 'Cena: ramen', R.ramenKumo, m('walk'));
    visit(1, '08:00', P.tsukiji, Object.assign({ endTime: '09:30' }, m('metro')));
    visit(1, '10:30', P.teamlab, Object.assign({ endTime: '12:30', reservationId: RV.teamlab, priority: 'high' }, m('metro')));
    eat(1, '13:00', 'Almuerzo: sushi', R.sushiHoshi, m('metro'));
    visit(1, '15:00', P.ginza, Object.assign({ endTime: '17:30' }, m('walk')));
    eat(1, '19:00', 'Cena en izakaya', R.izakayaKaze, m('walk'));
    visit(2, '09:00', P.sensoji, Object.assign({ endTime: '10:30', priority: 'high' }, m('metro')));
    visit(2, '11:30', P.ueno, m('metro'));
    eat(2, '12:30', 'Almuerzo: tonkatsu', R.tonkatsuMori, m('walk'));
    visit(2, '14:00', P.tnm, Object.assign({ endTime: '16:30' }, m('walk')));
    visit(2, '17:30', P.akihabara, m('train'));
    eat(2, '20:00', 'Cena: yakitori', R.yakitoriTsuki, m('walk'));
    visit(3, '09:00', P.meiji, m('train'));
    visit(3, '11:00', P.gyoen, m('train'));
    eat(3, '13:00', 'Almuerzo: udon', R.udonNami, m('walk'));
    act(3, '15:00', 'Compras en Shinjuku', 'shopping', Object.assign({ location: loc('Shinjuku', 35.6905, 139.7004) }, m('walk')));
    visit(3, '19:00', P.omoide, m('walk'));
    visit(4, '10:00', P.shimokita, m('train'));
    eat(4, '13:00', 'Café y brunch', R.cafeMidori, m('walk'));
    visit(4, '16:00', P.skytree, m('train'));
    eat(4, '19:30', 'Cena: yakiniku', R.yakinikuHi, m('train'));
    act(5, '08:33', 'Shinkansen Tokyo → Kyoto', 'transport', { endTime: '10:45', reservationId: RV.shinkansen1, priority: 'high', location: loc('Estación de Tokyo', 35.6812, 139.7671) });
    act(5, '11:15', 'Ryokan: dejar maletas', 'hotel', Object.assign({ reservationId: RV.hotelKyoto, location: hotelLoc(RV.hotelKyoto) }, m('metro')));
    visit(5, '12:30', P.nishiki, m('metro'));
    eat(5, '13:15', 'Almuerzo: udon', R.udonNishiki, m('walk'));
    visit(5, '15:00', P.nijo, m('metro'));
    visit(5, '18:00', P.gion, m('bus'));
    eat(5, '20:00', 'Cena en Pontocho', R.yakitoriPonto, m('walk'));
    visit(6, '09:00', P.fushimi, Object.assign({ endTime: '11:30', priority: 'high', notes: 'Llevar agua. La subida completa son 2-3 h.' }, m('train')));
    eat(6, '12:30', 'Almuerzo', R.ramenInari, m('walk'));
    visit(6, '15:00', P.kiyomizu, Object.assign({ endTime: '16:30', priority: 'high' }, m('train')));
    visit(6, '17:00', P.gion, m('walk'));
    eat(6, '19:30', 'Cena kaiseki (reserva)', R.kaisekiYuki, Object.assign({ reservationId: RV.dinnerKyoto, priority: 'high', estimatedCost: 45000, costCurrency: 'JPY' }, m('walk')));
    visit(7, '08:30', P.bamboo, m('train'));
    eat(7, '12:30', 'Almuerzo: soba', R.sobaKawa, m('walk'));
    visit(7, '15:00', P.kinkakuji, m('bus'));
    act(7, '19:00', 'Cena libre', 'restaurant', Object.assign({ location: loc('Kawaramachi', 35.0037, 135.7689) }, m('bus')));
    visit(8, '09:00', P.ginkakuji, m('bus'));
    visit(8, '10:30', P.philosopher, m('walk'));
    act(8, '13:00', 'Postre de matcha', 'cafe', Object.assign({ restaurantId: R.dessertMatcha }, m('bus')));
    act(8, '15:00', 'Compras de regalos en Higashiyama', 'shopping', Object.assign({ location: loc('Ninenzaka', 34.9983, 135.7804) }, m('walk')));
    act(9, '09:00', 'Tren Kyoto → Nara', 'transport', { endTime: '09:45', location: loc('Estación de Kyoto', 34.9858, 135.7588) });
    visit(9, '10:00', P.todaiji, m('walk'));
    eat(9, '12:00', 'Almuerzo: kama-meshi', R.kamaNara, m('walk'));
    visit(9, '13:30', P.naraPark, m('walk'));
    visit(9, '15:00', P.kasuga, m('walk'));
    act(9, '17:30', 'Tren Nara → Osaka', 'transport', { location: loc('Estación Kintetsu-Nara', 34.6845, 135.8274) });
    act(9, '18:30', 'Check-in hotel Osaka', 'hotel', Object.assign({ reservationId: RV.hotelOsaka, location: hotelLoc(RV.hotelOsaka) }, m('train')));
    visit(10, '09:30', P.osakaCastle, m('metro'));
    eat(10, '12:00', 'Almuerzo en Kuromon', R.sushiKuromon, m('metro'));
    visit(10, '15:00', P.shinsekai, m('metro'));
    eat(10, '19:00', 'Cena: okonomiyaki', R.okonomiDoton, m('metro'));
    visit(11, '10:00', P.umeda, m('metro'));
    eat(11, '13:00', 'Almuerzo: curry', R.curryUmeda, m('walk'));
    act(11, '15:00', 'Compras en Shinsaibashi', 'shopping', Object.assign({ location: loc('Shinsaibashi-suji', 34.6735, 135.5013) }, m('metro')));
    eat(11, '20:00', 'Cena: yakiniku', R.yakinikuNamba, m('walk'));
    act(12, '10:00', 'Shinkansen Shin-Osaka → Tokyo', 'transport', { endTime: '12:30', reservationId: RV.shinkansen2, priority: 'high', location: loc('Estación Shin-Osaka', 34.7334, 135.5001) });
    act(12, '13:30', 'Check-in hotel Ueno', 'hotel', Object.assign({ reservationId: RV.hotelTokyo2, location: hotelLoc(RV.hotelTokyo2) }, m('train')));
    act(12, '15:00', 'Regalos en Shibuya', 'shopping', Object.assign({ location: loc('Shibuya', 35.658, 139.7016) }, m('train')));
    eat(12, '19:30', 'Cena de ramen', R.ramenKumo, m('walk'));
    visit(13, '10:00', P.skytree, m('train'));
    eat(13, '13:00', 'Almuerzo: tempura', R.tempuraAsa, m('train'));
    visit(13, '16:00', P.akihabara, m('train'));
    act(13, '20:00', 'Última cena', 'restaurant', Object.assign({ location: loc('Ueno', 35.7101, 139.7745) }, m('train')));
    act(14, '09:00', 'Check-out', 'hotel', { reservationId: RV.hotelTokyo2, location: hotelLoc(RV.hotelTokyo2) });
    act(14, '10:30', 'Tren a Narita', 'transport', { location: loc('Estación de Ueno', 35.7138, 139.7773) });
    act(14, '14:00', 'Vuelo de vuelta', 'transport', Object.assign({ reservationId: RV.flightBack, priority: 'high', location: loc('Aeropuerto de Narita', 35.772, 140.3929) }, m('train')));

    const tr = (kind, origin, destination, date, extra) => put('transports', 'tr', Object.assign({ kind: kind, origin: origin, destination: destination, date: date }, extra || {}));
    tr('flight', 'Madrid', 'Tokyo Narita', U.addDays(START, -1), { arriveDate: START, departTime: '12:30', arriveTime: '09:00', durationMinutes: 870, number: 'EJ 123', bookingCode: 'EJ7Q2X', notes: 'Vuelo ficticio.' });
    tr('train', 'Narita', 'Shinjuku', date(0), { departTime: '10:15', arriveTime: '11:35', durationMinutes: 80, number: "N'EX", cost: 9750, currency: 'JPY' });
    tr('shinkansen', 'Tokyo', 'Kyoto', date(5), { departTime: '08:33', arriveTime: '10:45', durationMinutes: 132, number: 'Nozomi (ej.)', seat: 'Coche 7', bookingCode: 'EJ-JR-5521', cost: 14000, currency: 'JPY' });
    tr('train', 'Kyoto', 'Nara', date(9), { departTime: '09:00', arriveTime: '09:45', durationMinutes: 45, number: 'Kintetsu', cost: 760, currency: 'JPY' });
    tr('train', 'Nara', 'Osaka Namba', date(9), { departTime: '17:30', arriveTime: '18:10', durationMinutes: 40, cost: 680, currency: 'JPY' });
    tr('shinkansen', 'Shin-Osaka', 'Tokyo', date(12), { departTime: '10:00', arriveTime: '12:30', durationMinutes: 150, bookingCode: 'EJ-JR-8830', cost: 14500, currency: 'JPY' });
    tr('train', 'Ueno', 'Narita', date(14), { departTime: '10:30', arriveTime: '11:30', durationMinutes: 60, number: 'Skyliner', cost: 2580, currency: 'JPY' });
    tr('flight', 'Tokyo Narita', 'Madrid', date(14), { arriveDate: U.addDays(date(14), 1), departTime: '14:00', arriveTime: '06:50', durationMinutes: 1490, number: 'EJ 124', bookingCode: 'EJ7Q2X', notes: 'Vuelo y escala ficticios.',
      stops: [{ place: 'Doha (DOH)', arriveDate: date(14), arriveTime: '18:50', departDate: U.addDays(date(14), 1), departTime: '01:30', number: 'EJ 458' }] });

    const ex = (amount, currency, category, date, description, paidById, splitWithIds, extra) => put('expenses', 'e', Object.assign({ amount: amount, currency: currency, category: category, date: date, description: description, paidById: paidById, splitWithIds: splitWithIds }, extra || {}));
    ex(2550, 'EUR', 'flights', '2026-09-15', 'Vuelos ida y vuelta (3 personas)', carlos, all, { paymentMethod: 'card' });
    ex(95000, 'JPY', 'hotel', date(0), 'Hotel Sakura Shinjuku', ana, all, { cityId: tokyo, paymentMethod: 'card' });
    ex(29250, 'JPY', 'transport', date(0), "N'EX x3", carlos, all, { cityId: tokyo, paymentMethod: 'card' });
    ex(7500, 'JPY', 'tickets', date(0), 'Shibuya Sky x3', pablo, all, { cityId: tokyo, placeName: 'Shibuya Sky', paymentMethod: 'card' });
    ex(4200, 'JPY', 'food', date(0), 'Cena ramen Shibuya', carlos, all, { cityId: tokyo, placeName: 'Ramen Kumo (Shibuya)', paymentMethod: 'cash' });
    ex(3000, 'JPY', 'transport', date(0), 'Recarga Suica', carlos, [carlos], { cityId: tokyo, paymentMethod: 'cash' });
    ex(11400, 'JPY', 'tickets', date(1), 'teamLab Planets x3', ana, all, { cityId: tokyo, paymentMethod: 'card' });
    ex(18600, 'JPY', 'food', date(1), 'Almuerzo sushi Ginza', pablo, all, { cityId: tokyo, placeName: 'Ginza', paymentMethod: 'card' });
    ex(12000, 'JPY', 'food', date(1), 'Cena izakaya', carlos, all, { cityId: tokyo, paymentMethod: 'cash' });
    ex(6500, 'JPY', 'shopping', date(1), 'Recuerdos Ginza', ana, [ana], { cityId: tokyo, paymentMethod: 'card' });
    ex(1350, 'JPY', 'cafe', date(2), 'Café en Asakusa', pablo, [pablo], { cityId: tokyo, paymentMethod: 'ic' });
    ex(3000, 'JPY', 'tickets', date(2), 'Museo Nacional x3', carlos, all, { cityId: tokyo, paymentMethod: 'cash' });
    ex(4800, 'JPY', 'gifts', date(2), 'Omamori para la familia', carlos, [carlos], { cityId: tokyo, placeName: 'Senso-ji', paymentMethod: 'cash' });

    const note = (body, scope, refId, extra) => put('notes', 'n', Object.assign({ body: body, scope: scope, refId: refId, pinned: false }, extra || {}));
    note('Comprar adaptador en Tokyo (Bic Camera o Yodobashi).', 'city', tokyo, { pinned: true });
    note('Reservar restaurante con antelación: los populares se llenan con semanas de antelación.', 'general', undefined, { title: 'Reservas' });
    note('El último tren de vuelta desde Gion sale aproximadamente a las 23:30 (verificar en la estación).', 'day', dayIds[6]);
    note('Subir temprano (antes de las 8) para evitar multitudes. La subida completa son 2-3 h.', 'place', P.fushimi);
    note('Pedir la mesa de la barra, se ve al chef.', 'restaurant', R.kaisekiYuki);
    note('Kyoto: muchos templos cierran a las 17:00. Planificar las visitas por la mañana.', 'city', kyoto);
    note('En Osaka se camina por la derecha en las escaleras mecánicas (en Tokyo por la izquierda).', 'city', osaka);

    const doc = (title, kind, value) => put('docs', 'doc', { title: title, kind: kind, value: value, isSensitive: false });
    doc('Dirección hotel Tokyo (para el taxi)', 'hotel', 'Hotel Sakura Shinjuku — Shinjuku, Tokyo (ejemplo)');
    doc('Asistencia seguro de viaje', 'insurance', '+34 900 000 000 (número de ejemplo)');
    doc('Reserva vuelos', 'flight', 'Localizador EJ7Q2X (ejemplo)');

    return d;
  }

  /** Opciones [valor, etiqueta, emoji] para chips. */
  function options(cat) {
    return Object.keys(cat).map((k) => ({ value: k, label: cat[k][0], emoji: cat[k][1] }));
  }

  return {
    ACTIVITY, PLACE, VISIT_MIN, CUISINE, PRICE, EXPENSE, PAYMENT, RESERVATION, TRANSPORT, MODE, PRIORITY, NOTE_SCOPE,
    CHECK_SECTION, DOC_KIND, CURRENCIES, DEFAULT_SETTINGS, emptyCollections, baseContent, sampleTrip, options
  };
})();
