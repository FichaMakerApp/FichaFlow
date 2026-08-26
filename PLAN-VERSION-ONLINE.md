# Plan: FichaFlow en línea, con cuentas y optimizado para celular

Este documento es una guía de arquitectura, no código. Está pensado para
que cualquier sesión futura (con memoria nueva, sin este contexto) pueda
retomarlo y ejecutarlo paso a paso.

## Punto de partida (lo que hay hoy)

FichaFlow es una app 100% del lado del cliente: HTML/CSS/JS sin build,
sin framework, sin backend. Todo el documento (fichas, imágenes en
base64, mapas) vive en el `localStorage` del navegador. No hay usuarios,
no hay sincronización entre dispositivos, no hay servidor.

Eso es justo lo que hay que cambiar para cumplir los tres pedidos:
100% en línea, cuentas independientes, y una interfaz que funcione bien
tanto en escritorio como en celular.

## Decisión clave: no reescribir todo desde cero

La lógica de **renderizado** (`js/render-ficha.js`, que dibuja la ficha
igual en la vista previa y en el PDF) es pura — recibe datos, entrega
DOM. Eso se conserva sin tocar. Lo que cambia es **de dónde vienen y a
dónde van los datos**: hoy es `localStorage`, tiene que pasar a ser un
backend con cuentas.

## Arquitectura recomendada

**Backend-as-a-Service en vez de servidor propio.** Construir y mantener
un backend a mano (servidor + base de datos + autenticación + sesiones)
es mucho trabajo para lo que se necesita aquí. Conviene usar un servicio
que ya resuelva cuentas de usuario, base de datos y almacenamiento de
archivos, y que se hable directo desde el navegador con su SDK de
JavaScript — sin tener que programar ni alojar un servidor propio.

- **Supabase** (recomendado): Postgres real + autenticación (correo y
  contraseña, enlaces mágicos) + almacenamiento de archivos, todo con un
  plan gratuito generoso. Se integra con un `<script>` como
  html2canvas/jsPDF ya se usan hoy, o con un paquete si se decide agregar
  un paso de build más adelante.
- Alternativa equivalente: **Firebase** (Firestore + Auth + Storage). La
  misma idea, otro proveedor.

**Hosting del frontend**: sigue siendo un sitio estático (los mismos
`index.html`/`css`/`js`, casi sin cambios de estructura), alojado en algo
como Vercel, Netlify o Cloudflare Pages — se conecta a Supabase/Firebase
desde el navegador, no hace falta un servidor intermedio.

## Modelo de datos con cuentas

Hoy `Store` guarda **un** documento en `localStorage`. Con cuentas, cada
usuario necesita **una lista de documentos propios** (ya que cada
documento es un cliente/proyecto distinto). Cambios necesarios:

- Tabla `documents` en la base de datos: `id`, `user_id`, `nombre`,
  `data` (el mismo JSON que hoy se guarda entero — el modelo de datos
  interno de `store.js` casi no cambia), `updated_at`.
- Regla de seguridad a nivel de fila (Supabase la llama *Row Level
  Security*): un usuario solo puede leer/escribir sus propias filas. Esto
  es lo que separa a un usuario de otro — no hace falta programarlo a
  mano, se configura como política en la base de datos.
- Pantalla nueva: "Mis documentos" (lista de proyectos guardados del
  usuario, con crear/abrir/eliminar) — reemplaza al único documento
  implícito de hoy.

## Imágenes: dejar de guardarlas como base64

Hoy cada imagen (plano, foto principal, galería, mapa) se guarda como
texto base64 **dentro** del JSON del documento — funciona en local, pero
en una base de datos real hace las filas enormes y las cargas lentas.
Cambio necesario: al subir una imagen, mandarla a almacenamiento de
archivos (Supabase Storage / Firebase Storage) y guardar en el documento
solo la **URL** resultante, no el archivo entero. `render-ficha.js` no
necesita cambios para esto — ya recibe una URL de imagen (hoy es un data
URI, después sería una URL http), el `<img src>` funciona igual.

