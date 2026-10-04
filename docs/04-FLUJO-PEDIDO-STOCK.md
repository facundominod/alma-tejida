# Alma Tejida — Flujo de pedido y sistema de stock

> Documento G + H del entregable 211. Puntos 39, 41, 57–74, 108, 162–173.

---

## 1. El problema real

Alma Tejida vende **piezas únicas y tiradas cortas**, y cobra **por transferencia**. Entre que
alguien confirma un pedido y el dinero llega pueden pasar horas o días. En ese hueco:

- otra persona puede comprar la misma última manta;
- el pedido puede caerse y el stock debe volver;
- el precio puede cambiar sin que el pedido viejo se altere.

Todo el diseño de esta sección existe para que **nunca se venda dos veces la misma pieza** y
para que **el inventario jamás quede en un número que no se pueda explicar**.

---

## 2. Los dos números del stock

Cada variante tiene dos columnas, no una:

```
stock     = piezas que están físicamente en el taller
reserved  = piezas comprometidas en pedidos todavía no cobrados
────────────────────────────────────────────────────────────
available = stock - reserved     ← esto es lo que ve el cliente
```

**Ejemplo — Manta Roma, Crudo, 1,50 × 2,00**

| Momento | stock | reserved | disponible | Lo que ve la tienda |
|---|---|---|---|---|
| Ingresan 3 | 3 | 0 | 3 | Disponible |
| Ana pide 1 | 3 | 1 | 2 | Disponible |
| Bruno pide 2 | 3 | 3 | **0** | **Sin stock** |
| Ana transfiere ⇒ admin confirma | **2** | 2 | 0 | Sin stock |
| Bruno nunca paga ⇒ se cancela | 2 | **0** | **2** | Disponible |

Nótese que `stock` sólo bajó cuando hubo **plata confirmada**. La cancelación de Bruno no
tocó el inventario físico: sólo liberó su reserva. El inventario y la contabilidad quedan
siempre explicables (puntos 62, 63, 170).

---

## 3. Toda variación deja rastro (punto 58)

No existe un `UPDATE product_variants SET stock = ...` suelto en ningún lado del código. El
stock se mueve **sólo** a través de funciones SQL que, en la misma transacción, escriben una
fila en `inventory_movements`:

| Tipo | stock | reserved | Cuándo |
|---|---|---|---|
| `initial` | +N | 0 | Se crea la variante |
| `restock` | +N | 0 | Ingreso de mercadería |
| `reserve` | 0 | +N | Se crea un pedido |
| `release` | 0 | −N | Pedido cancelado antes de cobrar |
| `sale` | −N | −N | Se confirma el pago |
| `cancellation` | +N | 0 | Se cancela un pedido **ya cobrado** |
| `adjustment` | ±N | 0 | Corrección manual (rotura, error de conteo, regalo) |

Cada fila guarda `stock_after` y `reserved_after`. Si alguna vez un número parece raro, el
historial se lee como un extracto bancario: cada movimiento con su fecha, su motivo, su autor
y el saldo resultante.

---

## 4. Concurrencia: cómo se impide la venta doble (punto 74)

El patrón prohibido es el obvio:

```
❌  SELECT stock → el navegador decide → UPDATE stock
```

Entre el `SELECT` y el `UPDATE` cabe otro cliente entero. Así se venden dos veces las piezas
únicas.

Lo que hacemos:

```sql
-- dentro de create_order(), una sola transacción
select stock, reserved
  into v_stock, v_reserved
  from product_variants
 where id = v_variant_id
   for update;                        -- ← bloqueo de fila

if (v_stock - v_reserved) < v_qty then
  raise exception 'SIN_STOCK:%', v_variant_id;
end if;

update product_variants
   set reserved = reserved + v_qty
 where id = v_variant_id;
```

`FOR UPDATE` bloquea la fila hasta el fin de la transacción. Dos pedidos simultáneos por la
última unidad se **serializan**: el primero reserva, el segundo lee el estado ya actualizado,
ve 0 disponible y falla limpio con `SIN_STOCK`. El cliente recibe *"Se agotó mientras
completabas el pedido"* y su carrito se actualiza solo.

Las variantes se bloquean **ordenadas por `id`** dentro del pedido. Es el detalle que evita
deadlocks cuando dos pedidos comparten dos productos en orden inverso.

---

## 5. Crear un pedido: una sola función atómica (punto 162)

`public.create_order(...)` es `SECURITY DEFINER` y hace **todo o nada**:

