# Alma Tejida — Estructura de Storage y estrategia multimedia

> Documento F del entregable 211. Puntos 48–54, 139–142.

---

## 1. Tres buckets, tres niveles de acceso

| Bucket | Público | Contenido | Límite por archivo |
|---|---|---|---|
| `catalog` | ✅ sí | Fotos y videos de productos, imágenes de categorías y promociones | 8 MB imagen · 25 MB video |
| `brand` | ✅ sí | Logo, favicon, imágenes del home, Open Graph | 4 MB |
| `receipts` | ⛔ **privado** | Comprobantes de transferencia | 5 MB |

`catalog` y `brand` son públicos a propósito: son exactamente las imágenes que queremos que
Google indexe y que WhatsApp muestre al compartir un producto. Servirlas por URL pública
permite además que el CDN de Vercel las cachee, que es de dónde sale buena parte de la
velocidad.

`receipts` es privado de verdad: el acceso se hace con **URL firmada de 60 segundos**,
generada en el servidor sólo después de comprobar que quien pide es el dueño del pedido o el
administrador (puntos 66, 140).

---

## 2. Organización de archivos (punto 139)

Nada de carpetas arbitrarias. La ruta se deriva siempre del ID de la entidad:

```
catalog/
├─ products/{product_id}/
│  ├─ {media_id}.webp              imagen principal (máx 1600 px, calidad 82)
│  ├─ {media_id}@thumb.webp        480 px  — tarjetas de catálogo
│  ├─ {media_id}@micro.webp        24 px   — placeholder borroso (LQIP)
│  └─ {media_id}.mp4               video, si existe
├─ categories/{category_id}/cover.webp
└─ promotions/{promotion_id}/cover.webp

brand/
├─ logo.png · logo-mark.svg · favicon.ico
├─ og-default.jpg
└─ home/{slot}.webp

receipts/
└─ orders/{order_id}/{proof_id}.{ext}
```

Ventaja concreta: borrar un producto es borrar **un prefijo**. No hay archivos huérfanos
acumulando megabytes en el plan gratuito.

---

## 3. Políticas de Storage

```sql
-- catalog / brand: cualquiera lee
create policy "catalog_public_read" on storage.objects
for select to public using (bucket_id = 'catalog');

-- catalog / brand: sólo el admin escribe
create policy "catalog_admin_write" on storage.objects
for insert to authenticated
with check (bucket_id = 'catalog' and public.is_admin());
-- (update y delete, idéntico)

-- receipts: nadie lee directo. El dueño del pedido puede subir el suyo.
create policy "receipts_owner_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.orders o
    where o.user_id = auth.uid()
      and storage.objects.name like 'orders/' || o.id::text || '/%'
  )
);

create policy "receipts_read_owner_or_admin" on storage.objects
for select to authenticated
using (
  bucket_id = 'receipts' and (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.user_id = auth.uid()
        and storage.objects.name like 'orders/' || o.id::text || '/%'
    )
  )
);
```

El `LIKE` contra el prefijo `orders/{id}/` es lo que impide que un cliente adivine la ruta
del comprobante de otro.

---

## 4. Procesamiento de imágenes (puntos 53, 54)

> **Jamás se guarda la foto original de 12 MB.**

La imagen se procesa **en la subida**, en una Server Action, con `sharp`:

| Derivado | Tamaño | Formato | Uso |
|---|---|---|---|
| principal | máx 1600 px lado mayor | WebP q82 | ficha de producto, zoom |
| `@thumb` | 480 px | WebP q78 | tarjetas de catálogo |
| `@micro` | 24 px | WebP q40, base64 inline | placeholder borroso mientras carga |

Una foto típica de celular (4032×3024, ~4,5 MB) queda en **~180 KB** de principal + ~22 KB de
thumb. **Reducción de ~96 %.** El `@micro` va embebido en la base (`product_media.blur_data`),
así que no cuesta ni una petición.

### ¿Guardar el original?

**No** (punto 54). Con 1 GB de plan gratuito, guardar originales significa ~200 productos en
lugar de ~4.000. El derivado de 1600 px es más que suficiente para cualquier pantalla y para
el zoom. Queda documentado: el día que se quiera imprimir un catálogo físico, la decisión se
revisa junto con un plan pago.

