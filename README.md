# Japón Travel 🇯🇵

Planificador personal para un viaje a Japón: itinerario, Modo Viaje, restaurantes cerca, mapa, gastos, reservas, notas, checklist, frases y más.

- HTML, CSS y JavaScript vanilla, **sin dependencias, sin build y sin servidor**.
- Los datos viven en el `localStorage` del navegador.
- Funciona **sin conexión** y se instala en el móvil como una app.

## Archivos

```
index.html          Esqueleto: contenedor, botón (+) y barra de pestañas
manifest.json       Metadatos PWA (nombre, icono, colores)
sw.js               Service worker: caché offline de la app
icon.svg            Icono
css/styles.css      Estilos (claro/oscuro), en 12 secciones comentadas
js/utils.js         Fechas en hora de Japón, dinero, distancias, horarios, iconos
js/data.js          Categorías, frases, información útil y viaje de ejemplo
js/store.js         localStorage, CRUD con cascadas, selectores, exportar/importar
js/logic.js         Planificador del día, reparto de gastos, búsqueda, importar texto, recordatorios
js/services.js      Red y APIs del navegador: OpenStreetMap, Google Places, BCE, geocodificación,
                    cofre cifrado, avisos, compartir, ficheros
js/ui.js            Componentes: tarjetas, chips, campos, hojas inferiores, menús, toasts
js/views-common.js  Navegación y tarjetas compartidas (timeline, lugares, gastos…)
js/views-trip.js    Inicio, Modo viaje, itinerario, día, actividad, planificador
js/views-places.js  Sitios (lugares + restaurantes), restaurantes cerca, ciudades
js/views-money.js   Gastos y reparto
js/views-more.js    Reservas, transporte, notas, checklist, info, frases, documentos, buscar, importar, ajustes
js/app.js           Router (#/ruta), render, eventos, pulsación larga, deslizar, arranque
```

Cada script usa los anteriores: `utils → data → store → logic → services → ui → views-* → app`. Los `<script>` deben cargarse en ese orden.

---

## Instalación

### En este ordenador

Doble clic en `index.html`. Funciona con `file://` porque los scripts son clásicos, no módulos ES.

Abierta así no hay caché offline ni instalación, y el cifrado de Documentos depende del navegador. Para tener todo, publícala como se explica abajo.

### En el móvil (GitHub Pages)

Android e iOS no permiten instalar una app desde archivos locales: hace falta una URL `https://`. Tus datos siguen siendo solo tuyos y locales: GitHub solo entrega los archivos de la app, y tu viaje nunca sale del móvil.

