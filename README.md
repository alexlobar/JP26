# Japón Travel 🇯🇵

Planificador personal para un viaje a Japón: itinerario, Modo Viaje, restaurantes cerca, mapa, gastos, reservas, notas, checklist, frases y más.

- HTML, CSS y JavaScript vanilla, **sin dependencias, sin build y sin servidor**.
- Los datos viven en el `localStorage` del navegador.
- Funciona **sin conexión** y se instala en el móvil como una app.

## Archivos

```
index.html          Esqueleto: contenedor, botón (+) y barra de pestañas
manifest.json       Metadatos PWA (nombre, icono, colores)
sw.js               Service worker: caché offline de la app y del mapa ya visto
icon.svg            Icono
css/styles.css      Estilos (claro/oscuro), en 13 secciones comentadas
js/utils.js         Fechas en hora de Japón, dinero, distancias, horarios, iconos
js/data.js          Categorías, frases, información útil y viaje de ejemplo
js/store.js         localStorage, CRUD con cascadas, selectores, exportar/importar
js/logic.js         Planificador del día, reparto de gastos, búsqueda, importar texto, recordatorios
js/services.js      Red y APIs del navegador: OpenStreetMap, Google Places, BCE, geocodificación,
                    ubicación, cofre cifrado, avisos, compartir, ficheros, mapa
js/ui.js            Componentes: tarjetas, chips, campos, hojas inferiores, menús, toasts
js/views-common.js  Navegación y tarjetas compartidas (timeline, lugares, gastos…)
js/views-trip.js    Inicio, Modo viaje, itinerario, día, actividad, planificador
js/views-places.js  Lugares, restaurantes, restaurantes cerca, mapa, ciudades
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
- `VERSION` en `js/utils.js`;
- `CACHE` en `sw.js`;
- `data-build` en `index.html`.

Si no lo haces, el móvil seguirá usando la copia antigua de la caché. *Ajustes → Esta instalación* avisa si la caché no coincide con la versión.

---

## Qué hace

| Sección | Funciones |
|---|---|
| **Inicio** | Cuenta atrás, ciudad actual y siguiente, próxima actividad con «Cómo llegar», resumen del día, gasto y presupuesto restante, próximos planes, alertas (checklist pendiente, tren de mañana, reserva en menos de 3 h, falta tipo de cambio) y accesos rápidos. |
| **Modo viaje** | Se activa solo durante el viaje. Muestra la actividad actual y la siguiente, cuánto falta y cuánto se tarda en llegar, restaurantes guardados cerca (por GPS o por tu última parada), gasto de hoy, reservas de hoy, el resto del día y las notas de la ciudad. Para probarlo antes: *Ajustes → Simular un día con plan a las 11:45*. |
| **Itinerario** | Días agrupados por ciudad. Cada actividad guarda: título, descripción, día, inicio/fin, ubicación (enlazada a un lugar o restaurante, o libre), categoría, notas, coste, reserva, URL, prioridad, estado y transporte. Se puede crear, editar, eliminar, duplicar, marcar como hecha, mover de día y reordenar (pulsación larga → subir/bajar, u «Ordenar por hora»). |
| **Vista del día** | Timeline vertical con el «ahora» marcado y la distancia, tiempo y medio entre actividades; tocarlo abre la ruta real en Google Maps. También muestra reservas del día, restaurantes guardados cerca, notas, gasto y la opción de compartir. |
| **Planificar día** ✨ | Eliges de 2 a 8 sitios y la app propone el orden: minimiza desplazamientos y esperas, respeta los horarios, deja huecos para comer con un restaurante guardado cerca y lo añade al itinerario. |
| **Lugares / Restaurantes** | Categorías, horario con «abierto ahora» (en hora de Japón), precio, URL, notas, prioridad, visitado / quiero ir / probado, valoración y favoritos. |
| **Restaurantes cerca** 🍜 | Primero tus guardados (sin conexión); después «Descubrir», con datos reales de OpenStreetMap o de Google Places. Muestra distancia, tipo, precio, valoración, horario, si está abierto, dirección, «Ir» y «Guardar». |
| **Mapa** | Mapa real (Leaflet + OpenStreetMap) con itinerario, lugares, restaurantes, hoteles y favoritos, filtro por día con la ruta numerada, y «Ver detalles» / «Cómo llegar». Sin conexión pasa a un plano esquemático. |
| **Gastos** | JPY/EUR/USD con tipo de cambio del BCE, total, hoy, media diaria y presupuesto, y gráficos por categoría, ciudad y día. Desliza para duplicar o borrar. Exporta a CSV. |
| **Reparto** | Quién pagó y entre quién se divide; balances y transferencias mínimas para quedar en paz. |
| **Ciudades** | Las fechas salen de los días asignados (Tokyo puede aparecer dos veces). Incluye noches, alojamiento, lugares, restaurantes, notas y presupuesto frente a gasto. |
| **Reservas / Transporte** | Código que se copia con un toque, teléfono, ubicación, horas, duración automática, asiento y coste. |
| **Notas / Checklist** | Notas generales, o de una ciudad, un día, un lugar o un restaurante, que se pueden fijar. Checklists de antes del viaje, maleta, durante el viaje y personalizadas. |
| **Documentos** | Los datos **sensibles** se cifran con un PIN (AES-GCM, Web Crypto) y no se exportan. |
| **Info / Frases** | Fichas editables (enchufes, emergencias, propinas, tax free…), conversor JPY→EUR y 43 frases offline con romaji, favoritas y vista en grande para enseñarla. |
| **Buscar / Importar / Compartir** | Búsqueda global sin tildes ni macrones. Importa enlaces de Google Maps (lee las coordenadas), webs, texto libre o confirmaciones de reserva. Comparte un día, una reserva, un lugar o el resumen de gastos. |
| **Ajustes** | Nombre y fechas del viaje, moneda, presupuesto, viajeros, tema claro/oscuro, km o millas, Modo viaje y simulación, recordatorios, APIs, exportar/importar, viaje nuevo, quitar el ejemplo y borrar todo. |

**Datos de ejemplo:** «Japón 2026», del 19 de noviembre al 16 de diciembre (28 días), recorre Tokyo → Kyoto → Nara → Osaka → Tokyo. Tiene 15 días con plan y el resto libres. Si los borras sin querer: *Ajustes → Cargar viaje de ejemplo*.
- Los 32 lugares son reales, con coordenadas aproximadas.
- Restaurantes, hoteles, códigos `EJ-` y gastos son **ficticios**.

Se quitan en *Ajustes → Quitar datos de ejemplo*, que conserva lo que hayas creado tú.

## Servicios externos

Ninguno es obligatorio y **no hay ninguna clave en el código**.

| Servicio | Para qué | Clave |
|---|---|---|
| OpenStreetMap (Overpass) | Restaurantes cercanos (por defecto) | No |
| Google Places API (New) | Restaurantes cercanos con valoraciones y «abierto ahora» | Opcional. Se introduce en *Ajustes → APIs* y se guarda solo en tu navegador. Restríngela en Google Cloud al referer `https://TU-USUARIO.github.io/*`. |
| Frankfurter (BCE) | Tipos de cambio. El último se guarda para usarlo offline; también puedes fijar un tipo manual. | No |
| Nominatim (OSM) | Buscar coordenadas por nombre | No |
| Leaflet + teselas OSM | Mapa real. Se carga solo al abrir el mapa; las zonas vistas quedan en caché. | No |
| Google Maps (enlace) | «Cómo llegar» con rutas reales | No |

**Necesita conexión:**
- descubrir restaurantes;
- actualizar el tipo de cambio;
- buscar coordenadas;
- el mapa base en zonas no vistas.

**Funciona sin conexión:** todo lo demás, incluido el planificador.

## Limitaciones

- **Avisos:** una web no puede enviar notificaciones con la app cerrada (eso requiere un servidor de push). Los recordatorios salen mientras la app está abierta o en segundo plano reciente.
- **Tiempos de desplazamiento:** son estimaciones (línea recta × 1,3 y velocidades medias). El tiempo real lo da «Cómo llegar».
- **«Abierto ahora»:** solo funciona con horarios en formato tipo `Mo-Su 09:00-17:00; Tu off`. Los festivos no se modelan.
- **OpenStreetMap:** no tiene valoraciones ni precios.
- **Enlaces cortos** (`maps.app.goo.gl`): no se pueden leer desde el navegador. Ábrelos y copia la dirección larga.
- **Almacenamiento:** `localStorage` tiene un límite de unos 5 MB, de sobra para un viaje. Si borras los datos del navegador se pierde todo, así que exporta copias de vez en cuando.
- **Reordenar:** se hace con el menú (subir/bajar), no arrastrando.
