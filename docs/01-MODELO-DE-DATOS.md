# Alma Tejida — Modelo de datos y relaciones

> Documento C + D del entregable 211.
> Implementación: `supabase/migrations/`

---

## 0. Convención de nombres

**Identificadores técnicos en inglés, todo lo que ve el usuario en español.**

Las tablas, columnas, enums y tipos se escriben en inglés (`products`, `order_items`,
`awaiting_payment`). Los textos de interfaz, las URLs y los mensajes están en español
(`/producto/manta-roma`, "Esperando pago"). Motivo: SQL sin acentos ni ñ evita problemas
de encoding y comillas; y la traducción a la interfaz se centraliza en un único mapa de
etiquetas (`src/lib/labels.ts`), que además permite que el administrador cambie
terminología sin tocar la base.

---

## 1. Las cinco decisiones que definen el modelo

### D1 — Todo producto tiene al menos una variante

Aunque sea una pieza única sin opciones, el producto crea **una variante por defecto**
(`is_default = true`, sin valores de atributo). Suena redundante; no lo es.

Sin esta regla habría dos caminos para todo: "stock del producto" y "stock de la variante",
y por lo tanto dos lugares donde equivocarse al reservar, vender, cancelar y contar. Con la
regla, **el stock vive en un solo lugar del universo: `product_variants.stock`**. El carrito
apunta a variantes. Los pedidos apuntan a variantes. Los movimientos de inventario apuntan a
variantes. Un solo camino, imposible de desincronizar.

La interfaz del administrador oculta por completo la palabra "variante" en productos simples
(puntos 40, 41): carga un número de stock y listo. La uniformidad es interna.

### D2 — Atributos dinámicos por producto, nunca columnas fijas

Cada producto **define sus propias características** (puntos 34–37). No existe una columna
`color` ni `talle` en ningún lado.

```
products ──< product_attributes ──< product_attribute_values
                                            │
                       product_variants ──< variant_option_values
```

- "Manta Roma" define `Color` (Crudo, Rosa, Verde) y `Medida` (1,20×1,50 / 1,50×2,00).
- "Gorro Nube" define `Material` y `Talle`.
- "Tapiz Luna" no define nada: es pieza única.

Ninguno de los tres comparte esquema con los otros, y la base no cambia nunca.

### D3 — El pedido guarda una fotografía, no una referencia

`order_items` copia nombre, variante, SKU, precio unitario, descuento e imagen **en el
momento de la compra** (puntos 46, 47, 172). Si mañana sube el precio, se renombra el
producto o se archiva, **el pedido de ayer no se mueve**. Las FK a `products`/`variants`
quedan sólo para poder linkear, y son `ON DELETE SET NULL`.

### D4 — El precio se calcula en un solo lugar: la base

Existe la función SQL `public.effective_price(product_id, variant_id)` y la vista
`v_product_pricing`. El catálogo, la ficha, el carrito y el pedido **consultan la misma
función** (punto 107). Es imposible que muestren números distintos, porque sólo hay una
implementación. Al crear un pedido, la función se vuelve a llamar del lado del servidor y
**el precio que mandó el navegador se descarta** (punto 108).

### D5 — Stock físico y stock reservado son columnas distintas

```
disponible = stock - reserved
```

Nunca se descuenta `stock` al crear un pedido. Se incrementa `reserved`. El `stock` real baja
recién cuando el administrador confirma el pago. Así, un pedido cancelado libera la reserva
sin haber ensuciado jamás el inventario real (puntos 59, 62, 63).

---

## 2. Diagrama de relaciones