1. Crea una cuenta en [github.com](https://github.com) si no la tienes.
2. Pulsa **+** (arriba a la derecha) → *New repository*. Nombre: `japon-travel`. Marca **Public** y crea.
3. En el repositorio vacío, pulsa *uploading an existing file*.
4. Entra **dentro** de la carpeta `JaponTravel`, pulsa `Ctrl+A` y arrastra esa selección (los archivos sueltos y las carpetas `css` y `js`).
   > No arrastres la carpeta `JaponTravel` entera desde fuera: los archivos quedarían un nivel más abajo y Pages no encontraría el `index.html`.

   Pulsa *Commit changes*.
5. Ve a **Settings** → **Pages**. En *Branch* elige `main` y la carpeta `/ (root)`, y guarda.
6. Espera un minuto y recarga: aparecerá tu URL, `https://TU-USUARIO.github.io/japon-travel/`.

En el móvil, abre esa URL y añádela a la pantalla de inicio:
- **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* o *Instalar app*.
- **iPhone (Safari):** botón compartir → *Añadir a pantalla de inicio*.

Queda con su icono, a pantalla completa y funcionando sin conexión.

> El repositorio es público: cualquiera puede ver el **código**, pero nadie puede ver tus **datos**, que están solo en tu navegador. No subas al repositorio los JSON/CSV que exportes (el `.gitignore` ya los excluye).

**PC y móvil no se sincronizan.** Para pasar datos de uno a otro: *Ajustes → Exportar todo (JSON)* en el origen e *Importar (JSON)* en el destino.

### Al cambiar el código

Sube la versión en **tres sitios**, que deben coincidir:
- `VERSION` (y `BUILD_DATE`) en `js/utils.js`;
- `CACHE` en `sw.js`;
- `data-build` en `index.html`.

Si no lo haces, el móvil seguirá usando la copia antigua de la caché. *Ajustes → Esta instalación* avisa si la caché no coincide con la versión.

---

## Qué hace

| Sección | Funciones |
|---|---|
| **Inicio** | Cuenta atrás con la **franja del viaje** (los días coloreados por ciudad, lo pasado atenuado y una marca en hoy; toca → Itinerario), ciudad actual y siguiente, próximo plan en una tarjeta compacta («Cómo llegar», comer cerca y «hecha» en una fila), resumen del día, gasto y presupuesto restante, próximos planes, alertas (checklist pendiente, **check-out** del hotel esa mañana o la noche antes, que abre la lista **«Antes de salir del hotel»**: cargadores, adaptador, pasaporte, caja fuerte, Suica…, marcada por estancia, tren de mañana, reserva en menos de 3 h, falta tipo de cambio, copia de seguridad) y accesos rápidos. **Tu viaje** (cuadrícula de 3 × 3): ciudades, reservas, transporte, notas, checklist, documentos, info útil, frases y regalos, cada uno con su color (el mismo en toda la app, también en un iconito junto al título al entrar) para distinguirlos de un vistazo. Arriba a la derecha: **Emergencia** (cruz roja), Buscar y Ajustes. La barra tiene 4 pestañas: Inicio · Itinerario · Sitios · Gastos (Planificar está en el Itinerario; Importar, en Sitios y en el botón +). |
| **¿Listo para el viaje?** ✅ | En el último mes antes de salir, Inicio lo avisa (también en *Ajustes → Esta instalación*). Repasa, en el propio móvil: copia sin conexión (y si es la última versión), datos protegidos contra el borrado, voz japonesa (con botón «Probar»), copia de seguridad, ficha de emergencia, hoteles con dirección en japonés y hora de check-out, tipo de cambio guardado, checklist «Antes del viaje» y si la usas instalada. Cada punto pendiente lleva un botón para resolverlo. |
| **Diario** 📔 | Cada noche (desde las 18:00), Inicio y el Modo viaje preguntan «¿Qué tal hoy?»: cómo fue (😍🙂😐😴😣) y lo que no quieres olvidar, con los planes hechos y lo gastado. También desde la vista de cada día. *Diario del viaje* los reúne todos y se puede compartir como texto. Va en la exportación JSON. |
| **Mis alergias** 🥜 | Desde cada restaurante y desde el Modo viaje: tus alergias de la ficha de emergencia en japonés, con «¿Este plato lleva…?», «¿Tienen algún plato sin…?» y «No puedo comer ni un poco», con 🔊 y a pantalla completa. |
| **Pantalla completa** ⛶ | Para enseñar una frase, la tarjeta del taxista o tus alergias: la letra se ajusta al máximo que cabe y, en Android, pasa a pantalla completa en horizontal. Con una frase abierta, basta girar el móvil. |
| **Emergencia** 🆘 | Alergias (con su nombre en japonés, a pantalla completa y con las frases para el restaurante), enfermedades, medicación, grupo sanguíneo, seguro, contacto y embajada, con las etiquetas en japonés y en grande, botones para llamar al 119 / 110 / Japan Visitor Hotline y frases para pedir ayuda. Se guarda sin cifrar para verla sin PIN: no pongas pasaporte ni tarjetas. |
| **Para el taxista** 🚕 | En cada reserva (y en el Modo viaje, «Esta noche duermes en…»): «A esta dirección, por favor» con el nombre y la dirección del hotel en japonés, en grande. El japonés lo pegas tú en la reserva (de la confirmación o de Google Maps en japonés). Botón 🔊 para que el móvil lo diga en voz alta. |
| **Modo viaje** | Se activa solo durante el viaje. Muestra la actividad actual y la siguiente, cuánto falta y cuánto se tarda en llegar, restaurantes guardados cerca de tu última parada (o del hotel), **«Para comunicarte»** (tus frases ♥ a un toque, con 🔊, y el botón **Mis alergias**), un **conversor rápido** ¥ ⇄ € (con el tipo y el redondeo de Ajustes, sin conexión), gasto de hoy, reservas de hoy, el resto del día y las notas de la ciudad. Para probarlo antes: *Ajustes → Simular un día con plan a las 11:45*. |
| **Todo en el itinerario** 🔗 | Cada reserva y cada trayecto con fecha dentro del viaje sale solo en el itinerario de su día, en Inicio y en el Modo viaje. Si cambias la reserva, cambia su actividad; si mueves la actividad de día u hora, se mueve la reserva. Si ya tenías planificada esa actividad (mismo día, hora y sitio), se enlaza en vez de duplicarse. Y al revés: si pones un «Nº de reserva» en una actividad, aparece en *Inicio → Tu viaje → Reservas*. Para que una reserva no salga en el día: desmarca «Mostrar en el itinerario del día». |
| **Itinerario** | Días agrupados por ciudad, con el color de cada ciudad, el nombre de la ciudad fijo arriba al bajar, y en cada día sus traslados (🚄 Tokio → Takayama), el check-in (🏨 Check-in 15:00 · hotel) el día que llegas, el check-out (🧳) y dónde dormís. Durante el viaje los días pasados se pliegan y hay un botón «Ir a hoy». Cada actividad guarda: título, descripción, día, inicio/fin, ubicación (enlazada a un lugar o restaurante, o libre), categoría, notas, coste, reserva, URL, prioridad, estado y transporte. Se puede crear, editar, eliminar, duplicar, marcar como hecha, mover de día y reordenar (pulsación larga → subir/bajar, u «Ordenar por hora»). |
| **Vista del día** | Timeline vertical (los vuelos y trenes, como billete; los tramos de más de 50 km no se calculan porque entre medias hay un tren o un vuelo) con el «ahora» marcado y la distancia, tiempo y medio entre actividades; tocarlo abre la ruta real en Google Maps. También muestra reservas del día, restaurantes guardados cerca, notas, gasto y la opción de compartir. |
| **Planificar día** ✨ | Eliges de 2 a 8 sitios y la app propone el orden: minimiza desplazamientos y esperas, respeta los horarios, deja huecos para comer con un restaurante guardado cerca y lo añade al itinerario. |
| **Sitios** 📍 | Una pestaña con tres listas: *Visitar* (lugares), *Comer* (restaurantes) y *Probar* (comidas típicas para ir tachando; las dos primeras agrupadas por ciudad en el orden del viaje, con su color, sus fechas y cuántos hay; el nombre de la ciudad se queda fijo arriba al bajar). **Probar**: 26 comidas de serie (ramen, takoyaki, wagyu de Hida, helado con pan de oro…) más las que añadas; al tacharla se guarda la fecha y la ciudad, y durante el viaje sale arriba «Típico de Osaka». Categorías, horario con «abierto ahora» (en hora de Japón), precio, URL, notas, prioridad, visitado / quiero ir / probado, valoración y favoritos. |
| **Restaurantes cerca** 🍜 | Primero tus guardados (sin conexión); después «Descubrir», con datos reales de OpenStreetMap (gratis y sin clave). Muestra distancia, tipo, precio, valoración, horario, si está abierto, dirección, «Ir» y «Guardar». |
| **Gastos** | JPY/EUR/USD con tipo de cambio del BCE (el yen se redondea al alza por defecto: 177,32 → 178; configurable en Ajustes), total, hoy, media diaria y presupuesto, una barra de colores con el reparto por categoría (también en Inicio, con las 3 mayores), y gráficos por categoría (cada una con su color y su %), ciudad y día. Cada gasto indica con qué se pagó (efectivo, tarjeta, Suica…); el total es uno solo. Desliza para duplicar o borrar. Exporta a CSV. |
| **Reparto** | Quién pagó y entre quién se divide; balances y transferencias mínimas para quedar en paz. |
| **Ciudades** | Las fechas salen de los días asignados (Tokyo puede aparecer dos veces). Incluye noches, alojamiento, lugares, restaurantes, notas y presupuesto frente a gasto. |
| **Reservas / Transporte** | Código que se copia con un toque, teléfono, ubicación, horas, duración automática (trenes), asiento, coste y hora de check-out (hoteles). Vuelos, trenes y autobuses se ven **como un billete**: hora y lugar de salida y llegada en grande, duración, y abajo asiento, código y precio. Si tiene coste, **«Apuntar en Gastos»** crea el gasto ya relleno (importe, moneda, categoría y fecha) y queda enlazado, para no escribirlo dos veces. Los trayectos admiten escalas o transbordos con llegada, salida y siguiente vuelo; la app calcula la espera en cada una. Botón **«Añadir a Google Calendar»** con el evento ya relleno (hora de Japón; los trayectos anteriores al viaje, hora de España). |
| **Regalos** 🎁 | Para quién, qué idea, **notas** (talla, color, tienda… a la vista en la lista), precio y dónde comprarlo, agrupado por persona con su inicial y «1 de 2». Resumen de comprados, gastado y lo que falta; filtro Todos / Por comprar / Comprados; durante el viaje, aviso «En Kioto: 2 regalos por comprar» (también en el Modo viaje). Al marcar uno como comprado ofrece **apuntarlo en Gastos** ya relleno (categoría Regalos) y queda enlazado. |
| **Notas / Checklist** | Notas generales, o de una ciudad, un día, un lugar o un restaurante, que se pueden fijar. Checklists de antes del viaje, maleta, durante el viaje y personalizadas. |
| **Documentos** | Los datos **sensibles** se cifran con un PIN (AES-GCM, Web Crypto) y no se exportan. |
| **Info / Frases** | Fichas editables (enchufes, emergencias, propinas, tax free…), conversor JPY→EUR y 149 frases offline con romaji (básicas, **no hablo japonés** —«Perdón, no hablo japonés. ¿Podemos hablar en inglés?», traductor, mapa…—, **cortesía y disculpas**, conversación, transporte, hotel, restaurante, compras, templos y onsen, emergencias, números y carteles), cada categoría con su color, favoritas, vista en grande para enseñarla y **🔊 Escuchar** (normal o despacio) con la voz japonesa del móvil: sin conexión solo funciona si esa voz está descargada (Ajustes del móvil → texto a voz → Japonés). |
| **Buscar / Importar / Compartir** | Búsqueda global sin tildes ni macrones. **Desde Google Maps: Compartir → Japón Travel** (con la app instalada) y el sitio llega a Importar; como el enlace corto no se puede leer, la app busca su ubicación por nombre y dirección. También importa enlaces largos de Google Maps (lee las coordenadas), webs, texto libre o confirmaciones de reserva. Comparte un día, una reserva, un lugar o el resumen de gastos. |
| **Ajustes** | Apartados plegables (se abren al tocarlos y recuerdan cuál dejaste abierto): nombre y fechas del viaje, moneda, presupuesto, viajeros, tema claro/oscuro, **tamaño de letra** (Normal, Grande o Muy grande: agranda toda la app), km o millas, Modo viaje y simulación, **cambio de moneda** (sólo el redondeo del yen y actualizar el tipo del BCE), exportar/importar, viaje nuevo, quitar el ejemplo y borrar todo. En *Esta instalación*: versión y fecha, lo que ocupa, el espacio que queda (5 MB compartidos con las demás apps de `alexlobar.github.io`) y si el navegador protege los datos contra el borrado. |
| **Copias de seguridad** | La app pide al navegador que no borre sus datos y, si llevas 7 días sin exportar, Inicio te avisa con un botón para hacerlo. **En el móvil**, «Exportar» abre el menú Compartir para guardarla en Drive: va como `.txt` (Chrome en Android no deja compartir `.json`), solo el archivo, sin texto. **En el ordenador** se descarga como `.json`. Importar acepta los dos. Si cierras el menú no pasa nada; si compartir falla por otro motivo, se descarga. |

**Datos de ejemplo:** «Japón 2026», del 19 de noviembre al 16 de diciembre (28 días), recorre Tokyo → Kyoto → Nara → Osaka → Tokyo. Tiene 15 días con plan y el resto libres. Si los borras sin querer: *Ajustes → Cargar viaje de ejemplo*.
- Los 32 lugares son reales, con coordenadas aproximadas.
- Restaurantes, hoteles, códigos `EJ-` y gastos son **ficticios**.

Se quitan en *Ajustes → Quitar datos de ejemplo*, que conserva lo que hayas creado tú.

## Servicios externos

Ninguno es obligatorio y **no hay ninguna clave en el código**.

| Servicio | Para qué | Clave |
|---|---|---|
| OpenStreetMap (Overpass) | Restaurantes cercanos (por defecto) | No |
| Google Places API (New) | Ya no se configura (desde la v1.6.0 Ajustes no tiene apartado de APIs): los restaurantes cercanos salen de OpenStreetMap. | — |
| Frankfurter (BCE) | Tipos de cambio. El último se guarda para usarlo offline; también puedes fijar un tipo manual. | No |
| Nominatim (OSM) | Buscar coordenadas por nombre | No |
| Google Maps (enlace) | «Cómo llegar» con rutas reales. La app no tiene mapa propio ni usa el GPS: para moverte, Google Maps. | No |

**Necesita conexión:**
- descubrir restaurantes;
- actualizar el tipo de cambio;
- buscar coordenadas.

**Funciona sin conexión:** todo lo demás, incluido el planificador.

## Limitaciones

- **Avisos:** la app no envía notificaciones (se quitaron en la v1.6.0). Los avisos útiles —tren de mañana, reserva en menos de 3 h, check-out, regalos por comprar— salen en Inicio y en el Modo viaje.
- **Tiempos de desplazamiento:** son estimaciones (línea recta × 1,3 y velocidades medias). El tiempo real lo da «Cómo llegar».
- **«Abierto ahora»:** solo funciona con horarios en formato tipo `Mo-Su 09:00-17:00; Tu off`. Los festivos no se modelan.
- **OpenStreetMap:** no tiene valoraciones ni precios.
- **Enlaces cortos** (`maps.app.goo.gl`): no se pueden leer desde el navegador. Ábrelos y copia la dirección larga.
- **Almacenamiento:** `localStorage` tiene un límite de unos 5 MB, de sobra para un viaje. Si borras los datos del navegador se pierde todo, así que exporta copias de vez en cuando.
- **Reordenar:** se hace con el menú (subir/bajar), no arrastrando.
