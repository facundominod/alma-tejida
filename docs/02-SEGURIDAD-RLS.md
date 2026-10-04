# Alma Tejida — Seguridad, permisos y RLS

> Documento E del entregable 211.

---

## 1. Premisa

> **No existe `isAdmin` en el frontend.**

El frontend puede *decidir qué dibuja*, pero no decide qué se permite. Si alguien edita el
JavaScript, cambia una variable en la consola o escribe la URL `/admin/productos` a mano, la
base de datos sigue diciendo que no (puntos 10, 202).

Toda operación crítica —stock, precios, pedidos, promociones, permisos— se valida
**server-side** (punto 158). Las lecturas se filtran por **RLS**. Las escrituras pasan por
**Server Actions** que reverifican el rol contra la base antes de tocar nada.

---

## 2. Roles

| Rol | Origen |
|---|---|
| `anon` | visitante sin cuenta |
| `customer` | asignado automáticamente por trigger al registrarse |
| `admin` | asignado **sólo** por SQL manual o por otro admin; nunca desde la aplicación pública |

Hay un único administrador hoy, pero el rol está modelado como rol (punto 157). **En ningún
lugar del código o de la base existe una comparación contra un email literal.** El día que
haya dos administradores, es un `UPDATE` de una fila.

### Por qué el rol no se lee de `profiles` dentro de las policies

