# Alma Tejida — Puesta en marcha

De carpeta vacía a tienda funcionando. Tiempo estimado: **30 a 45 minutos.**

---

## 0. Antes de empezar

Necesitás:

- **Node.js 20 o superior** (el proyecto se desarrolló con la 24);
- una cuenta en **[supabase.com](https://supabase.com)** — gratis;
- una cuenta en el hosting que elijas — **leé primero
  [`07-LIMITES-PLAN-GRATUITO.md`](./07-LIMITES-PLAN-GRATUITO.md): el plan gratuito de
  Vercel no permite tiendas.**

```bash
npm install
```

---

## 1. Crear el proyecto de Supabase

1. Entrá a [supabase.com/dashboard](https://supabase.com/dashboard) y creá un proyecto.
2. Elegí la región **South America (São Paulo)**: es la más cercana y se nota en la
   velocidad.
3. Guardá la contraseña de la base donde no se pierda. Supabase no la vuelve a mostrar.

> El plan gratuito permite **2 proyectos activos**. Conviene usar uno para desarrollo y
> otro para producción, y no gastar el cupo en pruebas sueltas.

---

## 2. Variables de entorno

Copiá el ejemplo y completalo:

```bash
cp .env.example .env.local
```

Los valores salen de **Project Settings → API** en el panel de Supabase:

| Variable | Dónde está |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys → `service_role` ⚠️ |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` en local |
| `CRON_SECRET` | Inventalo: `openssl rand -hex 32` |
| `SUPABASE_DB_URL` | **Database → Connection string → URI → Session pooler** ⚠️ |

`SUPABASE_DB_URL` lleva la contraseña de la base adentro. **La aplicación no la usa**: la
usan los dos scripts que crean la base y designan al administrador. Si preferís no
tenerla guardada, borrala de `.env.local` cuando termines de instalar.

Usá el **Session pooler** (puerto 5432), no el Transaction pooler (6543): el segundo no
soporta bien las sentencias que crean funciones, y buena parte de la lógica de esta
tienda son funciones.

> ⚠️ **La `service_role` saltea toda la seguridad de la base.** Va sólo en `.env.local` y
> en las variables del hosting. Nunca en el código, nunca en Git, nunca en un mensaje.

---

## 3. Aplicar las migraciones

```bash
npm run db:aplicar
```

Eso crea las tablas, los índices, las políticas de RLS, las funciones y los tres buckets
de Storage, en orden, y al terminar cuenta qué quedó:

```
  Tablas            29
  Con RLS activo    29
  Políticas         56
  Buckets           3
```

**Si alguna tabla queda sin RLS, el script falla a propósito.** Una tabla en `public` sin
RLS es una tabla que cualquiera con la anon key puede leer entera, y la anon key es
pública por diseño.

Lleva su propio registro en `public._migraciones`: correrlo dos veces no hace nada la
segunda vez. Eso permite agregar una migración más adelante y volver a correrlo sin
pensar, y cada archivo va en su propia transacción —si uno falla queda entero sin
aplicar, no a medias—.

### Las otras dos formas

Con el CLI de Supabase, si ya lo usás:

```bash
npx supabase login
npx supabase link --project-ref TU-REF-DE-PROYECTO
npm run db:push
```

Y sin instalar nada ni guardar la contraseña en ningún lado, pegando el SQL a mano:

```bash
npm run sql:armar
```

Eso genera `supabase/migraciones-todo-junto.sql` con las 14 migraciones en orden. Abrí
el **SQL Editor** del panel de Supabase (→ *New query*), pegá el archivo entero y dale
**Run**. Tarda unos segundos y deja la base completa.

Ese archivo se regenera, no se edita: cualquier cambio va en la migración que corresponda
y después se vuelve a correr `npm run sql:armar`.

### Comprobar que salió bien

```bash
npm run test
```

Las 73 pruebas levantan un PostgreSQL en memoria, aplican las mismas migraciones y
verifican RLS, precios, stock, pedidos y el editor de productos. Si pasan, el esquema
está bien.

---

## 4. Crear tu cuenta y hacerte administrador

**Esto es a propósito el único paso manual del sistema.** El rol `admin` no se puede
obtener desde la aplicación, ni registrándose, ni manipulando el navegador (punto 156).

1. Arrancá la app: `npm run dev`
2. Entrá a `http://localhost:3000/crear-cuenta` y registrate con tu correo real y **una
   contraseña que elegís vos**. Nadie más la ve, ni queda escrita en ningún lado:
   Supabase guarda su hash, no la clave.
3. Confirmá el correo (llega un mail de Supabase).
4. Desde la terminal:

```bash
npm run admin -- tu@correo.com
```

5. Recargá la página. `/admin` ya está disponible.

Ese script pide `SUPABASE_DB_URL`, o sea la contraseña de la base. Es justamente lo que
hace que el paso sea seguro: desde el navegador no hay forma de llegar ahí. Si preferís
hacerlo a mano, es la misma línea en el SQL Editor:

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'tu@correo.com');
```

---

## 5. Configurar la tienda

Andá a **`/admin/configuracion`** y completá, como mínimo:

- nombre y frase de la marca;
- **WhatsApp** (con código de país, sin signos: `5493511234567`);
- **alias y titular** para las transferencias;
- al menos una **forma de entrega**.

Sin esos cuatro, la tienda funciona pero nadie puede terminar una compra.

---

## 6. Cargar la primera pieza

En **`/admin/productos/nuevo`**:

1. **Información** — nombre, categoría, descripción.
2. **Precio** — el normal; el promocional si corresponde.
3. Guardar. Se abre el editor completo.
4. **Fotos** — arrastralas o sacalas con la cámara del celular. Se optimizan solas.
5. **Características** (si la pieza tiene variantes):
   `+ Agregar característica` → *Color* → opciones *Crudo, Rosa, Verde*
   `+ Agregar característica` → *Medida* → opciones *1,20 × 1,50*, *1,50 × 2,00*
   → **Generar combinaciones** → borrá las que no fabricás → **Guardar**.
6. **Stock** — en `/admin/stock`, cargá las unidades de cada combinación.
7. **Publicar** — desde el botón de arriba a la derecha.

La pieza aparece en la tienda **al instante**.

---

## 7. Datos de prueba (opcional, sólo en desarrollo)

```bash
npm run seed         # carga 6 productos, 4 categorías y una promoción
npm run seed:clean   # los borra, junto con sus analíticas
```

Todo lo que crea lleva el prefijo `demo-`, y el script **se niega a correr** si la URL
apunta a producción (punto 195).

---

## 8. Publicar

### 8.1 Elegir dónde

Leé [`07-LIMITES-PLAN-GRATUITO.md`](./07-LIMITES-PLAN-GRATUITO.md) antes de decidir.
Resumen: **Vercel Hobby prohíbe el uso comercial**; Netlify Free y Cloudflare Workers Free
no.

### 8.2 Variables en el hosting

Cargá las mismas cinco de `.env.local`, cambiando:

- `NEXT_PUBLIC_SITE_URL` → tu dominio real;
- las claves de Supabase → las del proyecto de **producción**.

### 8.3 Configurar Supabase para producción

En **Authentication → URL Configuration**:

- **Site URL**: `https://tudominio.com`
- **Redirect URLs**: `https://tudominio.com/auth/confirmar`,
  `https://tudominio.com/auth/nueva-contrasena`

Sin esto, los enlaces de confirmación llevan a `localhost`.

### 8.4 Tareas programadas

`vercel.json` ya declara las dos:

| Tarea | Cuándo | Para qué |
|---|---|---|
| `/api/cron/limpieza` | 04:00 | Purga analíticas viejas y carritos abandonados |
| `/api/cron/ping` | 11:00 | Evita que Supabase pause el proyecto por inactividad |

En Netlify o Cloudflare se declaran distinto (funciones programadas). Es un archivo, no
código.

### 8.5 Repetir el paso 4

El administrador de producción se designa igual: con SQL, en el proyecto de producción.

---

## 9. Antes de anunciar la tienda

- [ ] `npm run verify` pasa (secretos, tipos, lint, pruebas)
- [ ] `npm run seed:clean` ejecutado en producción (punto 192)
- [ ] Un pedido de prueba de punta a punta, hecho con otro teléfono
- [ ] El WhatsApp abre con el mensaje correcto
- [ ] Compartir un producto en WhatsApp muestra foto, nombre y precio
- [ ] `/admin` redirige a quien no sea administrador
- [ ] Primer backup guardado (ver [`08-BACKUP-Y-RECUPERACION.md`](./08-BACKUP-Y-RECUPERACION.md))
- [ ] Lighthouse móvil en la home y en una ficha de producto

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo en `localhost:3000` |
| `npm run build` | Compilación de producción |
| `npm run verify` | Secretos + tipos + lint + pruebas |
| `npm run test` | Sólo las pruebas |
| `npm run db:push` | Aplica las migraciones |
| `npm run types:generate` | Regenera `src/types/database.ts` desde el esquema real |
| `npm run seed` / `seed:clean` | Datos demo |

---

## Si algo falla

| Síntoma | Causa más probable |
|---|---|
| "Falta SUPABASE_SERVICE_ROLE_KEY" | No está en `.env.local`, o falta reiniciar `npm run dev` |
| `/admin` me echa al inicio | Falta el `update ... set role = 'admin'` del paso 4 |
| La tienda se ve vacía | No hay productos **publicados** (los borradores no se ven, a propósito) |
| Las fotos no cargan | `NEXT_PUBLIC_SUPABASE_URL` no coincide con el `remotePatterns` de `next.config.ts` |
| El enlace del correo va a localhost | Falta configurar Site URL en Supabase (paso 8.3) |
| "row-level security policy" al guardar | Estás con una cuenta que no es admin |
| La tienda no responde después de unos días | El proyecto se pausó; falta el cron de ping |

---

## Las pruebas de navegador

```bash
npm run test:e2e          # los seis tamaños
npm run test:e2e:ui       # con interfaz, para mirarlas correr
```

Corren contra el **build de producción**, que Playwright levanta solo. La primera vez
descarga los navegadores:

```bash
npx playwright install chromium webkit
```

WebKit importa: es el motor de Safari y del iPhone, y ya encontró un error que en Chrome
no se veía (la CSP dejaba la tienda sin JavaScript en iOS).

## La prueba de concurrencia

Es la única que necesita una base real, y la más importante antes de vender:

```bash
TEST_DATABASE_URL="postgresql://postgres:[CLAVE]@[HOST]:5432/postgres" npm run test:concurrency
```

Abre dos conexiones, lanza dos pedidos simultáneos por la última unidad y verifica que
exactamente uno gane. Usá la base de **desarrollo**: crea su propio producto de prueba y lo
borra al terminar, pero no tiene sentido correrla contra producción.
