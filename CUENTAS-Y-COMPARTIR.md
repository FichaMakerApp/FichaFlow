# Cuentas de usuario y cómo compartir propentia

## Cómo funciona

- La app es un sitio estático (HTML/CSS/JS). Se publica en **GitHub Pages**, gratis, y su dirección es el link que compartes:
  `https://propentia-app.github.io/propentia/`
- Los datos viven en **Supabase**. Cada persona crea su cuenta con **correo y contraseña** desde la pantalla de entrada, y confirma su correo.
- Cada cuenta solo ve lo suyo: su biblioteca de proyectos, sus documentos guardados, sus diseños.
- Una página de la biblioteca se puede **compartir con otra cuenta por correo** (botón de compartir en la tarjeta del proyecto). La otra persona la ve y la usa en sus documentos, pero no la edita ni la borra. El dueño puede quitar el acceso cuando quiera.

## Quién puede qué

- **Sin cuenta (invitado):** abre el link y recorre toda la app (Inicio, Proyectos, Documentos, Comparativos, Editor, Revisión). No puede crear, guardar, descargar PDF, compartir ni personalizar la marca: al intentarlo aparece la ventana para iniciar sesión o crear cuenta, explicando para qué.
- **Con cuenta:** todo lo anterior, sobre sus propios datos.
- **Tú, como creador, también necesitas tu cuenta.** No hay un acceso especial: creas la tuya como cualquiera y el script `supabase-cuentas.sql` le asigna todo lo que ya existe.

## Aprobar cuentas (filtro manual)

- Quien se registra llena nombre, inmobiliaria (opcional) y WhatsApp, y confirma su correo. Su cuenta queda **pendiente**: puede entrar y recorrer toda la app, pero no crear, guardar ni descargar hasta que tú la apruebes.
- Tú, como administrador, ves en la barra de arriba el botón **Administración** (con un número rojo si hay solicitudes). Ahí apruebas o rechazas, y también suspendes o reactivas cuentas. Nadie más ve ese botón, y aunque alguien intentara abrirlo, el servidor rechaza a quien no sea administrador.
- Para activarlo, corre `supabase-aprobacion.sql` en el SQL Editor de Supabase (después de `supabase-cuentas.sql`), cambiando antes `TU_CORREO@ejemplo.com` por el correo de tu cuenta. Las cuentas que ya existen quedan aprobadas.
- La app no te avisa por correo cuando llega una solicitud (haría falta un servicio de correo propio); el aviso es el número en el botón Administración.

## Lo que se hace una sola vez (en este orden)

1. **Supabase → Authentication → Providers → Email:** deja activado "Confirm email".
2. **Supabase → Authentication → URL Configuration:**
   - *Site URL*: `https://propentia-app.github.io/propentia/`
   - *Redirect URLs*: agrega esa misma dirección. Sin esto, los enlaces del correo de confirmación y de "olvidé mi contraseña" no regresan a la app.
3. **Correos reales (importante antes de compartir con mucha gente):** el envío de correos que trae Supabase por defecto está limitado a unos pocos correos por hora y es solo para pruebas. Para uso real, configura un servicio propio en *Authentication → SMTP Settings* (por ejemplo Resend o Brevo, ambos con plan gratuito).
4. **Crea tu cuenta** abriendo la app nueva (en `localhost` o ya publicada) → "Crear cuenta" → confirma tu correo. Esta cuenta será la dueña de todo lo que ya existe.
5. **Corre `supabase-cuentas.sql`** en *Supabase → SQL Editor*, después de cambiar `TU_CORREO@ejemplo.com` por el correo de tu cuenta. Pasa todo lo existente a tu cuenta y activa la protección por usuario.
6. **Publica la versión nueva** (juntar la rama `marca-propentia` con `master` y subirla). Desde el paso 5 hasta el 6, la versión vieja deja de funcionar, así que hazlos seguidos.

## Después

- Compartes el link `https://propentia-app.github.io/propentia/` con quien quieras. Cada persona se registra sola.
- Si alguien olvida su contraseña, usa "¿Olvidaste tu contraseña?" en la pantalla de entrada.
- Un dominio propio (por ejemplo `app.propentia.com`) se agrega después en *GitHub → Settings → Pages → Custom domain*. No lo contrates hasta cerrar la búsqueda formal del nombre en el IMPI.

## Límites que conviene saber

- Compartir busca la cuenta por correo: si ese correo no tiene cuenta, la app lo dice. Eso revela a quien comparte si un correo ya está registrado.
- Los documentos y las páginas siguen guardando las imágenes en la base de datos de Supabase. El plan gratuito tiene límite de espacio; con muchos usuarios habrá que vigilarlo.
- La función de IA "Ambientar plano" usa una función de Supabase aparte (`supabase/functions/ambientar-plano`) que no cambió en esto. Si hoy no pide sesión, cualquiera con el link podría invocarla y gastar tu cuota; conviene exigir sesión ahí también (pendiente).