Leer `profiles` desde una policy de `profiles` produce recursión infinita. La solución es una
función `SECURITY DEFINER` con `search_path` fijo:

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
```

`set search_path` es obligatorio: sin él, un usuario podría crear un esquema propio con una
tabla `profiles` falsa y secuestrar la función. Es el error clásico en funciones
`SECURITY DEFINER` y acá está cerrado.

---

## 3. Matriz de permisos

Leyenda: ✅ permitido · ⛔ prohibido · 🔎 filtrado por RLS

| Tabla | `anon` | `customer` | `admin` |
|---|---|---|---|
| `profiles` | ⛔ | 🔎 sólo el propio (no puede cambiarse el `role`) | ✅ |
| `store_settings` | ✅ lectura de campos públicos | ✅ lectura | ✅ |
| `categories` | 🔎 sólo `is_visible` y sin `deleted_at` | ídem | ✅ |
| `products` | 🔎 sólo `status='published'` | ídem | ✅ |
| `product_attributes` / `_values` | 🔎 de productos publicados | ídem | ✅ |
| `product_variants` | 🔎 de productos publicados y `is_active` | ídem | ✅ |
| `product_media` | 🔎 de productos publicados | ídem | ✅ |
| `price_history` | ⛔ | ⛔ | ✅ |
| `promotions` / `_targets` | 🔎 sólo activas y vigentes | ídem | ✅ |
| `carts` / `cart_items` | ⛔ (carrito en `localStorage`) | 🔎 sólo el propio | ✅ |
| `orders` | ⛔ (sólo vía RPC con token) | 🔎 sólo los propios | ✅ |
| `order_items` | ⛔ | 🔎 vía pedido propio | ✅ |
| `order_status_history` | ⛔ | 🔎 vía pedido propio | ✅ |
| `payment_proofs` | ⛔ | 🔎 sólo los propios, INSERT propio | ✅ |
| `inventory_movements` | ⛔ | ⛔ | ✅ |
| `questions` | 🔎 sólo `status='published'` | 🔎 publicadas + las propias; INSERT propio | ✅ |
| `reviews` | 🔎 sólo `status='approved'` | 🔎 aprobadas + las propias; INSERT con compra verificada | ✅ |
| `notifications` | ⛔ | 🔎 `audience='customer' AND user_id = auth.uid()` | ✅ `audience='admin'` |
| `analytics_events` | ✅ INSERT vía RPC acotada | ídem | ✅ lectura |
| `analytics_daily` | ⛔ | ⛔ | ✅ |
| `audit_log` | ⛔ | ⛔ | ✅ lectura (nadie escribe a mano) |
| `favorites` | ⛔ | 🔎 sólo los propios | ✅ |

**Todas las tablas tienen `ENABLE ROW LEVEL SECURITY`**, y ninguna tiene una policy
`USING (true)` para escritura. Una tabla con RLS activo y cero policies deniega todo: ese es
el estado seguro por defecto, y es a propósito — si mañana se agrega una tabla y alguien
olvida su policy, el resultado es "nadie entra", no "entran todos".

Deliberadamente **no** se usa `FORCE ROW LEVEL SECURITY`. Con `FORCE`, RLS aplicaría también
al dueño de la tabla, y eso rompería las funciones `SECURITY DEFINER` de las que depende todo
el núcleo transaccional (`create_order`, `set_order_status`, `apply_stock_movement`), que
necesitan operar por encima de las policies para poder reservar stock y leer carritos ajenos
dentro de una misma transacción. `anon` y `authenticated` no son dueños de ninguna tabla, así
que **para el navegador RLS se aplica siempre**. El único rol que la saltea es `service_role`,
y de ahí la regla de la sección 8: esa clave nunca llega al cliente.

### Sobre el carrito del visitante

RLS no puede distinguir a un anónimo de otro: no hay identidad que comparar. En lugar de
inventar un mecanismo frágil, `anon` **no tiene ningún acceso** a `carts` ni a `cart_items`.
El carrito del visitante vive en `localStorage` (cumple los puntos 71 y 72: sobrevive al
cierre del navegador) y sólo se materializa en la base **en el servidor**, al confirmar el
pedido. Al iniciar sesión, `merge_cart()` lo fusiona con el carrito de la cuenta.

---

## 4. Los cuatro puntos donde la seguridad se juega de verdad

### 4.1 El cliente no puede escalar su propio rol

```sql
create policy "profiles_update_own" on public.profiles
for update to authenticated
using  (id = auth.uid())
with check (
  id = auth.uid()
  and role = (select role from public.profiles where id = auth.uid())
);
```

El `WITH CHECK` compara el rol *entrante* con el rol *guardado*. Un `UPDATE` que intente
poner `role = 'admin'` falla, aunque venga del dueño de la fila.

### 4.2 El precio nunca llega del navegador

El carrito manda **`variant_id` y `quantity`. Nada más.** No hay campo de precio en el
payload; ni siquiera existe en el tipo de TypeScript. La función `create_order` recalcula
todo con `effective_price()` (punto 108). Si el navegador mintiera, no habría dónde escribir
la mentira.

### 4.3 El invitado ve su pedido sin ver los de otros

Un pedido de invitado no tiene `user_id`, así que RLS no puede identificarlo. En lugar de
abrir la tabla, se expone una única función:

```sql
create function public.get_order_public(p_number text, p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
```

Devuelve el pedido **sólo si el número y el `access_token` coinciden**. El token es un UUID v4
de 122 bits: adivinarlo no es una estrategia. La tabla `orders` permanece cerrada a `anon`
(punto 201).

### 4.4 La reseña exige compra verificada

```sql
create policy "reviews_insert_verified" on public.reviews
for insert to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'                    -- nace moderada, nunca aprobada
  and exists (
    select 1 from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = reviews.order_id
      and o.user_id = auth.uid()
      and o.status in ('paid','preparing','delivered')
      and oi.product_id = reviews.product_id
  )
);
```

La base, no la interfaz, garantiza que sólo reseña quien compró (punto 80) y que ninguna
reseña nace publicada (punto 77).

---

## 5. Server Actions: el patrón obligatorio

Toda acción administrativa empieza igual, sin excepción:

```ts
'use server'