```
 1. Verificar idempotencia         ── si ya existe ese idempotency_key, devolver
                                      el pedido existente. Punto 163 resuelto en
                                      la base, no con un botón deshabilitado.
 2. Cargar el carrito y sus ítems  ── vacío ⇒ error
 3. Revalidar cada producto        ── ¿sigue publicado? ¿sigue activa la variante?
 4. Revalidar promociones          ── ¿siguen vigentes HOY?
 5. Bloquear variantes (FOR UPDATE, ordenadas por id)
 6. Verificar disponible >= cantidad
 7. Calcular precios con effective_price()   ── el precio del navegador se ignora
 8. Reservar stock + inventory_movements('reserve')
 9. Insertar orders (order_number, access_token, totales)
10. Insertar order_items CON SNAPSHOT completo
11. Insertar order_status_history (null → pending)
12. Insertar notification para el admin
13. Marcar el carrito como 'converted'
14. Devolver { order_number, access_token }
```

Si algo falla en el paso 12, **PostgreSQL revierte los 11 anteriores**. No existe el estado
intermedio de "stock reservado pero pedido inexistente". Esa garantía es la razón por la que
esta lógica vive en SQL y no en TypeScript.

### Idempotencia (punto 163)

El cliente genera un UUID **al abrir el checkout** y lo manda con la confirmación.
`orders.idempotency_key` es `UNIQUE`. Doble clic, doble toque en un celular lento, reintento
por señal caída: la segunda llamada encuentra la clave, devuelve el mismo pedido y no crea
nada. El botón deshabilitado del frontend es una cortesía visual; la garantía es la
constraint.

---

## 6. Estados del pedido (punto 61)

Seis estados, ni uno más:

```
   pending ─────────▶ contacted ──────▶ awaiting_payment ──────▶ paid
   (recibido)         (hablamos)        (esperando          (transferencia
       │                   │             transferencia)       confirmada)
       │                   │                   │                  │
       │                   │                   │                  ▼
       │                   │                   │              preparing
       │                   │                   │             (en preparación)
       │                   │                   │                  │
       │                   │                   │                  ▼
       │                   │                   │              delivered ✓
       └───────────────────┴───────────────────┴──────────────────┘
                                   │
                                   ▼
                              cancelled
```

| Estado | Etiqueta al cliente | stock | reserved | ¿Cuenta como venta? |
|---|---|---|---|---|
| `pending` | Pedido recibido | — | +N | ❌ |
| `contacted` | Te contactamos | — | +N | ❌ |
| `awaiting_payment` | Esperando pago | — | +N | ❌ |
| `paid` | Pago confirmado | **−N** | −N | ✅ **sí** |
| `preparing` | Preparando tu pedido | — | — | ✅ |
| `delivered` | Entregado | — | — | ✅ |
| `cancelled` | Cancelado | según de dónde venga | −N | ❌ |

**La línea gruesa está en `paid`.** Ahí y sólo ahí el stock físico baja y el ingreso entra en
la contabilidad. Un pedido pendiente **no es una venta** (punto 170), y el dashboard los
muestra como dos números distintos.

Las transiciones válidas están codificadas en la función `set_order_status()`: no se puede
saltar de `pending` a `delivered`, ni "descancelar" un pedido. Cada cambio escribe en
`order_status_history` con autor y fecha (puntos 144, 169).

---

## 7. La experiencia de compra, de punta a punta

### Cliente

```
Ve la pieza ──▶ elige Color y Medida ──▶ "Última unidad" ──▶ Agregar al carrito
                                                                     │
                     ┌───────────────────────────────────────────────┘
                     ▼
   Carrito ──▶ Checkout: nombre, email, teléfono, forma de entrega
                     │
                     │   (punto 9: SIN OBLIGACIÓN DE CREAR CUENTA)
                     ▼
            [ Confirmar pedido ]
                     │
                     ▼
         ┌────────────────────────────────────────┐
         │  AT-00128                              │
         │  Alias para transferir: almatejida.mp  │
         │  Total: $48.500                        │
         │                                        │
         │  [ Enviar comprobante ]                │
         │  [ Coordinar por WhatsApp ]            │
         └────────────────────────────────────────┘
```

El pedido **ya existe en la base** antes de que WhatsApp entre en escena (punto 68). WhatsApp
es el canal de conversación, no el sistema de registro (punto 69). Si la charla se pierde, el
pedido sigue ahí, con su número, su monto y su stock reservado.

### Invitado vs. cuenta (punto 9)

El checkout pide **nombre, email y teléfono**. Nada más. Al terminar:

> *¿Querés seguir tu pedido más fácil? Creá tu cuenta con este mismo email y AT-00128 va a
> aparecer en "Mis pedidos".*

Un solo campo de contraseña, opcional, después de comprar. La venta nunca se pierde por un
formulario de registro (punto 9), y si el invitado se registra luego con el mismo email, sus
pedidos previos se vinculan automáticamente.

Mientras tanto, el invitado sigue su pedido en
`/pedido/AT-00128?t={access_token}` — el enlace se muestra en pantalla y va en el mensaje de
WhatsApp.

