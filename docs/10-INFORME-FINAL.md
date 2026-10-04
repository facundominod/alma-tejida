# Alma Tejida — Informe final

> Entregable del punto 212.
> Estado al 3 de octubre de 2026.

---

## Resumen

Alma Tejida está construida y funcionando: base de datos, seguridad, tienda pública,
carrito, pedidos, cuentas de cliente, moderación, panel de administración completo y
analíticas. **73 pruebas automatizadas pasan contra un PostgreSQL real y 138 pruebas de
navegador pasan en seis tamaños de pantalla**, el proyecto compila y no hay
errores de tipos ni de lint.

**Lo que falta para vender es configuración, no programación:** crear el proyecto de
Supabase, aplicar las migraciones, designar el administrador y cargar las primeras piezas.
Está paso a paso en [`09-PUESTA-EN-MARCHA.md`](./09-PUESTA-EN-MARCHA.md).

**Hay una decisión pendiente que es tuya, no mía:** el plan gratuito de Vercel prohíbe el
uso comercial, y una tienda es uso comercial. Las alternativas están en
[`07-LIMITES-PLAN-GRATUITO.md`](./07-LIMITES-PLAN-GRATUITO.md).

---

## 1. Arquitectura

Una aplicación Next.js y una base Postgres. Nada más.

```
Visitante ──▶ Next.js (App Router)  ──▶ Supabase
              ├ Server Components        ├ Postgres + RLS
              │   catálogo cacheado      ├ Funciones SQL atómicas
              ├ Client Components        ├ Auth
              │   carrito, galería       └ Storage (3 buckets)
              └ Server Actions
                  mutaciones
```

Sin microservicios, sin colas, sin contenedores, sin motor de búsqueda externo. La
decisión y sus motivos están en [`00-ARQUITECTURA.md`](./00-ARQUITECTURA.md).

**Tres clientes de Supabase, tres niveles de confianza:**

| Cliente | Clave | Para qué |
|---|---|---|
| `createPublicClient()` | anon, sin cookies | Catálogo público → permite cachear en el CDN |
| `createClient()` | anon + sesión | Todo lo que depende de quién mira. **El de uso normal.** |
| `createAdminClient()` | service_role | Sólo tras `requireAdmin()`, y tareas de sistema |

## 2. Stack

| Capa | Elección |
|---|---|
| Framework | Next.js 16.3 (App Router) · React 19.2 · TypeScript 5 |
| Estilos | Tailwind CSS v4 con design tokens en `@theme` |
| Animación | Motion — sólo `transform` y `opacity` |
| Base | Supabase Postgres |
| Auth | Supabase Auth (contraseña + magic link + recuperación) |
| Validación | Zod, compartida entre cliente y servidor |
| Primitivos | Radix UI (headless: accesibilidad sin estética propia) |
| Imágenes | `next/image` + `sharp` al subir |
| Gráficos | Recharts, sólo en el panel |
| Pruebas | Vitest + PGlite (PostgreSQL real, en memoria) |

**Sin ORM, sin state manager global, sin librería de componentes con estética propia, sin
pasarela de pagos, sin dark mode.** Cada ausencia está justificada en `00-ARQUITECTURA.md`.

## 3. Base de datos

**27 tablas**, 14 migraciones versionadas, aplicables en orden sobre una base vacía —
verificado por prueba automatizada.

Las cinco decisiones que la definen:

1. **Todo producto tiene al menos una variante.** El stock vive en un solo lugar del
   universo: `product_variants.stock`. Imposible desincronizar.
2. **Atributos dinámicos por producto.** No existe una columna `color` ni `talle`. Cada
   pieza define sus características.
3. **El pedido guarda una fotografía, no una referencia.** Cambiar un precio hoy no toca
   un pedido de ayer.
4. **El precio se calcula en un solo lugar:** `effective_price()`. Catálogo, ficha,
   carrito y pedido llaman a la misma función.
5. **Stock físico y reservado son columnas distintas.** `disponible = stock − reserved`.

Detalle completo en [`01-MODELO-DE-DATOS.md`](./01-MODELO-DE-DATOS.md).

## 4. RLS

Las 28 tablas tienen RLS activo. `analytics_events` y `rate_limit_hits` no tienen ninguna
policy **a propósito**: nadie las toca desde el navegador.

Cuatro garantías que impone la base, no la interfaz:

