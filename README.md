# FichaFlow

App para armar fichas de venta inmobiliaria (cliente, desarrollo, modelos,
precios, pagos, mapa) y exportarlas a PDF, con la identidad visual de tu
plantilla real (logo, foto de encabezado, colores).

## Cómo abrirla

No necesita instalación. Dos formas de usarla:

1. **Doble clic en `index.html`.** Se abre en tu navegador y funciona
   completo (esto es lo normal para el día a día).
2. Si tu navegador bloquea algo al abrirlo como archivo, corre
   `serve.ps1` (clic derecho → *Ejecutar con PowerShell*, o
   `powershell -ExecutionPolicy Bypass -File serve.ps1`) y abre
   `http://localhost:8934/`.

No requiere Node, Python ni ninguna instalación. En celular funciona igual
(la interfaz se acomoda a la pantalla sin necesidad de hacer zoom).

### Desde el iPhone (u otro celular)

La app también está publicada en:

**https://fichamakerapp.github.io/FichaFlow/**

Ábrela en Safari y agrégala a pantalla de inicio (compartir → "Agregar a
pantalla de inicio") para que se sienta como una app aparte. Cada
documento que hagas ahí se guarda en el propio celular (en el
almacenamiento del navegador), separado de lo que tengas en la
computadora — no se sincronizan solos entre dispositivos.

Cada vez que se hagan cambios al código, hay que subirlos a este mismo
repositorio de GitHub (`git push`) para que se reflejen en esa
dirección; abrir `index.html` directo en la computadora sigue
funcionando igual que siempre y no depende de esto.

### Abrirla como si fuera un programa aparte (no una pestaña de navegador)

Corre **`Crear acceso directo.bat`** (doble clic) una sola vez — crea un
ícono "FichaFlow" en tu escritorio con el logo de la app. Al abrirlo, la
app se ve en su propia ventana, sin pestañas ni barra de direcciones,
como cualquier otro programa instalado (usa Chrome o Edge en "modo app"
— el navegador que tengas instalado — así que no agrega nada nuevo ni
pesa más). Esto también evita el problema de que `.html` a veces queda
asociado a Adobe Reader en vez de a un navegador en Windows: en lugar de
cambiar esa asociación para *todos* tus archivos `.html`, este ícono
abre específicamente FichaFlow como corresponde. Puedes volver a correr
el script cuando quieras, por ejemplo si mueves la carpeta a otro lugar.

**Si compartes la carpeta con alguien más**: el acceso directo que se
crea aquí no sirve en otra computadora (tiene tu ruta de Windows grabada
adentro). Por eso `Crear acceso directo.bat` va incluido en la carpeta
— la otra persona corre ese mismo archivo una vez, desde su propia
computadora, y le arma el suyo con sus propias rutas.

## Qué guarda y dónde

Todo vive en el `localStorage` del navegador (documento actual + biblioteca
de páginas guardadas). Es información **local a ese navegador y ese
archivo/origen** — no se sincroniza entre computadoras ni se sube a
ningún servidor (ver "Pendiente: versión en línea" más abajo).

**Por eso, en el paso "Revisión y descarga" usa "Exportar respaldo
(JSON)" cada vez que termines una sesión de trabajo importante.** Ese
archivo es tu respaldo real: si algo pasa con el navegador o quieres pasar
tu trabajo a otra computadora, lo recuperas con "Importar respaldo".

Las imágenes se guardan incrustadas dentro de esos datos. Si subes muchas
imágenes pesadas, el navegador puede quedarse sin espacio de `localStorage`
(suele rondar 5-10 MB) — si ves que algo no se guarda, es la señal.

## Identidad visual

Los colores, el logo y la foto del encabezado se sacaron directamente de tu
`PLANTILLA VACÍA.pdf` — negro casi puro para el encabezado y el texto, un
acento camel/tostado que tu plantilla usa *solo como relleno* (nunca como
color de texto), y el beige cálido de fondo. Tipografía: igual que ya
estaba.

Nota pendiente: vi un archivo `logo_casacruz-04 (1).png` en tu carpeta de
Descargas que parece tu logo real en mejor calidad que el que extraje del
PDF. No lo usé sin confirmar — dime si es tu logo y lo integro.

## La app, en dos pasos

1. **Cliente, fichas y mapa** — todo junto en una sola pantalla: nombre del
   cliente y tipo de cambio arriba, y debajo las fichas/modelos/mapa.
2. **Revisión y descarga** — cada página con una miniatura, reordenar,
   exportar PDF o respaldo JSON.

**Modo diseñador** es una ventana aparte (botón "🎨 Modo diseñador" en el
panel izquierdo), protegida con una contraseña simple para que no se
active sin querer — no es seguridad real, es solo un candado de uso
personal. Contraseña: `diseno2024` (para cambiarla, edita
`DESIGNER_PASSWORD` en `js/store.js`). Ahí controlas, con tamaño ± /
negrita / cursiva / tachado:
- **Documento completo**: color de fondo, imagen de fondo (opcional, ver
  abajo), escala de texto global, y el texto del encabezado ("Análisis de
  propiedades" / "Para: cliente").
- **Por ficha**: el renglón de ciudad/tipo/entrega, el título del
  desarrollo, la franja destacada y cada botón.
- **Modelos de la ficha**: nombre del modelo, íconos+texto de
  habitaciones/baños/m², precio principal y precio secundario — **se
  aplica a todos los modelos de esa ficha a la vez**, igual que el tamaño
  de panel (ya no es por modelo individual).

**Imagen de fondo del documento**: en la sección "Documento completo" del
modo diseñador puedes subir una imagen en vez de (o además de) el color
sólido. **Resolución recomendada: al menos 1650 px de ancho.** La ficha
se dibuja a 816 px y se captura al doble para el PDF, así que 1650 px de
ancho asegura nitidez. La altura de cada página cambia según cuántos
modelos tenga esa ficha, así que para una foto con un punto focal
importante el recorte puede variar de una página a otra — para eso, una
imagen alta (2400 px o más) o una textura discreta se comporta mejor que
una foto con algo específico que no se pueda perder.

## Cómo se arma cada ficha

- **Título del desarrollo arriba de la imagen principal**, centrado y más
  grande.
- **Encabezado con logo y foto solo en la primera página.** Las demás
  fichas y el mapa van "simples".
- **Imágenes secundarias justo debajo de la principal**, recortadas a su
  misma proporción — doble clic en una de ellas para ajustar qué parte se
  ve (sin cambiar el tamaño del recuadro).
- **Aviso legal siempre presente** (ya no es opcional; trae un texto por
  defecto que puedes editar).
- **Botones centrados debajo de las imágenes**, más grandes, con color
  individual y un pequeño ícono de cursor junto al texto.
- **Hasta 10 modelos por ficha**, siempre apilados uno debajo del otro
  (plano, especificaciones, precio, tabla de pago propia) — nunca lado a
  lado. El plano queda centrado con la altura de las especificaciones, y
  ambos centrados en el ancho de la ficha.
- **Tamaño de cada panel ajustable** (plano / información / tabla de
  pago), de 60% a 160%. Se aplica a todos los modelos de esa ficha a la
  vez, no modelo por modelo.
- **Esquema de pago**: el concepto ("30% ENGANCHE") en letra grande, y el
  momento ("AL FIRMAR") debajo, en letra normal sin negritas.
- **Entrega inmediata**: el texto queda centrado, con fondo beige de la
  misma paleta.
- **Franja destacada**: colores invertidos — fondo negro, texto beige.
- **Plano**: la imagen se sube tal cual, sin editarla — antes se
  intentaba recortar el fondo automáticamente, pero en planos con
  colores o zonas claras adentro (no solo trazo sobre blanco) terminaba
  borrando o cambiando el contraste de partes que no eran fondo. Se
  quitó esa función. También puedes pegar una imagen copiada con Ctrl+V,
  sin pasar por "elegir archivo".
- **Mapa**: cada pin es solo el nombre de texto (sin ícono de pin) y se
  puede arrastrar para corregir su posición. Color de fondo, color de
  texto y tamaño del cuadro son ajustables por pin.
- **Botones de acceso rápido** al final de cada ficha para agregar otra
  ficha o ir al mapa, sin tener que subir hasta las pestañas.

## Un bug real que encontré y corregí de paso

Al probar la exportación con el mapa, las páginas más anchas que altas
(como el mapa) salían recortadas por la derecha en el PDF. La causa: la
librería del PDF (`jsPDF`) asume automáticamente que toda página es más
alta que ancha, y si no se le dice lo contrario, invierte ancho/alto en
silencio. Ya se le indica explícitamente la orientación de cada página, y
quedó verificado con el `MediaBox` del PDF resultante.

## Pendiente: versión en línea con cuentas de usuario

Pediste que la app sea 100% en línea, accesible desde cualquier
dispositivo, con cuentas de correo y contraseña. **Eso no está hecho** —
es una pieza aparte y más grande, porque cambia la naturaleza de la app:

- Necesita un servidor/base de datos real (hoy todo vive en el navegador
  de tu propia computadora).
- Necesita un proveedor de hosting y, casi seguro, retomar el proyecto
  como una app con backend — en esta máquina no hay Node instalado, así
  que no pude ni prototipar esa parte aquí.
- Implica decisiones tuyas: qué proveedor, si tiene costo, y qué tan
  urgente es frente al resto.

Cuando quieras avanzar con eso, es plática aparte sobre dónde alojarla.

## Simplificaciones que siguen en pie

- **Imagen principal en cuadrícula fija**, no arrastrable/redimensionable
  (la galería sí tiene ajuste de encuadre con doble clic).
- **Mapa: captura manual, no API.** Subes tu propia captura y marcas los
  pines a mano.
- **Sin cuentas ni contraseña real** (ver arriba). El "modo diseñador" con
  contraseña es solo un candado simple, no autenticación de verdad.
- **"Cambiar la interfaz manualmente"**: si te referías a algo más que el
  panel de Modo diseñador (por ejemplo, arrastrar y reacomodar bloques
  libremente en un lienzo), dímelo — eso sería un editor visual mucho más
  grande y no asumí que fuera lo que pedías.

## Estructura del código

```
index.html           punto de entrada, carga todo en orden
css/styles.css        tokens de diseño (paleta/tipografía) + estilos
js/store.js           modelo de datos + persistencia en localStorage
js/currency.js        conversión MXN/USD y cálculo de esquema de pago
js/render-ficha.js    dibuja la ficha (se usa igual en vivo y para el PDF)
js/map-editor.js      subir mapa + marcar/arrastrar pines, con estilo por pin
js/render-app.js      los 2 pasos, formularios, biblioteca, modo diseñador
js/pdf-export.js      captura cada ficha (html2canvas) y arma el PDF (jsPDF)
js/main.js            arranque
serve.ps1             servidor local opcional (no lo necesitas para uso normal)
Crear acceso directo.bat   crea el ícono de escritorio que abre en el navegador
crear-acceso-directo.ps1   script real detrás del .bat de arriba
assets/app-icon.ico        ícono de la app (logo real sobre fondo de marca)
```

Sin build, sin framework: JavaScript simple cargado como scripts clásicos.

## Qué se probó

Flujo completo en navegador, incluyendo exportación real a PDF verificada
pixel por pixel (convirtiendo el PDF de vuelta a imagen): título arriba de
la imagen, plano centrado con especificaciones, escala de plano/
información/pago (compartida entre modelos de una misma ficha), precio
secundario más grande, pago con concepto grande y momento normal, franja
invertida, botones centrados y con color individual, aviso legal siempre
presente, encabezado solo en la primera de dos fichas, modo diseñador
(contraseña + controles globales y por elemento), pin de mapa sin ícono y
con estilos, recorte automático de fondo de plano (con una imagen
sintética: el fondo quedó transparente, el trazo opaco), y el bug de
orientación de página descrito arriba. También verificado en un viewport
de celular: sin scroll horizontal, controles legibles sin hacer zoom.

No se pudo probar en esta sesión: pegar una imagen real desde el
portapapeles (Ctrl+V) y arrastrar un pin con el mouse de verdad — ambas
usan APIs estándar del navegador ya probadas en el resto de la app, pero
vale la pena que las confirmes tú la primera vez.

### Ronda siguiente (íconos, precio secundario, eyebrow, encabezado, fondo)

Se agregaron los controles que faltaban (íconos + texto de habitaciones/
baños/m², precio secundario, el renglón de ciudad/tipo/entrega, y el
texto del encabezado), y se corrigió que los ajustes de un modelo no se
aplicaban a los demás modelos de la misma ficha — ahora, igual que el
tamaño de panel, los estilos de nombre/precio/especificaciones de modelo
son por ficha, no por modelo individual. Verificado midiendo directamente
los estilos calculados en el navegador (tamaño de fuente, cursiva,
negrita) y con una captura real del render usado para el PDF — confirmé
en esa captura que los íconos de habitaciones y baños miden exactamente
lo mismo que el de m² (35×35 px con el ejemplo de prueba), aunque a
simple vista parezcan de tamaño distinto porque el texto junto al ícono
de m² se hizo lo bastante grande como para partirse en dos líneas.

### Ronda siguiente (modo diseñador no abría, íconos desproporcionados, montos de pago)

**Encontré el motivo real de que el modo diseñador no abriera:** los
datos guardados en tu navegador venían de antes de que agregara varios de
los campos nuevos (título, franja, estilos de modelo, etc.). Al abrir el
panel, el código intentaba leer un campo que no existía y se rompía en
silencio — la ventana simplemente no aparecía, sin ningún aviso. Ahora
hay tres capas de protección: (1) cualquier documento, sea de
`localStorage` o importado de un respaldo JSON, se completa automáticamente
con los campos que le falten al cargarlo; (2) cada control del modo
diseñador tiene un valor de reserva si por alguna razón su campo sigue
faltando; (3) si algo truena de todos modos, ya no se queda la pantalla
en blanco — aparece un aviso abajo a la derecha. Lo probé simulando
exactamente tu escenario (un documento guardado sin los campos nuevos) y
el modal abrió sin problema.

**Íconos de habitaciones/baños desproporcionados:** encontré el motivo —
el número junto al ícono ("2") tenía un tamaño de letra fijo en el CSS
que ignoraba el control de tamaño; solo crecía el ícono, no el número.
Ya crecen juntos y en la misma proporción (lo verifiqué midiendo ambos:
a un mismo ajuste, la relación ícono/número quedó prácticamente idéntica
a la que tenían por defecto).

**Nuevo:** los montos del esquema de pago ($74,875 USD, etc.) ahora
tienen su propio control de tamaño/negrita/cursiva/tachado en "Modelos de
esta ficha" dentro del modo diseñador.

**Vista en vivo dentro del modo diseñador:** ahora la ventana tiene dos
columnas — controles a la izquierda, la ficha (o el mapa, hay un selector)
renderizándose en vivo a la derecha, igual que en el paso de edición
normal. De paso encontré y corregí un bug relacionado: en varios
elementos con tamaño de letra propio en el diseño (el título, los
precios, etc.), el cálculo de "tamaño ±" partía del tamaño heredado del
elemento padre en vez de su propio tamaño normal, así que el resultado no
correspondía a lo que se pedía (por ejemplo, subir el título "+20" apenas
lo movía medio pixel en vez de subirlo 20px). Ya calcula cada tamaño
directamente en píxeles desde el valor real de cada elemento — lo
verifiqué pidiendo +20 al título y confirmando que efectivamente subió de
34px a 54px.

**Scroll independiente + ya no salta arriba al marcar negrita/cursiva:**
antes, marcar negrita reconstruía toda la ventana del modo diseñador
(para actualizar el botón activo), y esa reconstrucción reiniciaba el
scroll a cero — si estabas viendo un control de más abajo, la ventana
brincaba al inicio de golpe. Ahora ese botón se actualiza en su lugar sin
reconstruir nada, así que el scroll no se mueve. De paso, controles y
vista previa ahora son dos áreas de scroll completamente independientes
(cada una con su propia barra) — lo verifiqué moviendo el scroll de
controles a 200px, marcando negrita, y confirmando que seguía exactamente
en 200px sin que la vista previa se afectara.

### Ronda siguiente (insignia/showroom/pago editables, botones alineados, aplicar a todas)

**Insignia "Desde", botón "Showroom" y barra "Esquema de pago"** ahora
tienen su propio control de color y de tamaño/negrita/cursiva/tachado en
"Modelos de esta ficha", dentro del modo diseñador.

**Botones principales alineados con la imagen y con la misma separación
entre sí**: antes quedaban con espacios desiguales; ahora usan la misma
franja de ancho que la imagen principal (mismos bordes izquierdo/derecho)
y la separación entre ellos se reparte de forma pareja. Lo verifiqué
midiendo los bordes de la imagen contra los del renglón de botones —
coinciden exactamente — y el espacio entre cada botón (131px y 130px en
la prueba, la diferencia es solo redondeo).

**Nuevo interruptor "Aplicar cambios de estilo a todas las fichas"**, en
la parte de arriba del modo diseñador. Apagado (como antes), los cambios
de estilo solo tocan la ficha que tienes elegida en el selector. Encendido,
cada cambio de estilo/color/escala se copia automáticamente al resto de
las fichas del documento (los botones se igualan por texto — "BROCHURE"
con "BROCHURE", etc. — así que una ficha con menos botones no se rompe).
Lo probé con dos fichas: con el interruptor apagado, cambiar el precio de
una no tocó la otra; encendido, cambiar el tamaño del título en una
ficha se copió de inmediato a la otra.

### Ronda siguiente (bug crítico de texto amontonado/desbordado, marco del plano, calidad, showroom editable, scroll del editor)

**Texto desbordado del borde de la página al descargar el PDF:** lo
reproduje con tu mismo escenario (escala de plano grande + nombre de
modelo largo) y encontré la causa — a la columna de especificaciones le
faltaba `min-width:0`, una regla de flexbox: sin ella, un elemento que
"puede encoger" igual se niega a bajar de su ancho de contenido sin
partir líneas, así que el texto se salía del borde en vez de acomodarse.
Ya se corrigió y quedó verificado exportando un PDF real con ese mismo
escenario: el texto ahora se ajusta dentro de su columna.

**Bug más grave, encontrado después con un archivo real tuyo (`IRIS_&_JAVIER.pdf`): letras y palabras amontonadas/superpuestas en todo el documento, y el bloque de plano+especificaciones descentrado.**
La causa de ambos era la misma: los controles "Información" y "Tabla de
pago" (los sliders de tamaño dentro de cada ficha) escalaban ese bloque
completo con la propiedad CSS `zoom`. `zoom` no es algo que
`html2canvas` (la librería que convierte la ficha en imagen para el PDF)
sepa medir bien — el espaciado entre letras y palabras le queda mal
calculado, a veces amontonado y a veces con huecos de más — y además, al
ser un elemento dentro de una fila flexible, `zoom` peleaba con el
cálculo que centra el plano y las especificaciones, empujando todo el
bloque hacia la izquierda. Lo reproduje exactamente (specs al 115%) y
confirmé el problema antes de tocar nada. La corrección: en vez de
`zoom`, cada texto de esa zona (nombre del modelo, íconos, insignia
"Desde", precio, botón showroom, montos de pago) calcula su propio
tamaño de letra en píxeles según el porcentaje elegido — la misma técnica
que ya usábamos para el ancho del plano. Verificado con el mismo
escenario: ya no hay letras superpuestas en ningún nivel de escala, y el
plano+especificaciones quedó centrado de forma exacta y simétrica
(comprobado con medición de píxeles del PDF resultante, no solo a
simple vista).

**Marco visible alrededor de la imagen del plano:** como pediste, se
quitó — los planos que subes suelen ser imágenes sin fondo y el marco no
correspondía. El recuadro punteado que aparece antes de subir un plano
se mantiene, para que sea claro dónde arrastrar/subir la imagen.

**Calidad de la exportación:** el texto se veía pixelado al hacer zoom en
el PDF. Se subió la resolución de captura (el triple de nitidez que
antes) y la calidad de compresión de imagen. Verificado con una
exportación real: el archivo pesa más (señal de que sí hay más detalle) y
el texto se ve nítido incluso acercando mucho el zoom del PDF.

**Texto del botón showroom editable:** cada modelo tiene ahora un campo
"Texto del botón" junto al enlace — ya no queda fijo en "Showroom".

**Modelos vacíos exportándose sin que te dieras cuenta:** no encontré un
lugar en el código donde se agreguen modelos solos — el botón "+" es
siempre una acción manual tuya. Lo más probable es que hayan quedado
pestañas de modelo vacías de una ficha anterior/plantilla sin que se
notara, porque el editor solo te muestra la pestaña activa a la vez. Para
que no se te pase de nuevo: las pestañas de modelos sin plano, precio ni
especificaciones ahora se marcan con borde punteado rojo y un "·", y
arriba del formulario aparece un aviso contando cuántas hay.

**Scroll independiente al llenar una ficha:** igual que en el modo
diseñador, el formulario (izquierda) y la vista en vivo (derecha) del
paso "Cliente, fichas y mapa" ahora tienen cada uno su propia barra de
scroll — desplazar uno ya no mueve ni desancla al otro. Verificado
moviendo el scroll del formulario a 200px y confirmando que la vista
previa se quedó en 0.

**Nota:** el control "Escala de texto global" del modo diseñador (la que
afecta la página completa, no solo un bloque) todavía usa `zoom` por
dentro — es la misma familia de bug, pero no estaba en el reporte que me
diste y corregirla ahí implica un cambio más grande (tocar el tamaño de
letra de cada elemento de la página, no solo los de plano/pago). Si la
usas y ves algo raro, dímelo y la paso a la misma técnica.

### Ronda siguiente (editor de ficha en una sola vista, modo oscuro)

**Las 5 secciones de cada ficha (encabezado, modelos, franja, botones,
imágenes) ya no son un acordeón** donde solo veías una a la vez y tenías
que hacer clic para abrir la siguiente. Ahora se muestran todas juntas,
siempre abiertas, en el mismo orden en que se llenan — bajas por el
formulario de corrido, sin clics extra. El check (✓ / —) de cada sección
se mantiene como referencia de qué falta.

**Modo oscuro para la interfaz** — botón "🌙 Modo oscuro" en el panel
izquierdo, junto a "Modo diseñador". Cambia el color de fondo, paneles,
formularios y modales de la app. **La ficha en sí (la vista en vivo, el
modo diseñador y el PDF) no cambia** — se queda siempre con los colores
de tu plantilla real, sin importar el tema de la interfaz, porque es un
documento para imprimir y debe verse igual siempre. Técnicamente esto se
resolvió "reanclando" la paleta de marca directamente dentro del
contenedor de la ficha, así el mismo CSS que ya pinta cada elemento no
tuvo que tocarse. La preferencia se guarda aparte del documento (no es
parte de lo que exportas ni de lo que se sincroniza), y se aplica antes
del primer dibujo de la página para que no haya parpadeo al abrir. Lo
verifiqué activándolo y confirmando en el navegador que el fondo de la
interfaz cambia a oscuro mientras el fondo/color de la ficha (incluso
dentro del modo diseñador) se mantiene exactamente en los mismos tonos
que en modo claro.

### Ronda siguiente (galería fija, mapas múltiples, arrastrar para reordenar, tipografía, cierre, encabezado)

**Orden del editor igual al orden real de la ficha.** Antes era Encabezado
→ Modelos → Franja → Botones → Imágenes; ahora es Encabezado → Imágenes →
Botones → Modelos → Franja — el mismo orden en que aparece cada cosa en
la página impresa, así lo que llenas es lo próximo que ves en la vista en
vivo, sin subir hasta el final para revisar imágenes o botones.

**Galería fija de 4 imágenes**, ya no configurable en cantidad: siempre
una imagen ancha arriba y tres en fila debajo, en ese orden y con esa
proporción — igual que tu mosaico de referencia. Se quitaron los botones
"agregar"/"quitar imagen"; cada uno de los 4 recuadros se sube o se
reemplaza individualmente, con doble clic para ajustar el encuadre igual
que antes.

**Hasta 3 mapas en la misma página final**, cada uno con su propia
captura, sus propios pines, y una franja de texto opcional arriba (por
ejemplo "Playa del Carmen", "Tulum", "Cancún") para distinguirlos.
Documentos viejos con un solo mapa se migran automáticamente al nuevo
formato la primera vez que se abren — lo verifiqué guardando un documento
en el formato antiguo y confirmando que el pin y la imagen sobrevivieron
la migración intactos.

**Arreglé el recorte del mapa al marcar pines**: la imagen dentro del
panel donde haces clic para agregar pines no tenía ningún ajuste de
tamaño, así que se mostraba a su resolución real (casi siempre mucho más
grande que el recuadro) y el recuadro, al recortar lo que sobra, solo
dejaba ver una esquina. Ya se ajusta para llenar el recuadro completo,
igual que en la vista en vivo — puedes ver y marcar pines sobre el mapa
entero. De paso quité la miniatura grande que aparecía arriba para subir
la captura (una vez que ya subiste una imagen, tanto ese panel de pines
como "Vista en vivo" ya la muestran completa, así que era una copia de
más); ahora solo hay un botón compacto para cambiarla o quitarla.

**Arrastrar para reordenar** en tres lugares:
- Las fichas ahora se muestran como miniaturas reales (no solo texto) en
  la parte de arriba, y se pueden arrastrar entre sí para cambiar el
  orden del documento.
- Los modelos de una ficha (las pestañas numeradas) también se pueden
  arrastrar para reordenar.
- Como pediste: si arrastras una ficha distinta hasta la primera
  posición, el encabezado con logo y foto (y el "Para" / "Elaborado por")
  se mueve automáticamente a esa ficha — no hace falta ningún ajuste
  aparte, porque ya calculábamos "es la primera" a partir del orden real
  del arreglo. Lo verifiqué arrastrando la tercera ficha hasta el
  principio y confirmando que su miniatura pasó a mostrar el encabezado
  de marca mientras las otras dejaron de mostrarlo.

**Tipografía elegible en modo diseñador**: nuevo selector en "Documento
completo" con 5 fuentes básicas (Arial, Georgia, Times New Roman,
Verdana, Trebuchet MS) más Montserrat, cargada en todas sus variantes de
grosor e itálica para que los controles de negrita/cursiva que ya existen
usen el trazo real en vez de una versión sintética más tosca que arma el
navegador. Lo probé exportando un PDF con Montserrat activo y se ve
claramente distinta a la tipografía original.

**Panel de "Gastos aproximados de cierre"**, opcional, debajo del
esquema de pago de cada ficha: un monto (o una línea en blanco si lo
dejas vacío) con la leyenda "Esta es una simulación de referencia; el
monto real puede variar."

**Encabezado con cliente y asesor**: la primera página ahora dice
"Para: (cliente)" y, debajo, "Elaborado por: (asesor)" — se agregó el
campo correspondiente en el primer paso del asistente.

**"Mostrar conversión" junto a la moneda**, no debajo con un hueco vacío
de por medio — ambos controles quedan en el mismo renglón.

**Contraste roto en modo oscuro**: el botón "Descargar PDF" (y el
numerito de paso completado en el panel izquierdo) usaban un color de
texto que también cambia con el tema — en oscuro, tanto el fondo tostado
como el texto se volvían claros a la vez y el texto casi desaparecía. Ya
usan un tono oscuro fijo para el texto, igual en los dos temas.

### Ronda siguiente (proporción de íconos, tabla de niveles, pegar capturas, ventana propia)

**Íconos de habitaciones/baños/m² más grandes** respecto al número de al
lado, para que destaquen más — antes el ícono era 22px vs. un texto de
~15px (ícono apenas 47% más grande); ahora es 32px en la misma
proporción. Verificado con el mismo ejemplo de antes y confirmando que
la proporción ícono/texto se mantiene igual sin importar el tamaño de
texto que se use (se probó en 0 y en +20).

**Tabla de precios por nivel arriba del esquema de pago** (antes iba
debajo), y el esquema de pago ya no muestra montos en dinero — solo el
porcentaje con el concepto y el momento (ej. "30% ENGANCHE · AL
FIRMAR"), para no repetir la misma información dos veces cuando ambas
tablas están visibles. Entrega inmediata queda igual que siempre.

**Pegar una captura de pantalla (Ctrl+V) ya funciona en cualquier
imagen**, no solo en el plano como antes — galería, imagen de fondo del
documento, y la captura del mapa. Clic en el recuadro y Ctrl+V, igual
que ya funcionaba con el plano.

**La app se abre como programa aparte, no como pestaña de navegador**:
ver "Abrirla como si fuera un programa aparte" más arriba. Usa el modo
"app" de Chrome/Edge — ventana propia, sin pestañas ni barra de
direcciones — así que no hace falta instalar nada nuevo.

### Ronda siguiente (botón de guardado manual, esquema de pago normal, botones sin enlace en el PDF, "no se guarda nada")

**Botón "💾 Guardar cambios"** en el panel izquierdo, junto al indicador
de guardado automático. Todo ya se guarda solo con cada cambio, así que
este botón no guarda nada que no estuviera ya guardado — pero da una
acción explícita, con su propia confirmación al hacer clic, para esa
tranquilidad de "ya le di guardar".

**Corregí un error mío**: había dejado el esquema de pago sin montos
*siempre*, cuando el pedido original era que solo se ocultaran cuando la
tabla de precios por nivel está activa (para no repetir la información).
Ya quedó condicionado correctamente — sin tabla de nivel, el esquema de
pago se ve como siempre: %, concepto, momento y el monto de cada uno.

**Los botones del PDF (BROCHURE, RENDERS, UBICACIÓN, SHOWROOM) ya
abren de verdad al hacer clic.** La causa: el PDF se arma capturando
cada página como una imagen (para que se vea igual que la vista previa),
así que los botones se veían bien pero no eran más que píxeles — sin
ningún hipervínculo real detrás. Ahora, después de insertar la imagen de
cada página, se agrega un enlace real de PDF en la posición exacta de
cada botón visible con un enlace cargado. Verificado exportando un PDF
de prueba e inspeccionando directamente el archivo — confirmé que
contiene las anotaciones de enlace apuntando a las URLs correctas.

**"Guardo, cierro la app, y al abrirla de nuevo no hay nada" — encontrado
y corregido.** La causa no era el código de la app ni tus datos (los
probé directamente contra tu documento real y cargan sin problema) —
era que esta computadora tiene **varios perfiles de Chrome**, cada uno
con su propio almacenamiento separado, y el acceso directo no
especificaba cuál usar. Según qué perfil abriera Chrome cada vez, a
veces caía en uno vacío. Ya se corrigió: el acceso directo ahora fija
siempre el mismo perfil (el que realmente usas), así que cada apertura
cae en el mismo lugar donde se guardó todo. Confirmé que tus fichas
reales siguen intactas donde deben estar — no se perdió nada.

### Ronda siguiente (se quitó el recorte automático de fondo del plano)

**El plano ya no se edita al subirlo.** La causa del daño: la función de
"recortar fondo" comparaba el color de **cada píxel de toda la imagen**
contra el color de las esquinas, no solo el borde — así que cualquier
zona interior con un color parecido al fondo (una pared clara, un
mueble blanco, un relleno de color similar) también se volvía
transparente o cambiaba de opacidad, alterando colores y contraste
donde no debía. Como pediste, se quitó esa función por completo — el
plano que subes es exactamente el que se ve en la ficha, sin ningún
procesamiento automático.

### Ronda siguiente (aprox. en la tabla de pagos, diseño predeterminado, escala global sin zoom, limpieza de "no guarda")

**Cada monto del esquema de pago ahora muestra también el aproximado en
la otra moneda** (el "≈ $X USD/MXN" chiquito debajo), igual que ya
pasaba con el precio principal — antes solo aparecía en la moneda
principal de la ficha. Se oculta junto con el monto principal cuando la
tabla de precios por nivel está activa, y no aparece si "Mostrar
conversión" está desactivado.

**Nuevo: "💾 Guardar como diseño predeterminado"**, en modo diseñador.
A diferencia de "Aplicar cambios de estilo a todas las fichas" (que solo
afecta a las fichas que ya existen en el documento abierto), esto guarda
los estilos, colores, tipografía y escalas actuales como tu plantilla
personal — separado de cualquier documento — así que **toda ficha nueva
y todo documento nuevo, incluso empezando totalmente desde cero,
arranca con ese diseño** en vez de los colores/tamaños de fábrica. Hay
un botón "↺ Restablecer al diseño de fábrica" al lado para volver atrás
cuando quieras. Verificado guardando un diseño de prueba y confirmando
que tanto una ficha nueva como un documento nuevo lo heredan
automáticamente, y que restablecer lo revierte.

**"Escala de texto global" ya no usa `zoom`** — era el mismo bug que ya
habíamos corregido para plano/información/pago, pero a nivel de toda la
página: el texto se apelmazaba o se abría de más al escalar. Ahora cada
elemento de la ficha (título, precios, botones, franja, montos de pago,
y también la página de mapa) calcula su tamaño exacto a partir de este
control, así que "achicar o agrandar todo lo que tenemos" ya funciona de
forma confiable, sin ese efecto secundario. Verificado matemáticamente:
a 140% cada tamaño de fuente coincide exactamente con lo esperado (por
ejemplo el título pasó de 34px a 47.6px, ni un pixel de diferencia).

**Sobre "sigue sin guardar nada"**: encontré y borré una copia vieja y
rota de `index.html` que había quedado suelta directo en el escritorio
(sin sus carpetas de soporte al lado) — no explicaba el problema por sí
sola, pero era un foco de confusión que valía la pena limpiar. Confirmé
que el guardado en el perfil correcto de Chrome sigue funcionando y
recibiendo datos nuevos con normalidad. Quedamos en que el usuario haga
una prueba puntual (escribir algo, cerrar, reabrir) para confirmar de
una vez si el arreglo del perfil ya resolvió esto del todo.

### Ronda siguiente (causa real de "no se guarda nada", montos secundarios ajustables)

**Encontré la causa real de "guardo, cierro, y al reabrir no hay nada":
el navegador se quedaba sin espacio de almacenamiento.** Cada foto/plano
que subes se guarda como texto dentro del mismo archivo de datos de la
app (así funciona `localStorage`, sin necesidad de servidor), y ese
espacio tiene un límite fijo por navegador — normalmente unos pocos MB.
Antes, las fotos se guardaban a su resolución original: una foto de
celular sin editar puede pesar varios MB y medir 4000px de ancho o más,
mucho más de lo que una ficha impresa necesita. Con varias fotos así, el
documento se acercaba o pasaba ese límite, el guardado fallaba **en
silencio** (el código atrapaba el error pero no avisaba nada), y el
botón "Guardar cambios" seguía mostrando "Cambios guardados ✓" aunque no
se hubiera guardado nada — de ahí que ni el botón manual ayudara. Se
corrigió por dos lados:

1. **Cada foto que subas ahora se reduce automáticamente** a un máximo de
   2000px de lado (de sobra para cómo se ve impresa) antes de guardarse,
   lo cual baja muchísimo el peso de fotos de celular sin que se note la
   diferencia visualmente. Verificado con una imagen de prueba de
   4000×3000px: quedó en 2000×1500px y bajó de ~518KB a ~188KB.
2. **Si el guardado falla de todos modos** (documento ya muy pesado, u
   otra causa), ya no queda en silencio: el indicador de guardado se
   pone en rojo con "⚠ No se pudo guardar", el botón "Guardar cambios"
   avisa igual en vez de fingir que sí guardó, aparece un aviso
   explicando qué pasó y qué hacer (bajar el peso de las imágenes,
   exportar el PDF como respaldo mientras tanto), y si intentas cerrar
   la ventana con un guardado fallido pendiente, el navegador pregunta
   "¿seguro que quieres salir?" en vez de dejarte cerrar sin avisar.
   Verificado simulando el fallo directamente: el indicador y el aviso
   aparecen correctamente, y se quitan solos en cuanto un guardado
   vuelve a tener éxito.

**Los montos secundarios (el "≈" en la otra moneda) del esquema de pago
ya tienen su propio control de tamaño/negrita/cursiva/tachado**, junto
al de "Montos del esquema de pago" en modo diseñador — antes su tamaño
solo seguía al de la escala general de la tabla, sin poder ajustarse por
separado.

**Nuevo: "📊 Ver almacenamiento"**, botón en el panel izquierdo junto a
"Guardar cambios". Abre una lista de cada imagen guardada en el
documento (fondo de página, mapas, y por cada ficha su imagen principal,
las otras 3 de la galería, y el plano de cada modelo), ordenada de la
más pesada a la más liviana con su peso aproximado, más el total general.
Cada una tiene su botón "✕" para quitarla ahí mismo (con confirmación,
no se puede deshacer) — así, si el guardado empieza a fallar por espacio,
ya no hay que adivinar qué imagen es la culpable ni volver a subir todo:
se ve exactamente qué pesa más y se quita solo eso. Verificado con un
documento de prueba con varias imágenes de distinto tamaño: la lista, el
orden, los pesos y el botón de quitar funcionan correctamente y el total
se recalcula solo.

**Arriba de esa lista, un indicador de "espacio ocupado" con porcentaje,
barra y los tres números que se pidieron: cuánto llevas ocupado, cuánto
te queda libre, y el total.** Chrome no tiene ningún dato que diga "tu
límite es tanto", así que en vez de inventar un número se calcula de
verdad: al abrir la ventana, la app prueba en ese mismo instante cuánto
más se puede escribir en el almacenamiento de este navegador antes de
que falle, y de ahí saca el porcentaje. La barra se pone ámbar a partir
de 70% y roja a partir de 90%. Como esa prueba tarda un poco, no se
repite sola en cada apertura — se guarda en memoria mientras tengas la
app abierta y hay un botón "🔄 Recalcular" para forzarla de nuevo (por
ejemplo, después de borrar varias imágenes pesadas). Lo verifiqué de dos
formas: con el espacio casi vacío (mostró correctamente que hay mucho
margen) y llenando el almacenamiento a propósito hasta dejar solo 2MB
libres (mostró 96%, "Ocupado: 47.75 MB · Libre: 2.00 MB", exacto).

**Botones "BROCHURE/RENDERS/UBICACIÓN/SHOWROOM" e insignia "Desde" más
ajustados** — el espacio a los lados del texto era mucho más ancho que
el texto mismo. Se redujo el relleno horizontal (de 30px a ~16.5px en
los botones, de 20px a ~14px en la insignia) y además ahora ese relleno
está en unidades relativas al tamaño de letra (antes eran px fijos), así
que si más adelante subes o bajas el tamaño de texto de estos elementos,
el espacio alrededor se ajusta en la misma proporción en vez de quedar
desbalanceado.

### Ronda siguiente (cambio de motor de guardado: de localStorage a IndexedDB — el arreglo de fondo para "se llena rápido")

**Se pidió al menos 10GB de espacio, y `localStorage` (donde se guardaba
todo hasta ahora) tiene un techo duro de navegador de unos 5-10MB — no
hay optimización de código que estire eso a gigabytes.** Para llegar a
ese tamaño de verdad, el documento y la biblioteca de páginas (las dos
cosas que cargan imágenes) se movieron a **IndexedDB**, otra base de
datos del navegador cuyo límite es un porcentaje del disco libre de la
computadora — en la práctica, cientos de MB a varios GB en vez de unos
pocos MB. Lo confirmé pidiéndole al navegador su cuota real para esta
app: reportó **~1.19 GB disponibles** en la máquina de prueba (va a
variar según cuánto disco libre tengas tú). El diseño predeterminado del
modo diseñador se queda en `localStorage` como estaba — no carga
imágenes, pesa casi nada, y se usa en decenas de lugares que necesitan
leerlo al instante.

Esto es un cambio de fondo, no un ajuste chico, así que antes de tocar
nada te pregunté y confirmaste que querías seguir adelante. Cosas a
saber:

- **Migración automática y verificada.** La primera vez que abras la app
  después de este cambio, si tenías datos guardados a la manera vieja
  (`localStorage`), se copian solos a IndexedDB. Antes de borrar la copia
  vieja, la app **lee de vuelta** lo que acaba de escribir para confirmar
  que quedó bien — si algo falla, la copia vieja se queda intacta en vez
  de perderse. Lo probé sembrando una ficha de prueba a la manera vieja,
  abriendo la app, y confirmando que apareció completa Y que la copia
  vieja se borró solo después de verificarse.
- **Al abrir la app ahora hay un parpadeo brevísimo de "Cargando tu
  documento…"** antes de que aparezca todo — leer de IndexedDB no es
  instantáneo como leer `localStorage`. En la práctica es cuestión de
  milisegundos, pero ya no es "aparece de inmediato" como antes.
- **El indicador de guardado (y el aviso de "no se pudo guardar") siguen
  funcionando igual que antes**, incluyendo el aviso al cerrar la ventana
  con un guardado pendiente — solo que por dentro ahora escuchan cuándo
  termina cada guardado en vez de asumir que termina al instante. Lo
  probé simulando un fallo de escritura real (no solo el de
  `localStorage` de antes): el indicador se puso en rojo, salió el aviso,
  y al "arreglarse" volvió a "Guardado" solo.
- **El indicador de "espacio ocupado" en "📊 Ver almacenamiento" ahora usa
  el dato real que da el navegador para IndexedDB** (antes era una prueba
  manual contra `localStorage`, que ya no tiene sentido ahora que las
  imágenes viven en otro lado). Sigue mostrando ocupado/libre/total con
  barra de progreso y botón para recalcular.

### Ronda siguiente (orden del título, editor manual de plano, fotos sin recorte forzado)

**Nombre del desarrollo arriba, "ciudad · tipo · entrega" abajo** — antes
era al revés. Solo cambié el orden en que se dibujan; nada de tamaños ni
estilos se movió.

**Nuevo: editor manual para borrar el fondo del plano**, con el mismo
espíritu de Photoshop/Photopea que se pidió — nada automático, tú decides
qué se borra. Se abre solo al subir un plano nuevo (o con el botón "✏️"
sobre uno ya subido, para retocarlo después). Herramientas:

- **🪄 Varita mágica** — clic sobre un color y borra todos los píxeles
  conectados a ese punto que sean parecidos, con un control de
  tolerancia. Probado sobre un fondo blanco con una forma de color
  encima: borró el fondo completo sin tocar ni un píxel de la forma.
- **🖌 Pincel** — arrastra para borrar a mano libre, con control de
  tamaño.
- **▭ Rectángulo** — arrastra un recuadro y borra todo lo que quede
  adentro al soltar.
- **⟲/⟳ Rotar 90°** en cualquier dirección.
- **↩ Deshacer** (hasta 15 pasos) y **↺ Reiniciar** (vuelve a como estaba
  el plano al abrir el editor esta vez, no al archivo original de la
  primera vez que lo subiste). Verificado que deshacer funciona
  correctamente incluso después de rotar (antes de esta prueba noté que
  al deshacer después de rotar la imagen podía quedar mal recortada, así
  que el deshacer ahora también recuerda el tamaño del lienzo en cada
  paso, no solo los píxeles).

Nada se guarda hasta que le des "✓ Aplicar cambios" — "Cancelar" descarta
todo lo hecho en esa sesión de edición.

**Las fotos de la galería llenan el marco completo sin deformarse** —
esto no cambió, seguía siendo "cubrir" (`object-fit: cover`) como
siempre: la foto se escala proporcionalmente (nunca se estira ni se
distorsiona) y se recorta lo que sobre para no dejar huecos. Hice un
cambio a "contener" por una lectura equivocada de un pedido anterior y
lo revertí de inmediato al aclararse que no era lo que se quería.

**El ajuste de encuadre con doble clic se movió de la miniatura del
formulario a la vista en vivo**, donde se pidió que estuviera. Doble
clic sobre la foto en la vista en vivo (no en el formulario) abre el
panel con la mini-vista y los controles de posición horizontal/vertical;
doble clic de nuevo (o el botón "✕ Cerrar ajuste") lo cierra. De paso
encontré y corregí un bug real: antes, el doble clic vivía sobre la
miniatura del formulario, que es una etiqueta que envuelve un campo de
archivo — cada doble clic dispara primero dos clics normales, y cada uno
de esos abría el selector de archivos de Windows, interrumpiendo el
gesto antes de que el ajuste llegara a abrirse. Por eso "no podías
ajustarlas". Ahora que el ajuste vive en la vista en vivo (que no es un
campo de subida de archivo), ese conflicto no existe. Verificado a fondo:
el panel sobrevive tanto a mover el control deslizante como a escribir
en cualquier otro campo del formulario (antes se hubiera cerrado solo),
y los tres estados (abrir, mover, cerrar) guardan y reflejan la posición
correctamente.

**Los botones BROCHURE/RENDERS/UBICACIÓN ahora vienen activados por
default** en toda ficha nueva — antes había que prenderlos uno por uno.
Sigue pudiéndose apagar cualquiera a mano. El botón Showroom (que
depende de un enlace por modelo, no es fijo como los otros tres) se
queda como estaba: apagado hasta que lo actives.

### Ronda siguiente (arrastrar en vez de sliders, "aprox." en vez de "≈", aviso legal fuera del formulario, paneles más compactos)

**El ajuste de encuadre ya no usa sliders — ahora arrastras la imagen
directamente con el cursor.** Doble clic sobre la foto en la vista en
vivo la deja "agarrable" (cursor de manita, con un aviso breve de cómo
salir); mientras la arrastras, la imagen sigue el cursor 1:1 calculando
cuánto de la foto realmente sobra para recorrer en cada eje según cómo
la escaló "cubrir" (una foto cuadrada en un marco panorámico, por
ejemplo, solo tiene margen para moverse verticalmente, no
horizontalmente — lo verifiqué con ese caso exacto y con uno panorámico
real, y en ambos el arrastre se movió en la dirección y cantidad
correctas). Doble clic de nuevo para soltarla.

**"≈" reemplazado por "aprox."** en las dos conversiones de moneda que
lo usaban: el precio principal y los montos del esquema de pago.

**El campo "Aviso legal" ya no aparece en el formulario de cada ficha.**
Como su propio texto de ayuda ya decía, siempre se incluye en el PDF sin
importar nada — no había necesidad de tenerlo editable ahí. Sigue
imprimiéndose igual que siempre, solo que ahora también un poco más
grande (de 8.5px a 10.5px).

**Los paneles de cada botón (BROCHURE, RENDERS, etc.) y en general las
secciones del formulario quedaron más compactas** — menos aire entre el
interruptor "Visible en el PDF" y los campos de abajo, y menos padding
alrededor de cada sección completa.

### Ronda siguiente (formulario sin pestañas, color de botón solo en modo diseñador)

**Se quitaron las pestañas/encabezados de cada sección** ("01 · Encabezado
y moneda", "02 · Imágenes de la ficha", etc., con su recuadro y su
✓/—). El formulario de cada ficha ahora es un único formulario corrido,
de arriba a abajo, sin divisiones — como se pidió.

**El selector de color de cada botón ya no está en el formulario
normal** — solo en modo diseñador, donde ya vivía también el resto de
los controles de estilo (texto, tamaño, negrita, etc.) de esos mismos
botones. En el formulario normal solo queda "Visible en el PDF", texto
del botón y enlace.

### Ronda siguiente (miniaturas de la biblioteca con imagen, aprox. en tabla por nivel, nuevo documento)

**Las miniaturas de "Páginas guardadas" (biblioteca) ya muestran la
imagen principal de esa ficha**, con el nombre del proyecto encima —
antes ese espacio quedaba vacío, solo con un degradado decorativo sin
ninguna foto. Verificado con una ficha de prueba: la miniatura toma la
imagen de `galeria[0]` y el nombre se ve superpuesto arriba.

**La tabla de precios por nivel ahora también muestra el "aprox." en la
otra moneda** debajo de cada precio, igual que ya pasaba en el precio
principal y en el esquema de pago — se oculta si "Mostrar conversión"
está apagado. Verificado con un nivel de $1,000,000 MXN y tipo de cambio
20: mostró "aprox. $50,000 USD" correctamente, y desapareció al apagar
la conversión.

**Nuevo botón "🗎 Nuevo documento"**, en beige con texto negro y más
grande que los botones vecinos para que destaque, en tres lugares: junto
a "＋ Nueva ficha"/"⌖ Mapa final" en la barra de arriba (donde están las
miniaturas F1, F2, F3…), junto a esos mismos dos en el panel de edición
de la ficha, y junto a "Descargar PDF" en la pantalla de
revisión/exportación. (La primera vez lo agregué solo en el panel de
edición, no en la barra de arriba — correspondía ahí también, ya
corregido.) Reemplaza el documento abierto por uno vacío (que ya arranca
con tu diseño predeterminado si guardaste uno) — pide confirmación
primero porque es destructivo, y avisa que hay que haber exportado el
PDF o el respaldo JSON antes si no quieres perder lo que llevas. La
biblioteca de páginas guardadas NO se toca (es aparte del documento).
Verificado: confirmar sí vacía el documento y deja la biblioteca
intacta; cancelar no cambia nada.

### Ronda siguiente (esquema de pago centrado con tabla por nivel)

**Cuando la tabla de precios por nivel está activa, las filas del
esquema de pago (el % con su concepto y momento) ahora se centran** en
vez de quedar pegadas a la izquierda. La causa: sin los montos en dinero
(que se ocultan justo cuando la tabla por nivel está activa, para no
repetir información), cada fila queda con un solo bloque de contenido, y
`justify-content:space-between` simplemente empuja ese único bloque al
inicio en vez de centrarlo. Verificado con y sin la tabla por nivel
activa: centrado en un caso, alineado a la izquierda como siempre en el
otro.

### Ronda siguiente (tamaños de la tabla por nivel igualados al esquema de pago, "Desde" fuera cuando hay tabla por nivel)

**La tabla de precios por nivel ahora usa los mismos tamaños de letra
que el esquema de pago**: el nombre del nivel (ej. "PLANTA BAJA") al
tamaño del concepto del esquema de pago, el precio al tamaño del monto,
y el "aprox." al tamaño del monto secundario — antes la tabla por nivel
tenía su propia escala aparte, más chica y sin relación con la otra
tabla. (Los tamaños exactos de "monto" y "monto secundario" cambiaron
otra vez más abajo en este changelog — la tabla por nivel se actualizó
junto con ellos para seguir coincidiendo.)

**Al activar la tabla de precios por nivel, la insignia "Desde" y el
precio base del modelo ya no aparecen.** Tenía sentido que desaparecieran
porque ambos describen un solo precio "desde", y con la tabla por nivel
activa esa cifra ya no aplica — los precios reales están en la tabla,
nivel por nivel. Verificado en ambos sentidos: aparecen al desactivar la
tabla por nivel, desaparecen al activarla.

### Ronda siguiente (monto y concepto del esquema de pago al mismo tamaño, "APROX." en mayúsculas)

**El monto ($) y el concepto/% del esquema de pago ahora son del mismo
tamaño** — antes el concepto ("12.5% ENGANCHE") se veía notablemente más
grande que su monto correspondiente ("$3,903,120 MXN") en la misma fila,
aunque son la misma jerarquía de información. Monto ahora a 16px (igual
que el concepto) y el "aprox." secundario a 13px (igual que el
"momento", ej. "A LA FIRMA DEL CONTRATO"). La tabla de precios por nivel
se actualizó junto con esto para seguir coincidiendo con el esquema de
pago, como se pidió en la ronda anterior.

**"aprox." ahora se imprime en mayúsculas ("APROX.")** en las tres
conversiones de moneda que lo usan (precio principal, esquema de pago,
tabla por nivel) — antes solo esa palabra se colaba en minúsculas entre
texto que por lo demás siempre va en mayúsculas.

### Ronda siguiente (encabezado "Nivel/Precio" al mismo tamaño que las filas, nombre del nivel en negritas)

**El encabezado de la tabla por nivel ("Nivel" / "Precio") ahora es del
mismo tamaño que las filas de abajo** — antes era notablemente más chico
(quedó rezagado cuando el resto de la tabla creció en la ronda
anterior). Ambos a 16px ahora.

**El nombre de cada nivel (ej. "PLANTA BAJA DESDE:") ahora va en
negritas**, igual que ya iba el precio a su lado.

### Ronda siguiente (publicada para iPhone/celular, arrastrar funciona con el dedo)

**La app ya está publicada en internet** (GitHub Pages, gratis) en
`https://braganmau5-dotcom.github.io/FichaFlow/` — ver la sección "Desde
el iPhone" más arriba. El código en sí queda visible públicamente en ese
repositorio (es como funciona GitHub Pages), pero ningún documento real
sube ahí — cada ficha que hagas se queda guardada solo en el navegador
del dispositivo donde la hiciste, igual que ya funcionaba en la
computadora.

**Encontré y corregí un problema real de fondo para celular: varias
interacciones de "arrastrar" solo estaban programadas con eventos de
mouse, que un dedo en pantalla táctil no dispara.** Sin este arreglo,
en un iPhone real (no en la vista de escritorio simulada) se hubieran
sentido completamente rotas — el dedo no habría movido nada:

- Arrastrar la foto de la galería para ajustar el encuadre (la función
  agregada hace unas rondas).
- El pincel y el rectángulo del editor de plano.
- Arrastrar un pin ya puesto en el mapa para corregir su posición.

Verificado cada uno simulando un toque real (no un clic de mouse) contra
la versión publicada: los tres respondieron y guardaron la posición
correctamente.

**Lo que queda pendiente, no arreglado todavía:** reordenar fichas o
modelos arrastrando las miniaturas tampoco funciona con el dedo (usa
"drag and drop" nativo del navegador, que tiene la misma limitación).
Para fichas hay una alternativa ya disponible — los botones ↑/↓ en la
pantalla de revisión — pero no para modelos ni para el arrastre en la
barra de arriba. Avisa si quieres que lo resuelva también.

### Ronda siguiente (sin zoom out, menú lateral desplegable)

**Ya no se puede alejar el zoom más allá del 100%** (sí se puede seguir
acercando) — ajuste al `viewport` de la página
(`minimum-scale=1, maximum-scale=5`).

**El panel lateral se reorganizó**: "💾 Guardar cambios" (con su
indicador de guardado) y "🌙 Modo oscuro" se quedan siempre visibles y
fijos. Todo lo demás — pasos (1. Cliente/fichas, 2. Revisión), "📊 Ver
almacenamiento", "🎨 Modo diseñador", y los contadores (fichas, pines,
tipo de cambio) — se movió a un menú desplegable detrás de un botón
"☰ Más" (que cambia a "✕ Cerrar" mientras está abierto). Elegir
cualquier cosa del menú lo cierra solo. Verificado en escritorio y en
ancho de celular: sin desbordamiento horizontal en ninguno de los dos.