```
                          ┌──────────────────┐
                          │  auth.users      │  (Supabase Auth)
                          └────────┬─────────┘
                                   │ 1:1
                          ┌────────▼─────────┐
                          │  profiles        │  role: admin | customer
                          └────────┬─────────┘
                                   │
        ┌──────────────────────────┼───────────────────────────────┐
        │                          │                               │
┌───────▼────────┐        ┌────────▼────────┐            ┌─────────▼────────┐
│  carts         │        │  orders         │            │  notifications   │
│  (user o anon) │        │  AT-00128       │            │  admin|customer  │
└───────┬────────┘        └────────┬────────┘            └──────────────────┘
        │ 1:N                      │ 1:N
┌───────▼────────┐        ┌────────▼────────┐   ┌──────────────────────┐
│  cart_items    │        │  order_items    │   │ order_status_history │
└───────┬────────┘        │  (SNAPSHOT)     │   │ payment_proofs       │
        │                 └────────┬────────┘   └──────────────────────┘
        │                          │
        └──────────┬───────────────┘
                   │ ambos apuntan a
          ┌────────▼──────────┐
          │  product_variants │  stock · reserved · price_override · sku
          └────┬─────────┬────┘
               │         │ N:M vía
               │    ┌────▼──────────────────┐
               │    │ variant_option_values │
               │    └────┬──────────────────┘
               │         │
   ┌───────────▼─────────▼──────────────────────────────────┐
   │  products                                              │
   │  slug · status · availability_mode · base_price        │
   │  rating_avg · rating_count · is_featured               │
   └──┬──────┬──────┬──────┬──────┬──────┬──────┬───────────┘
      │      │      │      │      │      │      │
      │      │      │      │      │      │      └──< favorites
      │      │      │      │      │      └──────────< restock_requests
      │      │      │      │      └─────────────────< reviews      (moderadas)
      │      │      │      └────────────────────────< questions    (moderadas)
      │      │      └───────────────────────────────< price_history
      │      └──────────────────────────────────────< product_media
      │                                                  │
      │                              (opcional) ─────────┘
      │                              media puede atarse a una variante
      │                              o a un valor de atributo ("Verde")
      │
      ├──> categories (self-FK parent_id ⇒ subcategorías listas)
      │
      └──< product_attributes ──< product_attribute_values

   ┌────────────────────┐        ┌──────────────────────┐
   │  promotions        │───────<│  promotion_targets   │──> product | category
   └────────────────────┘        └──────────────────────┘

   ┌────────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
   │ inventory_movements│  │ analytics_events │  │analytics_daily│  │  audit_log  │
   │ (toda variación    │  │ (crudo, TTL 90d) │  │ (agregado)    │  │ (acciones   │
   │  de stock deja     │  │                  │  │               │  │  críticas)  │
   │  rastro)           │  │                  │  │               │  │             │
   └────────────────────┘  └──────────────────┘  └──────────────┘  └──────────────┘

   ┌────────────────────┐
   │  store_settings    │  singleton: marca, WhatsApp, alias, redes, textos, entregas
   └────────────────────┘
```

---

## 3. Tablas

### 3.1 Identidad

#### `profiles`
Espejo de `auth.users` con los datos de negocio.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | `user_role` | `customer` por defecto. **Nunca asignable desde el registro público** (punto 156) |
| `full_name`, `phone` | `text` | |
| `email` | `text` | copia denormalizada para el panel admin |
| `accepts_marketing` | `boolean` | consentimiento explícito (punto 8) |
| `created_at`, `updated_at` | `timestamptz` | |

Se crea automáticamente por trigger `on_auth_user_created`. El trigger fuerza
`role = 'customer'` sin excepción: no existe camino desde el registro público al rol admin.

#### `store_settings`
Fila única (`id = 1`, con CHECK que lo garantiza). Todo lo que el administrador configura sin
tocar código (punto 118): nombre, logo, WhatsApp, teléfono, email, redes (jsonb), datos de
transferencia (jsonb: alias, banco, titular, instrucciones), métodos de entrega (jsonb),
textos del home (jsonb), horarios, política de stock por defecto.

### 3.2 Catálogo

#### `categories`
`id`, `parent_id` (self-FK ⇒ subcategorías preparadas sin complicar la UI, punto 29),
`name`, `slug` (único), `description`, `image_path`, `position`, `is_visible`,
`deleted_at` (soft delete), timestamps.