- **Un cliente no puede volverse administrador.** El `WITH CHECK` compara el rol entrante
  con el guardado.
- **El precio nunca llega del navegador.** `create_order` no tiene parámetro de precio: no
  hay dónde escribir una mentira. *(Hay una prueba que verifica que ese parámetro no
  exista.)*
- **Un invitado ve su pedido y ninguno más.** `orders` está cerrada a `anon`; el único
  camino es una función que exige número + token de 122 bits.
- **Sólo reseña quien compró.** La policy exige un pedido cobrado del usuario con ese
  producto.

Detalle en [`02-SEGURIDAD-RLS.md`](./02-SEGURIDAD-RLS.md).

## 5. Auth

Email + contraseña, magic link, recuperación y verificación de correo. **Sin OAuth
social**: agregaba configuración y dependencia de terceros sin resolver ningún problema
actual. Activarlo después es configuración de Supabase, no código.

El rol `admin` se asigna **sólo por SQL manual**. El trigger `handle_new_user()` fuerza
`customer` sin excepción. No existe camino desde el registro público al rol admin.

## 6. Storage

Tres buckets: `catalog` y `brand` públicos, `receipts` **privado** (URL firmada de 60 s
tras verificar quién pide).

**Nunca se guarda el original.** Al subir, `sharp` genera 1600 px + miniatura de 480 px +
un placeholder de 24 px embebido en la base. Una foto de celular de 4,5 MB queda en
~200 KB: **96 % menos**.

Detalle y la decisión sobre video en [`03-STORAGE.md`](./03-STORAGE.md).

## 7. Catálogo, variantes y stock

El administrador crea categorías y características **sin tocar código**. El flujo del
punto 190 funciona completo: crear "Color" con 4 opciones, "Medida" con 3, generar las 12
combinaciones, borrar las que no fabrica, cargar stock, publicar.

**Regenerar combinaciones no pisa lo existente:** una combinación que ya estaba conserva su
id, su SKU y su stock.

**Ninguna variación de stock ocurre sin dejar rastro.** No existe un `UPDATE ... SET stock`
suelto en el código: todo pasa por funciones SQL que escriben `inventory_movements` en la
misma transacción, con el saldo resultante. El historial se lee como un extracto bancario.

## 8. Pedidos

`create_order()` hace **todo o nada** en una transacción: verifica idempotencia, revalida
productos y promociones, **bloquea las variantes ordenadas por id** (lo que evita
deadlocks), verifica disponibilidad, **calcula los precios en el servidor**, reserva,
crea el pedido con snapshot completo, avisa al administrador y cierra el carrito.

Si el paso 12 falla, PostgreSQL revierte los 11 anteriores. No existe el estado "stock
reservado pero pedido inexistente".

**El doble clic no crea dos pedidos.** La clave de idempotencia se genera al abrir el
checkout; la garantía es una constraint `UNIQUE`, no un botón deshabilitado.

**Seis estados**, y la línea gruesa está en `paid`: ahí y sólo ahí baja el stock físico y
entra el ingreso. Un pedido pendiente **no es una venta**, y el panel no los mezcla nunca.

Detalle en [`04-FLUJO-PEDIDO-STOCK.md`](./04-FLUJO-PEDIDO-STOCK.md).

## 9. Carrito

Del visitante: `localStorage`, implementado como *external store* con
`useSyncExternalStore`. Eso resuelve de una la hidratación, las dos pestañas abiertas y los
renders en cascada. Al iniciar sesión se fusiona con el carrito de la cuenta y se vinculan
los pedidos hechos como invitado con ese mismo correo (sólo si está verificado).

## 10. Transferencias y WhatsApp

Sin pasarela de pagos. El administrador configura alias, CBU, titular e instrucciones; el
cliente los ve al confirmar y puede subir el comprobante al bucket privado.

**El pedido existe en la base ANTES de que WhatsApp entre en escena.** WhatsApp es el canal
de conversación, no el sistema de registro. Si la charla se pierde, el pedido sigue ahí con
su número, su monto y su stock reservado.

## 11. Preguntas y reseñas

Toda pregunta **nace privada**. El administrador responde, y decide aparte si publicarla.
Toda reseña **nace pendiente** y exige compra verificada.

**Ocultar una reseña obliga a escribir el motivo** — lo exige un CHECK de la base, no sólo
la interfaz. Una crítica negativa no se oculta por serlo.