### Administrador

```
Notificación: "Nuevo pedido AT-00128 · $48.500"
        │
        ▼
Abre el pedido ──▶ [Contactar por WhatsApp]  (mensaje ya armado con el detalle)
        │
        ▼
Llega la transferencia ──▶ [Confirmar pago]
        │                        │
        │                        ├─▶ stock −1, reserved −1
        │                        ├─▶ inventory_movements('sale')
        │                        ├─▶ paid_at, paid_by
        │                        ├─▶ notificación al cliente
        │                        └─▶ el dashboard del mes se actualiza
        ▼
[Preparando] ──▶ [Entregado]
```

---

## 8. Cómo se muestra la disponibilidad (punto 56)

El administrador elige por producto qué ve el cliente:

| Modo | Stock 7 | Stock 2 | Stock 0 | Stock 0 + a pedido |
|---|---|---|---|---|
| `exact` | "7 disponibles" | "2 disponibles" | "Sin stock" | "A pedido · ~10 días" |
| `vague` *(por defecto)* | "Disponible" | "Últimas 2 unidades" | "Sin stock" | "A pedido · ~10 días" |
| `hidden` | "Disponible" | "Disponible" | "Sin stock" | "A pedido" |

Para `availability_mode = 'unique_piece'` el texto es siempre **"Pieza única"**, y al
reservarse pasa a **"Vendida"** (punto 41). Es el mensaje correcto para artesanía: no es que
se acabó el stock, es que esa pieza ya tiene dueño.

Cuando algo está agotado pero el administrador lo deja visible (punto 184), aparece
**"Consultar si vuelve"**, que crea una fila en `restock_requests` y le avisa al admin. Sin
sistema de marketing por detrás (punto 185).

---

## 9. Carga de stock desde el celular (puntos 130, 131)

Es el flujo que el administrador va a usar más veces en su vida, así que está diseñado para el
pulgar:

```
Admin ▸ Stock                          [ 🔍 buscar ]

  Manta Roma · Crudo · 1,50×2,00
  Disponible 2   (stock 3 · reservado 1)
  [ −1 ]  [ +1 ]  [ +5 ]  [ Ajustar… ]
  ⚠ Stock bajo

  Gorro Nube · Talle único
  Disponible 8
  [ −1 ]  [ +1 ]  [ +5 ]  [ Ajustar… ]
```

Un toque = un movimiento registrado. Los botones `+1/+5` aplican de inmediato con
actualización optimista y un *deshacer* de 5 segundos. `−1` y `Ajustar…` piden confirmación,
porque restar es lo que duele si se toca sin querer (punto 131). Todo entra por la misma
función `adjust_stock()`: imposible mover inventario sin dejar rastro, ni siquiera desde el
teléfono.

---

## 10. Precio: una sola fuente de verdad (puntos 107, 108, 172)

```sql
effective_price(product_id, variant_id) → (
  base_price,        -- precio de lista (variante puede sobrescribirlo)
  final_price,       -- lo que realmente se paga
  discount_amount,
  promotion_id,      -- qué promoción se aplicó, si alguna
  source             -- 'base' | 'product_sale' | 'promotion'
)
```

Prioridad de resolución, evaluada siempre en este orden:

1. `variants.price_override` si existe ⇒ es el precio base de esa combinación;
2. `products.sale_price` si está vigente hoy;
3. la **mejor promoción activa** que alcance al producto o a su categoría;
4. si hay varias, gana la de mayor descuento para el cliente. Nunca se acumulan.

La catálogo, la ficha, el carrito y `create_order` llaman **a esta misma función**. No hay
segunda implementación en TypeScript que pueda divergir (punto 107).

Y una vez creado el pedido, el descuento queda **congelado en `order_items`** (punto 172). Si
la promoción se apaga mañana, el pedido de hoy conserva su precio, su descuento y el título de
la promoción que se le aplicó.

---

## 11. Contabilidad: pedido ≠ venta (puntos 170, 171)

El dashboard nunca mezcla estos dos números:

| Métrica | Qué cuenta |
|---|---|
| **Pedidos del mes** | Todos los creados, en cualquier estado |
| **Ventas del mes** | Sólo `paid`, `preparing`, `delivered` |
| **Ingresos confirmados** | `SUM(total)` de esos mismos estados |
| **Pendientes de cobro** | `SUM(total)` de `pending` + `contacted` + `awaiting_payment` |
| **Cancelados** | Contados aparte, **nunca sumados a ingresos** |

Los productos más vendidos se calculan desde `order_items` de pedidos cobrados (punto 173),
jamás infiriendo desde el stock: el stock cambia por ajustes, roturas y regalos, y mentiría.