Nota aparte: `html2canvas` (usado para exportar el PDF) necesita que las
imágenes remotas permitan CORS para poder leerlas — el proveedor de
storage tiene que configurarse para servirlas con los encabezados
correctos, o descargarlas primero a un blob local antes de capturar.

## Autenticación: qué construir

- Pantalla de registro/login (correo + contraseña, o enlace mágico —
  más simple de mantener porque no hay contraseñas que recuperar).
- Persistencia de sesión: el SDK del proveedor ya maneja el token en el
  navegador; no hay que implementar esto a mano.
- Cerrar sesión, y una ruta protegida: si no hay sesión, mostrar el login
  en vez del editor.

## Cambios en `store.js`

Es el único archivo que cambia de fondo. Hoy:
`loadDocument()`/`persistDocument()` leen/escriben `localStorage`
directo y de forma síncrona. Con backend, estas funciones pasan a ser
**asíncronas** (llaman a la API del proveedor y esperan respuesta), lo
que implica ajustar quién las llama:

- Cargar: al iniciar sesión, pedir la lista de documentos del usuario;
  al abrir uno, traerlo y llenar `state.document`.
- Guardar: en vez de escribir en `localStorage` en cada cambio, mandar
  el documento al backend — conviene no mandar una petición por cada
  tecleo (usar un *debounce*, por ejemplo guardar 1-2 segundos después
  del último cambio) para no saturar la red ni gastar cuota del plan
  gratuito.
- Mantener una copia en `localStorage` como caché/borrador local es
  buena idea de todos modos: dar sensación de guardado instantáneo
  (como ya existe hoy con el indicador "Guardado hace X s") mientras la
  sincronización real ocurre de fondo, y tener algo que mostrar si se
  pierde la conexión un momento.

## Interfaz para celular

Ya hay una base responsiva de esta sesión (el layout se reacomoda bajo
cierto ancho de pantalla). Para que se sienta como una app pensada para
touch, no solo "que quepa":

- **Arrastrar para reordenar** (fichas, modelos) no funciona con el
  drag-and-drop nativo de HTML5 en touch — hace falta una alternativa
  para celular: botones de mover arriba/abajo, o una librería de
  arrastre táctil.
- Controles más grandes donde se toca con el dedo (botones, campos,
  sliders) — los que ya existen en desktop pueden quedar chicos en touch.
- El panel dividido formulario + vista previa (`split2`) ya se apila en
  una sola columna en pantallas angostas; falta revisar que cada sección
  larga (galería, modelos) no obligue a demasiado scroll para llegar al
  siguiente campo.
- Subir fotos desde el celular: probar que el input de archivo abra la
  cámara/galería del teléfono correctamente (suele funcionar solo, pero
  hay que probarlo en un dispositivo real, no solo en el emulador del
  navegador).
- Opcional pero recomendable: agregar un manifest de **PWA** (ícono,
  nombre, "agregar a pantalla de inicio") para que se sienta instalable
  como app, sin publicarla en las tiendas de Apple/Google.

## Orden sugerido para ejecutarlo

1. Crear cuenta en Supabase (o Firebase), definir la tabla `documents` y
   las políticas de seguridad por usuario.
2. Agregar pantallas de registro/login y la lista "Mis documentos".
3. Cambiar `store.js` para leer/escribir contra el backend en vez de
   `localStorage` (dejando `localStorage` como caché local, no como
   fuente de verdad).
4. Migrar la subida de imágenes de base64 a archivos con URL.
5. Publicar el frontend en un hosting estático, conectado al backend.
6. Recién ahí, pulir la interfaz para celular (drag-and-drop táctil,
   tamaños de controles, PWA) — tiene más sentido hacerlo sobre la
   versión ya conectada, para no duplicar trabajo si algo del flujo
   cambia en el camino.

## Lo que NO cambia

El diseño visual de la ficha, `render-ficha.js`, la exportación a PDF
(`pdf-export.js` con html2canvas/jsPDF), y casi todo el modelo de datos
interno de cada documento (`defaultFicha`, `defaultModelo`, etc.) se
mantienen tal cual — el trabajo está concentrado en cómo se cargan,
guardan y protegen esos datos, y en cómo se ven los controles en una
pantalla chica.