## 12. Notificaciones

Centro interno para el administrador y para el cliente. Un índice único sobre la clave de
grupo sin leer hace **imposible** que un stock bajo genere veinte avisos repetidos. Una
compra genera **una** notificación.

## 13. Panel de administración

| Pantalla | Qué resuelve |
|---|---|
| Inicio | Ingresos, ventas, pendiente de cobro, ticket promedio, comparación con el mes anterior, bandeja de pendientes, gráficos, embudo y stock bajo |
| Pedidos | Filtros por estado, buscador, detalle con timeline, WhatsApp contextual, confirmación de pago, notas internas |
| Stock | **Mobile-first.** +1/+5 con deshacer; −1 y ajustes con confirmación y motivo |
| Productos | Alta, edición, duplicado, archivado, características y variantes, multimedia |
| Categorías · Promociones | Creación dinámica, sin tocar código |
| Preguntas · Reseñas | Moderación con respuesta pública |
| Configuración | Marca, contacto, transferencia, entregas, textos del inicio, uso de espacio |

## 14. Analíticas

Eventos crudos con **deduplicación real en la base**: un índice único por
(sesión, producto, día) hace que apretar F5 cincuenta veces sume **una** visita. Un trigger
agrega a una tabla diaria, que es lo único que lee el panel. Los crudos se purgan a los
90 días.

Sin cookies de seguimiento, sin huella digital, sin terceros. El identificador de sesión es
aleatorio y muere al cerrar la pestaña.

## 15. SEO

Metadata por página, Open Graph con foto/nombre/precio, datos estructurados
`schema.org/Product`, sitemap y robots dinámicos, URLs limpias (`/producto/manta-roma`).
`/admin` y `/cuenta` emiten `noindex` y están fuera del sitemap.

## 16. Rendimiento

| Ruta | Estrategia |
|---|---|
| `/`, `/ofertas`, `/novedades`, `/contacto` | **Estáticas** con revalidación |
| `/producto/[slug]`, `/categoria/[slug]` | **Pregeneradas** (SSG) |
| `/tienda` | Dinámica (depende de los filtros) |
| `/carrito`, `/checkout`, `/cuenta`, `/admin` | Dinámicas, sin caché |

Que las rutas públicas sean estáticas no es cosmético: **mil visitas a la misma manta son
una sola consulta a Supabase**, no mil. Es lo que hace viable el plan gratuito.

Al publicar un producto, la Server Action invalida las rutas y la tienda se actualiza al
instante, sin esperar el TTL y sin volver a desplegar.

## 17. Móvil y escritorio

Diseñado móvil primero. Hero de **62 vh, no pantalla completa**: el botón entra sin
scrollear. Catálogo en 2 columnas en celular, 3 en tablet, 4 + filtros en escritorio.
Navegación inferior de 4 destinos que **se oculta cuando aparece el teclado**.

El panel también: el administrador carga stock desde el celular con el pulgar.

## 18. Accesibilidad

Contraste AA verificado, navegación completa por teclado, anillo de foco siempre visible,
`alt` obligatorio (autocompletado si falta), objetivos táctiles de 44 px, formularios con
`<label>` real y errores con `aria-live`, un solo `h1` por página, estados comunicados por
texto además de color, y `prefers-reduced-motion` respetado animación por animación.

## 19. Seguridad

Cabeceras CSP/HSTS/X-Frame-Options; `import 'server-only'` que **rompe el build** si un
componente cliente toca el cliente admin; `npm run check:secrets` en la verificación; rate
limiting en login, registro, pedidos, preguntas y analíticas; contenido de usuario guardado
como texto plano y escapado por React; auditoría de acciones críticas.

## 20. Pruebas

Dos suites.

**Base de datos y código: 73 pruebas, ~30 segundos** (`npm run test`). Corren contra
**PostgreSQL de verdad** (PGlite, el mismo motor compilado a WASM), con las migraciones
reales y con `set role authenticated` — es decir, con exactamente los permisos que tiene
el navegador.

**Navegador: 138 pruebas en seis tamaños, ~4 minutos** (`npm run test:e2e`). Corren con
Playwright contra el **build de producción**, en Chromium y WebKit, sobre los seis
dispositivos del punto 204: iPhone SE (320 px), iPhone grande, Android, tablet, notebook y
escritorio amplio.