### Entrega

`next/image` con `sizes` explícito en cada contexto, `priority` sólo en el hero y en la
primera imagen de la ficha, `loading="lazy"` en todo lo demás (punto 123). Nunca se sirve la
imagen de 1600 px en una tarjeta de 300 px: esa es exactamente la regla que el punto 53
prohíbe romper.

---

## 5. Video: la decisión honesta (puntos 50–52)

### El cálculo

Supabase Free ofrece **1 GB de storage** y **5 GB de egreso mensual**. Un video de 30 segundos
en 720p pesa ~8 MB.

| Escenario | Storage | Egreso mensual |
|---|---|---|
| 20 productos con video | 160 MB (16 % del bucket) | — |
| Ese mismo video visto 600 veces | — | **4,8 GB ⇒ ~96 % del egreso** |

**El problema del video no es guardarlo. Es servirlo.** Unas pocas centenas de reproducciones
agotan el egreso del mes, y a partir de ahí *toda la tienda* —imágenes incluidas— deja de
cargar. Un video puede tirar abajo el catálogo entero.

### Decisión para v1

Se implementa **almacenamiento propio en Supabase, con límites duros**:

- máximo **1 video por producto**;
- máximo **25 MB** y **45 segundos**;
- sólo MP4 (H.264) y WebM, validado por contenido real, no por extensión;
- `preload="none"` + póster estático ⇒ **el video no descarga un solo byte hasta que la
  persona toca play**. Esto es lo que hace viable la cuota: los 8 MB se gastan únicamente con
  quien realmente quiso ver el video;
- el panel avisa cuando el storage supera el 70 %.

### Alternativas evaluadas y descartadas para v1 (punto 52)

| Opción | Costo | Veredicto |
|---|---|---|
| Supabase Storage | incluido | ✅ **elegido** — sin proveedores nuevos, con límites que lo hacen seguro |
| Cloudflare Stream | USD 5/mes + USD 1/1.000 min | Mejor producto, pero es un plan pago para una tienda que arranca (punto 209) |
| Mux | desde USD 20/mes | Excesivo para esta escala |
| YouTube/Vimeo no listado | gratis | Egreso cero, pero mete branding y sugerencias de terceros en la ficha. Contradice el punto 213. |

El campo `product_media.external_url` ya existe. Migrar a un CDN de video el día que el
egreso apriete es **cambiar dónde apunta una URL**, no rehacer el reproductor (punto 209).

---

## 6. Cuotas (punto 141)

Límites pensados para proteger la cuota sin estorbar al administrador:

| Recurso | Límite | Motivo |
|---|---|---|
| Imágenes por producto | 12 | Más de 12 nadie las mira, y 12 × 200 KB = 2,4 MB |
| Videos por producto | 1 | Egreso |
| Imágenes por variante | 4 | |
| Comprobantes por pedido | 3 | |
| Tamaño de subida | 8 MB imagen / 25 MB video | Antes de procesar |

Se validan **en el servidor** (una Server Action cuenta las filas existentes antes de
aceptar), no sólo en el formulario.

---

## 7. Monitoreo de uso (punto 142)

El panel admin muestra, discretamente en Configuración:

```
Almacenamiento     ▓▓▓▓▓▓▓░░░░░░░░░   312 MB / 1 GB   (31 %)
                   Imágenes 248 MB · Videos 58 MB · Comprobantes 6 MB
```

El dato sale de sumar `product_media.size_bytes` (que ya guardamos al subir), no de recorrer
el bucket: es exacto, instantáneo y no consume API. Por encima del 70 % aparece un aviso en el
centro de notificaciones; por encima del 90 %, la subida de videos se bloquea y el mensaje
explica por qué. Sin sorpresas (punto 142).

---

## 8. Limpieza

- Borrar un producto borra su prefijo completo en `catalog`.
- Los comprobantes de pedidos entregados hace más de **12 meses** se purgan con un cron
  mensual; el pedido conserva el registro de que hubo comprobante y su fecha.
- Un cron semanal detecta archivos huérfanos (presentes en el bucket, ausentes en
  `product_media`) y los reporta al panel. No los borra solo: los informa.