#### `products`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `category_id` | `uuid` | FK → categories |
| `name`, `slug` | `text` | slug único ⇒ `/producto/manta-roma` (punto 120) |
| `short_description` | `text` | para tarjetas y Open Graph |
| `description` | `text` | ficha completa |
| `status` | `product_status` | `draft` \| `published` \| `archived` (punto 101: se archiva, no se borra) |
| `availability_mode` | `availability_mode` | `in_stock` \| `made_to_order` \| `unique_piece` |
| `lead_time_days` | `int` | tiempo de elaboración para "a pedido" (punto 43) |
| `base_price` | `numeric(12,2)` | precio normal |
| `sale_price` | `numeric(12,2)` | precio promocional propio del producto |
| `sale_starts_at`, `sale_ends_at` | `timestamptz` | vigencia (punto 44) |
| `stock_display` | `stock_display_mode` | `exact` \| `vague` \| `hidden` — el admin decide qué ve el cliente (punto 56) |
| `low_stock_threshold` | `int` | umbral de aviso, override por variante (punto 97) |
| `is_featured`, `featured_position` | | destacados ordenables (puntos 182, 183) |
| `show_when_out_of_stock` | `boolean` | agotado pero visible (punto 184) |
| `rating_avg`, `rating_count` | | mantenidos por trigger sobre reseñas aprobadas (punto 83) |
| `published_at` | `timestamptz` | base del badge "Nuevo" (punto 111) |
| `search_vector` | `tsvector` | generado: nombre + descripción + categoría (punto 32) |
| `deleted_at` | `timestamptz` | soft delete |

#### `product_attributes` / `product_attribute_values`
`product_attributes`: `product_id`, `name`, `type` (`select`\|`text`\|`number`\|`measure`\|`color`),
`position`. `product_attribute_values`: `attribute_id`, `value`, `color_hex` (sólo tipo color),
`position`.

#### `product_variants`

| Columna | Notas |
|---|---|
| `product_id` | |
| `sku` | interno, único por producto |
| `price_override` | `numeric` nullable — sólo si esta combinación cuesta distinto (punto 45) |
| `stock` | físico en mano |
| `reserved` | comprometido en pedidos no cobrados |
| `low_stock_threshold` | nullable ⇒ hereda del producto |
| `is_default` | `true` en la variante única de un producto simple |
| `is_active` | permite descartar combinaciones que no se fabrican (punto 104) |
| `position` | |

Restricciones: `stock >= 0`, `reserved >= 0`, `reserved <= stock`.
Índice único parcial: una sola variante `is_default` por producto.

#### `variant_option_values`
Join `(variant_id, attribute_id, value_id)`. PK compuesta `(variant_id, attribute_id)`:
una variante no puede tener dos colores.