| Archivo | Qué cubre |
|---|---|
| `schema.test.ts` | Migraciones, RLS activo en todas las tablas, variante por defecto, búsqueda sin acentos |
| `pricing.test.ts` | Prioridad de precios, vigencias, mejor promoción, **catálogo = ficha** |
| `stock-orders.test.ts` | Movimientos, reservas, **última unidad**, doble clic, atomicidad, pieza única, a pedido |
| `rls.test.ts` | **A no ve nada de B**, escalada de privilegios, moderación, compra verificada |
| `admin-product.test.ts` | Características dinámicas, combinaciones, desactivar en vez de borrar |
| `source.test.ts` | Higiene del código: identificadores sin acentos, campos de formulario con quien los lea, secretos fuera de su módulo |
| `e2e/tienda.spec.ts` | Navegación, estados vacíos, carrito en localStorage, zonas privadas, accesibilidad, SEO, responsive |
| `db/concurrency.test.ts` | Dos conexiones reales peleando por la última unidad. **Se saltea sola** si no hay `TEST_DATABASE_URL` |

Las pruebas **encontraron siete bugs reales** durante el desarrollo, entre ellos tres que
no se veían de ninguna otra forma:

1. El editor de productos duplicaba variantes al volver a guardar, perdiendo su stock.
2. El checkout mandaba el teléfono en un campo que el servidor no leía.
3. **La CSP rompía la tienda entera en Safari y iPhone.** `upgrade-insecure-requests`
   hacía que WebKit pidiera `https://localhost`, fallara con error de SSL y la página
   quedara sin JavaScript. En Chrome no se veía: Chromium exime a localhost; WebKit no.

## 21. Deploy

Sin pasos manuales más allá de las variables de entorno y la designación del administrador.
`vercel.json` declara los dos cron jobs. Guía completa en
[`09-PUESTA-EN-MARCHA.md`](./09-PUESTA-EN-MARCHA.md).

## 22. Variables de entorno

| Variable | Visibilidad |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública por diseño (RLS la contiene) |
| `SUPABASE_SERVICE_ROLE_KEY` | **⚠️ servidor únicamente** |
| `NEXT_PUBLIC_SITE_URL` | pública |
| `CRON_SECRET` | servidor |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | opcionales, apagadas |

## 23. Migraciones

14 archivos versionados en `supabase/migrations/`, aplicables en orden. **Regla: una
migración aplicada no se edita nunca; se agrega una nueva.**

## 24. Límites del plan gratuito

Verificados el 19/09/2026 en la documentación oficial. Resumen y estimación de consumo en
[`07-LIMITES-PLAN-GRATUITO.md`](./07-LIMITES-PLAN-GRATUITO.md).

**Lo que hay que saber:**
- Supabase Free: 500 MB de base, 1 GB de storage, **5 GB de egreso**, sin backups
  automáticos, pausa a la semana de inactividad, 2 proyectos.
- **Vercel Hobby prohíbe el uso comercial.** Alternativas gratuitas: Netlify Free,
  Cloudflare Workers Free. Alternativa paga: Vercel Pro, USD 20/mes.
- El egreso es el techo real, y lo empujan los videos, no las fotos.

---

## 25. Deuda técnica

Honestamente, y en orden de importancia.

### Lo que hay que hacer con una base real antes de vender

**1. Concurrencia verdadera: la prueba está escrita, falta correrla.**
`tests/db/concurrency.test.ts` abre **dos conexiones de verdad** y lanza dos pedidos
simultáneos por la última unidad: verifica que exactamente uno gane, que el otro falle con
`OUT_OF_STOCK`, que el inventario quede coherente y que el bloqueo `FOR UPDATE` realmente
serialice. **Se saltea sola** porque no hay a qué conectarse. Con el proyecto de Supabase
creado:

```bash
TEST_DATABASE_URL="postgresql://postgres:[CLAVE]@[HOST]:5432/postgres" npm run test:concurrency
```

Es media hora, y conviene hacerla antes de anunciar la tienda.

**2. Lighthouse no se midió.**
El presupuesto está definido y las decisiones apuntan a cumplirlo, pero medirlo requiere la
app desplegada con datos reales. Es lo primero que haría después del deploy.

**3. Los tipos de la base están escritos a mano.**
`src/types/database.ts` refleja el esquema con precisión pero no declara las relaciones, así
que las consultas con `embed` usan `.returns<T>()` para tipar. En cuanto exista el proyecto:
`npm run types:generate` y esos `.returns<T>()` se pueden borrar.