export async function updateProductPrice(input: unknown) {
  const data = updatePriceSchema.parse(input)     // 1. Zod valida la forma
  const admin = await requireAdmin()              // 2. verifica contra la BASE
  // 3. recién ahora se toca algo
  ...
  revalidateTag(`producto:${data.productId}`)     // 4. la tienda se actualiza sola
}
```

`requireAdmin()` no lee un JWT ni un estado de React: consulta `profiles` con el cliente del
servidor y lanza si el rol no es `admin`. El cliente con `service_role` sólo se instancia
**después** de que esa verificación pasó.

---

## 6. Autenticación (punto 11)

| Método | Decisión |
|---|---|
| Email + contraseña | ✅ principal — mínimo 8 caracteres, validado en cliente y servidor |
| Magic link | ✅ alternativa, útil en celular donde escribir contraseñas molesta |
| Recuperación de contraseña | ✅ |
| Verificación de email | ✅ obligatoria para reseñar y preguntar; opcional para comprar |
| OAuth social (Google, Facebook) | ⛔ **no en v1** — agrega configuración, pantallas de consentimiento y dependencia de terceros sin resolver ningún problema que hoy exista. La estructura queda lista: activarlo después es configuración de Supabase, no código. |

Las cookies de sesión son `httpOnly`, `secure`, `sameSite=lax`, gestionadas por
`@supabase/ssr` y refrescadas en el middleware.

---

## 7. Protección contra abuso

### Rate limiting (punto 159)

Sin agregar Redis ni servicios pagos: una tabla `rate_limit_hits (key, window_start, count)`
con una función `check_rate_limit(key, max, window)` atómica. La clave combina
acción + `user_id` o hash del IP.

| Acción | Límite |
|---|---|
| Login | 5 intentos / 15 min por email+IP |
| Registro | 3 / hora por IP |
| Crear pedido | 5 / hora por sesión |
| Pregunta | 5 / hora por usuario |
| Reseña | 1 por pedido (por constraint único) |
| Formulario de contacto | 3 / hora por IP |
| Evento de analítica | 120 / min por sesión |

Supabase Auth ya aplica sus propios límites de envío de emails; los nuestros se suman.

### CAPTCHA (punto 160)

**No por defecto en cada formulario.** Se activa Cloudflare Turnstile (invisible, gratuito)
**sólo** en registro y contacto, y **sólo si** aparece abuso real. La integración queda
documentada y detrás de una variable de entorno: encenderla es cambiar un flag.

### Sanitización (punto 161)

Preguntas y reseñas se guardan como **texto plano**, nunca HTML. Se renderizan con
interpolación de React, que escapa por definición. No hay `dangerouslySetInnerHTML` en
contenido de usuario — una regla de ESLint lo impide. La descripción de producto (que sí
escribe el admin) admite Markdown limitado, sanitizado en el servidor.

---

## 8. Secretos (punto 13)

```
NEXT_PUBLIC_SUPABASE_URL            público — es una URL
NEXT_PUBLIC_SUPABASE_ANON_KEY       público por diseño — RLS la contiene
SUPABASE_SERVICE_ROLE_KEY           ⚠️ SERVIDOR ÚNICAMENTE
```

Defensas concretas, no buenas intenciones:

1. `.env*` está en `.gitignore`; sólo se versiona `.env.example` con valores vacíos.
2. El módulo `src/lib/supabase/admin.ts` empieza con `import 'server-only'`: si un componente
   cliente lo importa, **el build falla**.
3. El script `npm run check:secrets` (parte de CI) busca `SERVICE_ROLE` en cualquier archivo
   que contenga `"use client"` y aborta el deploy si aparece.
4. Los logs nunca registran tokens, contraseñas ni claves (punto 145): el logger tiene una
   lista de claves censuradas y reemplaza el valor por `[redactado]`.

---

## 9. Cabeceras y superficie expuesta

`next.config.ts` fija: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` restrictiva y una CSP que sólo habilita los orígenes de Supabase, Vercel
y Google Fonts.

`/admin/*` y `/cuenta/*` emiten `X-Robots-Tag: noindex, nofollow` y están excluidos del
sitemap (punto 206).

---

## 10. Pruebas de seguridad obligatorias (puntos 197, 201, 202)

Estas pruebas corren contra una base real con dos usuarios de prueba y **deben fallar** si
alguien afloja una policy:

1. Cliente A no lee el pedido de B — ni por `select`, ni por RPC con token ajeno.
2. Cliente A no descarga el comprobante de B.
3. Cliente A no lee el `profile` de B.
4. Cliente autenticado no ejecuta ninguna acción administrativa, ni escribiendo la URL.
5. `anon` no lee productos en `draft` ni preguntas sin publicar.
6. Un cliente no puede ponerse `role = 'admin'`.
7. Un cliente no puede insertar en `inventory_movements`.
8. Una reseña sin pedido asociado es rechazada por la base.
9. Un pedido con precio manipulado en el payload se crea igual, **con el precio correcto**.
