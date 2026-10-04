# Alma Tejida

> Creaciones que unen arte y esencia.

Tienda online de productos artesanales y tejidos. Next.js + Supabase, pensada para
funcionar en plan gratuito y para que la administre una sola persona desde el celular.

---

## Arrancar

```bash
npm install
cp .env.example .env.local   # completar con los datos de Supabase
npm run db:push              # aplicar las migraciones
npm run dev
```

Guía completa paso a paso: **[`docs/09-PUESTA-EN-MARCHA.md`](./docs/09-PUESTA-EN-MARCHA.md)**

> ⚠️ **Antes de publicar**, leé
> [`docs/07-LIMITES-PLAN-GRATUITO.md`](./docs/07-LIMITES-PLAN-GRATUITO.md): el plan
> gratuito de Vercel **no permite tiendas**. Hay alternativas gratuitas que sí.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo en `localhost:3000` |
| `npm run build` | Compilación de producción |
| `npm run verify` | Secretos + tipos + lint + pruebas |
| `npm run test` | 73 pruebas contra un PostgreSQL real, en memoria |
| `npm run test:e2e` | 138 pruebas de navegador en seis tamaños (Chromium y WebKit) |
| `npm run test:concurrency` | Dos conexiones reales por la última unidad (necesita `TEST_DATABASE_URL`) |
| `npm run db:push` | Aplica las migraciones |
| `npm run types:generate` | Regenera los tipos desde el esquema real |
| `npm run seed` · `seed:clean` | Datos de demostración |

---

## Cómo está organizado

```
docs/                 los 11 documentos del proyecto
supabase/
  migrations/         14 migraciones versionadas
  seed/               datos demo (jamás tocan producción)
src/
  app/
    (tienda)/         tienda pública
    (auth)/           ingresar, crear cuenta, recuperar
    admin/            panel privado
    api/              analíticas y cron
  components/
    ui/               primitivos del design system
    tienda/  admin/   componentes de cada zona
  lib/
    supabase/         los tres clientes
    queries/          lecturas
    actions/          mutaciones (Server Actions)
tests/db/             pruebas de base de datos
```

---

## Las decisiones que explican el resto

1. **Todo producto tiene al menos una variante.** El stock vive en un solo lugar:
   `product_variants.stock`. Imposible desincronizar.
2. **Los atributos son dinámicos.** No existe una columna `color` ni `talle`: cada pieza
   define sus características.
3. **El pedido guarda una fotografía, no una referencia.** Cambiar un precio hoy no altera
   un pedido de ayer.
4. **El precio se calcula en un solo lugar:** la función SQL `effective_price()`. Catálogo,
   ficha, carrito y pedido llaman a la misma.
5. **Stock físico y reservado son columnas distintas.** El inventario real sólo baja cuando
   hay plata confirmada.
6. **La seguridad vive en la base.** RLS en las 28 tablas. No existe `isAdmin` en el
   frontend.

---

## Documentación

| Documento | De qué trata |
|---|---|
| [00 · Arquitectura](./docs/00-ARQUITECTURA.md) | Stack, estructura, caché, entornos |
| [01 · Modelo de datos](./docs/01-MODELO-DE-DATOS.md) | 27 tablas, relaciones, índices |
| [02 · Seguridad y RLS](./docs/02-SEGURIDAD-RLS.md) | Permisos, policies, secretos |
| [03 · Storage](./docs/03-STORAGE.md) | Buckets, imágenes, la decisión sobre video |
| [04 · Pedido y stock](./docs/04-FLUJO-PEDIDO-STOCK.md) | Reservas, estados, concurrencia |
| [05 · Design system](./docs/05-DESIGN-SYSTEM.md) | Paleta, tipografía, movimiento, microcopy |
| [06 · Plan de implementación](./docs/06-PLAN-IMPLEMENTACION.md) | Las 15 fases |
| [07 · Límites del plan gratuito](./docs/07-LIMITES-PLAN-GRATUITO.md) | **Verificados, no asumidos** |
| [08 · Backup y recuperación](./docs/08-BACKUP-Y-RECUPERACION.md) | Qué hacer si algo se pierde |
| [09 · Puesta en marcha](./docs/09-PUESTA-EN-MARCHA.md) | De cero a vendiendo |
| [10 · Informe final](./docs/10-INFORME-FINAL.md) | Estado, qué se verificó, deuda técnica |