#### `product_media`
`product_id`, `variant_id` (nullable), `attribute_value_id` (nullable — permite "estas fotos
son las verdes", punto 105), `type` (`image`\|`video`), `storage_path`, `thumb_path`, `alt`,
`width`, `height`, `size_bytes`, `duration_seconds`, `position`, `is_cover`.

#### `price_history`
`product_id`, `variant_id`, `old_price`, `new_price`, `changed_by`, `reason`, `created_at`.
Alimentada por trigger ante cualquier cambio de `base_price`, `sale_price` o `price_override`
(punto 46).

### 3.3 Promociones

#### `promotions`
`title`, `description`, `image_path`, `discount_type` (`percent`\|`fixed_price`\|`amount_off`),
`discount_value`, `starts_at`, `ends_at`, `is_active`, `position`, `show_in_hero`,
`cta_label`, `cta_href`. Cero banners hardcodeados (punto 25).

#### `promotion_targets`
`promotion_id` + exactamente uno de `product_id` / `category_id` (CHECK lo obliga). Aplicar a
una categoría alcanza a todos sus productos.

### 3.4 Carrito

#### `carts`
`user_id` (nullable) **o** `anon_token` (text, único) — CHECK exige uno de los dos. `status`
(`active`\|`converted`\|`abandoned`), timestamps.

El carrito del **visitante sin cuenta** vive en `localStorage` y sólo se materializa como
fila en el servidor al confirmar el pedido; `anon` no tiene acceso a esta tabla (ver
`docs/02-SEGURIDAD-RLS.md`). Al iniciar sesión, `merge_cart()` fusiona lo que haya en
`localStorage` con el carrito de la cuenta, sumando cantidades (punto 71).

#### `cart_items`
`cart_id`, `variant_id`, `quantity`. Único `(cart_id, variant_id)`.
**No guarda precio**: el precio se resuelve siempre al leer, con la función central.

### 3.5 Pedidos

#### `orders`

| Columna | Notas |
|---|---|
| `order_number` | `AT-00128` — generado por secuencia, legible para humanos (punto 164) |
| `access_token` | `uuid` — permite a un invitado seguir su pedido sin cuenta (punto 9) |
| `user_id` | nullable: se puede comprar como invitado |
| `customer_name/email/phone` | mínimo indispensable (punto 115) |
| `delivery_method` | clave de un método configurado en `store_settings` |
| `shipping_address` | `jsonb` nullable |
| `status` | `order_status` |
| `subtotal`, `discount_total`, `total` | calculados **en el servidor** |
| `customer_note` | del cliente |
| `internal_note` | sólo admin, invisible al cliente (punto 167) |
| `idempotency_key` | `text` único — el doble clic no crea dos pedidos (punto 163) |
| `paid_at`, `paid_by` | quién y cuándo confirmó la transferencia (punto 169) |
| `cancelled_at`, `cancel_reason` | |

#### `order_items`
El snapshot de D3: `product_id`/`variant_id` (SET NULL), y copias literales de
`product_name`, `product_slug`, `variant_label` ("Crudo · 1,50 × 2,00"), `sku`, `unit_price`,
`unit_compare_price`, `discount_amount`, `quantity`, `line_total`, `image_url`,
`promotion_id`, `promotion_title`.

#### `order_status_history`
`order_id`, `from_status`, `to_status`, `changed_by`, `note`, `created_at`. Alimenta el
timeline del cliente (punto 114) y la trazabilidad del admin (punto 144).

#### `payment_proofs`
`order_id`, `storage_path`, `uploaded_by`, `file_size`, `mime_type`, `status`, `created_at`.
Bucket **privado**, sólo accesible por el dueño del pedido y el admin (puntos 66, 140).

### 3.6 Inventario

#### `inventory_movements`
**Ninguna variación de stock ocurre sin dejar rastro** (punto 58).

| Columna | Notas |
|---|---|
| `variant_id` | |
| `movement_type` | `initial`\|`restock`\|`sale`\|`reserve`\|`release`\|`adjustment`\|`cancellation` |
| `stock_delta` | cambio en stock físico |
| `reserved_delta` | cambio en stock reservado |
| `stock_after`, `reserved_after` | estado resultante — permite auditar sin recalcular |
| `order_id` | nullable, si el movimiento nace de un pedido |
| `note`, `created_by`, `created_at` | |

### 3.7 Interacción

#### `questions`
`product_id`, `user_id` (nullable), `author_name`, `body`, `answer`, `answered_at`,
`answered_by`, `status` (`pending`\|`answered`\|`published`\|`hidden`), `created_at`.
**Nace privada.** Sólo pasa a `published` si el administrador lo decide (puntos 76, 77).

#### `reviews`
`product_id`, `order_id` (FK ⇒ compra verificada, punto 80), `user_id`, `rating` (CHECK 1–5),
`body`, `status` (`pending`\|`approved`\|`hidden`), `admin_reply`, `hidden_reason`.
Único `(user_id, product_id, order_id)`: una reseña por compra.

#### `favorites` · `restock_requests`
Preparadas (puntos 185, 186). `favorites(user_id, product_id)`.
`restock_requests(product_id, variant_id, email, user_id, notified_at)`.

### 3.8 Sistema

#### `notifications`
`audience` (`admin`\|`customer`), `user_id` (null ⇒ para el admin), `type`, `title`, `body`,
`link`, `entity_type`, `entity_id`, `group_key`, `read_at`, `created_at`.
`group_key` evita 15 alertas por una sola compra (punto 99): los eventos del mismo pedido
comparten clave y se muestran agrupados.

#### `analytics_events` (crudo) y `analytics_daily` (agregado)
`analytics_events`: `event_type`, `product_id`, `variant_id`, `category_id`, `media_id`,
`session_id`, `metadata` jsonb, `created_at`, `event_day` (generada, inmutable).

**Dedupe real** (punto 174): índice único parcial sobre `(session_id, product_id, event_day)`
para `event_type = 'product_view'`. Apretar F5 cincuenta veces suma **una** visita.

Un trigger hace `upsert` sobre `analytics_daily(day, event_type, product_id, category_id,
count)`. El dashboard lee **sólo la tabla agregada** (punto 94); la cruda existe para
drill-down y se purga a los 90 días.

Eventos registrados (puntos 91, 92, 95, 96):
`product_view`, `gallery_image_view`, `video_play`, `category_view`, `add_to_cart`,
`checkout_started`, `order_created`, `order_paid`, `search`, `whatsapp_click`.

`gallery_image_view` se dispara **cuando la imagen se muestra de verdad** (al abrirla o al
quedar activa ≥ 800 ms), no en cada render (punto 95).

#### `audit_log`
`actor_id`, `action`, `entity_type`, `entity_id`, `before` jsonb, `after` jsonb, `created_at`.
Se escribe en cambios de precio, stock, promoción y estado de pedido (punto 144).
Los jsonb se filtran para que **jamás** contengan tokens ni credenciales (punto 145).

---

## 4. Índices (sólo los que responden a consultas reales — punto 136)

```sql
products (slug) UNIQUE                      -- ficha de producto
products (status, published_at DESC)        -- catálogo y "nuevos"
products (category_id) WHERE status='published'
products USING GIN (search_vector)          -- búsqueda
products USING GIN (name gin_trgm_ops)      -- búsqueda tolerante a tipeo
products (is_featured, featured_position) WHERE is_featured
categories (slug) UNIQUE · categories (parent_id, position)
product_variants (product_id) · (product_id) UNIQUE WHERE is_default
product_media (product_id, position) · (variant_id) · (attribute_value_id)
orders (user_id, created_at DESC) · (status, created_at DESC) · (order_number) UNIQUE
orders (idempotency_key) UNIQUE
order_items (order_id) · (product_id)       -- ranking de más vendidos
inventory_movements (variant_id, created_at DESC)
questions (product_id, status) · (status) WHERE status='pending'
reviews (product_id, status) · (user_id)
notifications (audience, read_at, created_at DESC)
analytics_daily (day DESC, event_type)
promotions (is_active, starts_at, ends_at)
```

---

## 5. Integridad y consistencia

- **Foreign keys en todas las relaciones** (punto 135). Ninguna relación se guarda como texto
  suelto.
- `ON DELETE CASCADE` donde el hijo no tiene sentido solo (items de carrito, valores de
  atributo). `ON DELETE SET NULL` donde el histórico debe sobrevivir (`order_items`).
- **`created_at` / `updated_at` en todas las tablas de negocio** (punto 137), con
  `updated_at` mantenido por trigger — nunca a mano.
- **Soft delete (`deleted_at`) sólo donde aporta**: productos, categorías, media (punto 138).
  Movimientos de stock, pedidos y auditoría **no** se borran nunca, ni suave ni fuerte.
- CHECKs que hacen imposible un estado inválido: `stock >= 0`, `reserved <= stock`,
  `rating BETWEEN 1 AND 5`, `quantity > 0`, `sale_price < base_price`,
  `promotion_targets` con exactamente un destino, `carts` con exactamente un dueño.

---

## 6. Datos demo (punto 192)

Toda fila creada por la seed lleva `metadata->>'demo' = 'true'` o pertenece a un
`category.slug` prefijado `demo-`. El script `npm run seed:clean` los elimina en bloque y
purga los eventos de analíticas asociados, para que las métricas reales arranquen limpias.

### Nombre de usuario (migración 0015)

`profiles.username` existe para **entrar**; `profiles.email` sigue siendo la **identidad**
y la única vía de recuperación. Son dos cosas distintas a propósito: sin correo, quien
olvida su contraseña no la recupera nadie.

- Índice único sobre `lower(username)`, parcial: dos cuentas sin nombre no chocan.
- El formato prohibe la arroba. Eso es lo que permite decidir, al entrar, si lo escrito
  es un nombre o un correo sin preguntarlo.
- `email_for_username()` traduce uno en otro. Es `security definer` y **sólo la ejecuta
  `service_role`**: si `anon` pudiera, cualquiera juntaría los correos de la clientela
  probando nombres, que es justo lo que el nombre de usuario debería evitar.
- `reserved_usernames` impide que alguien se registre como `soporte` o `almatejida` y
  responda preguntas pareciendo la tienda.