**4. Nunca se vio la tienda con productos adentro.**
Las pruebas de navegador verifican la cáscara, la navegación y los estados vacíos. El
catálogo con piezas, la galería, el selector de variantes y el panel de administración se
revisaron por código, no en pantalla. Con la base cargada hay que mirarlos.

### Lo que quedó preparado y sin terminar

**5. Favoritos.** Tabla, policies e índices existen. Falta la interfaz. Era explícitamente
opcional (punto 186).

**6. Subcategorías.** El modelo las soporta (`parent_id`) y el panel deja crearlas, pero la
tienda pública las muestra al mismo nivel. Cuando hagan falta, es UI.

**7. "Avisame cuando vuelva".** Registra la consulta y avisa al administrador; no hay envío
automático cuando el stock vuelve. Fue deliberado (punto 185).

**8. Notificaciones por correo.** Sólo hay centro interno. Era la primera prioridad del
punto 152; el correo queda para cuando haga falta.

**9. Reordenar fotos arrastrando.** `reorderMedia` existe; la interfaz sólo permite elegir
portada. Falta el drag & drop.

**10. PWA.** Evaluada y descartada por ahora (punto 151: sólo si aporta).

### Detalles menores

**11. Compresión de video.** Se validan formato, peso y duración, pero no se recomprime en
el servidor (requeriría ffmpeg, pesado en funciones serverless).

**12. El seed escribe estructura directo.** `admin_save_product_structure` exige ser admin y
el seed corre con `service_role` (que saltea RLS pero no es admin). Aceptable sólo porque
ese script jamás toca producción — y se niega a hacerlo.

**13. Degradación cuando Supabase no responde.** Cada consulta pública tiene un tope de
2,5 s y devuelve un valor vacío. Como el layout y la página se renderizan uno después del
otro, el peor caso de una pantalla son ~5 s. Es mucho mejor que colgarse, pero si alguna vez
importa, se arregla con Suspense y streaming.

## 26. Lo que sí se verificó

- ✅ Las 14 migraciones aplican limpio sobre una base vacía (prueba automatizada)
- ✅ RLS activo en las 28 tablas, sin excepciones no intencionales
- ✅ Cliente A no ve pedidos, comprobantes ni perfil de B
- ✅ Un cliente no puede volverse admin, ni mover stock, ni tocar precios
- ✅ El precio del navegador se ignora (estructuralmente: no existe el campo)
- ✅ La última unidad no se vende dos veces
- ✅ El doble clic no crea dos pedidos
- ✅ Confirmar el pago es lo único que baja el stock físico
- ✅ Cancelar antes de cobrar libera la reserva sin tocar el inventario
- ✅ El snapshot del pedido sobrevive a cambios de precio
- ✅ Una variante con historia se desactiva, no se borra
- ✅ Catálogo y ficha muestran exactamente el mismo precio
- ✅ Búsqueda sin acentos funciona ("almohadón" encuentra "Almohadon")
- ✅ La paleta de gráficos fue validada con herramienta, no a ojo
- ✅ Ningún secreto expuesto (`npm run check:secrets`)
- ✅ Cero errores de tipos, cero errores de lint
- ✅ La aplicación compila para producción

**Verificado en un navegador de verdad** (138 pruebas × 6 tamaños, Chromium y WebKit):

- ✅ El botón principal se ve **sin scrollear** en los seis tamaños (punto 125)
- ✅ Cero scroll horizontal en todas las pantallas públicas, incluso a 320 px
- ✅ La barra inferior aparece sólo en celular, con 4 destinos y 44 px de alto
- ✅ El menú lateral abre, cierra con Escape y se cierra al navegar
- ✅ El carrito sobrevive a abrir otra pestaña, y un `localStorage` corrupto no rompe nada
- ✅ `/admin` y `/cuenta` redirigen a quien no inició sesión, con `noindex`
- ✅ Un pedido sin token da 404, no 500
- ✅ Existe "Saltar al contenido" y el foco siempre se ve
- ✅ Un solo `h1` por página y `alt` en toda imagen
- ✅ `robots.txt` y `sitemap.xml` excluyen las zonas privadas
- ✅ **La tienda funciona en Safari/iPhone** (donde la CSP la rompía por completo)
