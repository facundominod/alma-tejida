# Alma Tejida — Backup y recuperación

> Punto 207. **Verificado el 19/09/2026: el plan Free de Supabase NO incluye backups
> automáticos.** Los backups diarios aparecen recién en el plan Pro.
>
> Eso significa que la recuperación de Alma Tejida **depende de lo que está escrito acá**.
> No hay una red de seguridad automática debajo.

---

## Qué hay que poder recuperar

| Qué | Dónde vive | Si se pierde |
|---|---|---|
| Pedidos y ventas | Postgres | **Irrecuperable.** Es el historial comercial. |
| Productos, precios, stock | Postgres | Se puede rehacer, pero son horas de trabajo. |
| Fotos y videos | Supabase Storage | Irrecuperable si no están en otro lado. |
| Cuentas de clientes | `auth.users` | Se pueden volver a crear, pero se pierden los vínculos. |
| Configuración de la tienda | Postgres (una fila) | Diez minutos de trabajo. |

Los pedidos son lo único verdaderamente insustituible. El resto es tiempo.

---

## Plan de backup

### 1. Exportación semanal desde el panel (lo mínimo, y lo importante)

El panel expone tres exportaciones en CSV (punto 143), construidas sobre las vistas
`v_orders_export`, `v_sales_export` y `v_stock_export`:

- **Pedidos** — número, fecha, cliente, estado, totales;
- **Ventas por producto** — cada línea vendida con su precio congelado;
- **Stock** — existencias por variante.

> **La rutina:** todos los lunes, descargar los tres y guardarlos en Drive o en el disco.
> Son tres clics. Es lo que hace que un desastre sea un mal día y no el fin del negocio.

### 2. Volcado completo de la base (mensual)

Con el CLI de Supabase, desde cualquier computadora:

```bash
npx supabase db dump --db-url "postgresql://postgres:[CONTRASENA]@[HOST]:5432/postgres" -f respaldo-$(date +%Y-%m-%d).sql
```

Guarda esquema y datos. Es el backup que permite reconstruir **todo** en un proyecto nuevo.

> Ese archivo contiene los datos personales de los clientes. Guardalo cifrado o en una
> carpeta privada, nunca en un repositorio ni en una carpeta compartida.

### 3. Multimedia (mensual)

Las fotos del bucket `catalog` son públicas, así que se bajan con cualquier cliente de S3
o con el script incluido:

```bash
npm run backup:media
```

Descarga todo a `respaldos/media/` respetando la estructura `products/{id}/`.

**Y además:** las fotos originales que el administrador sacó con el celular siguen estando
en el celular. Esa es, en la práctica, la mejor copia de seguridad de la multimedia.

### 4. Código y esquema

El repositorio de Git es el backup del código. Las migraciones de `supabase/migrations/`
son el backup del **esquema**: aplicadas en orden sobre una base vacía, reconstruyen la
estructura completa. Eso está verificado por un test que corre en cada commit
(`tests/db/schema.test.ts`).

---

## Cómo recuperar

### Caso A — Se borró algo por error (lo más probable)

La mayoría de los borrados de Alma Tejida **no son borrados**:

| Entidad | Qué pasa al "borrar" | Cómo se recupera |
|---|---|---|
| Producto | `deleted_at`, sigue en la base | `update products set deleted_at = null where id = '...'` |
| Producto con ventas | No se puede borrar: se archiva | Cambiar el estado a `published` |
| Categoría | Soft delete | Igual que producto |
| Variante con historia | Se desactiva, no se borra | `update product_variants set is_active = true where id = '...'` |
| Pedido | **No se borra nunca** | No hace falta |
| Movimiento de stock | **No se borra nunca** | No hace falta |

Esto fue a propósito: lo que se puede deshacer con un `UPDATE` no necesita un backup.

### Caso B — Un stock quedó mal

No hace falta restaurar nada: `inventory_movements` guarda cada movimiento con su saldo
resultante. Se lee el historial de esa variante, se encuentra dónde se desvió, y se corrige
con un ajuste (que a su vez queda registrado).

### Caso C — Se perdió el proyecto de Supabase entero

1. Crear un proyecto nuevo.
2. Aplicar las migraciones: `npx supabase db push`.
3. Restaurar el volcado: `psql "[URL_NUEVA]" -f respaldo-AAAA-MM-DD.sql`.
4. Subir la multimedia desde `respaldos/media/`.
5. Volver a designar el administrador (ver más abajo).
6. Actualizar `NEXT_PUBLIC_SUPABASE_URL` y las claves en el hosting.

**Tiempo estimado: 1 a 2 horas.** Se pierde lo ocurrido entre el último volcado y el
desastre — de ahí que las exportaciones semanales importen tanto.

### Caso D — El administrador perdió el acceso

El rol `admin` no se asigna nunca desde la aplicación (punto 156). Se otorga con SQL, desde
el editor del panel de Supabase:

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'tu@correo.com');
```

Quien tenga acceso al panel de Supabase puede recuperar el acceso al panel de Alma Tejida.
Por eso las credenciales de Supabase son, en los hechos, la llave maestra: guardalas con el
mismo cuidado que las del banco.

### Caso E — El proyecto se pausó por inactividad

El plan Free pausa un proyecto tras **una semana sin actividad**. No se pierde nada: se
reactiva desde el panel de Supabase y tarda unos minutos.

El cron diario `/api/cron/ping` existe justamente para que esto no pase nunca.

---

## Rutina recomendada

| Cada | Qué |
|---|---|
| Semana | Descargar los tres CSV del panel |
| Mes | `supabase db dump` + `npm run backup:media` |
| Antes de un cambio grande | Volcado extra |
| Cada tres meses | **Probar la restauración en un proyecto de prueba** |

La última fila es la que más se saltea y la única que de verdad importa: **un backup que
nunca se restauró no es un backup, es un archivo.**

---

## Lo que ya protege el diseño

Antes de necesitar un backup, hay varias capas:

1. **Los pedidos no se borran.** Ni suave ni fuerte. No hay código que lo haga.
2. **Los movimientos de stock no se borran.** El inventario siempre se puede reconstruir.
3. **El snapshot en `order_items`** hace que un pedido viejo sobreviva a que se borre el
   producto.
4. **El soft delete** en productos y categorías convierte casi todo borrado en reversible.
5. **`audit_log`** registra quién cambió qué y cuándo en lo crítico.
6. **Las migraciones versionadas** reconstruyen el esquema desde cero, y hay un test que lo
   comprueba en cada commit.
