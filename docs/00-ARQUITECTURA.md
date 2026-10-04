# Alma Tejida — Arquitectura y Stack

> Documento A + B del entregable previo a la implementación masiva (punto 211).
> Última revisión: 2026-09-19

---

## 1. Principio rector

Alma Tejida es **una tienda artesanal pequeña con ambición de crecer**. La arquitectura
se elige para que:

- hoy corra íntegra en **plan gratuito** (ver `07-LIMITES-PLAN-GRATUITO.md`: Supabase Free
  sirve tal cual; para el hosting hay una decisión pendiente, porque el plan gratuito de
  Vercel no permite tiendas);
- mañana escale **sin reescribir**, sólo subiendo de plan o agregando caché;
- la administre **una sola persona sin conocimientos técnicos**, desde el celular.

Regla que gobierna cada decisión de este documento:

> **SIMPLE > COMPLEJO · OPTIMIZADO > SOBREDIMENSIONADO · SEGURO > IMPROVISADO · ESCALABLE > SOBREARQUITECTADO**

No hay microservicios, ni colas, ni motores de búsqueda externos, ni contenedores.
Hay **una aplicación Next.js y una base de datos Postgres**. Eso alcanza y sobra para
esta etapa, y es lo que menos deuda genera.

---

## 2. Análisis de código previo

Se verificó la carpeta del proyecto antes de comenzar: **no existía código previo**.
Alma Tejida se construye desde cero, sin heredar nombres, componentes, lógica ni
terminología de ningún otro proyecto (punto 191). Todo el vocabulario del código —
tablas, tipos, componentes, tokens — es propio de esta tienda.

---

## 3. Stack elegido

| Capa | Tecnología | Por qué |
|---|---|---|
| Framework | **Next.js (App Router) + React + TypeScript** | Server Components ⇒ el catálogo se renderiza en el servidor, llega HTML liviano y el SEO funciona sin trucos. Server Actions ⇒ mutaciones sin construir una capa de API REST paralela. Es el runtime nativo de Vercel. |
| Estilos | **Tailwind CSS v4 + design tokens en CSS variables** | Tokens declarados una vez en `@theme`; los componentes nunca escriben un color literal. Cero CSS-in-JS ⇒ cero costo en runtime. |
| Animación | **Motion (framer-motion)** | Animaciones sobre `transform`/`opacity` (compositor, 60 fps). Soporta `prefers-reduced-motion` de fábrica. Se importa sólo en componentes cliente concretos, no global. |
| Base de datos | **Supabase Postgres** | Postgres real: constraints, transacciones, triggers, funciones. El stock y los pedidos *necesitan* transacciones reales. |
| Auth | **Supabase Auth** (email+password, magic link, recuperación) | Integrado con RLS: `auth.uid()` está disponible dentro de cada policy. |
| Autorización | **RLS + funciones `SECURITY DEFINER`** | La seguridad vive en la base, no en el frontend. |
| Storage | **Supabase Storage** (3 buckets) | Integrado al mismo sistema de permisos. |
| Validación | **Zod** | Un esquema por formulario, compartido entre cliente y servidor. |
| Formularios | **react-hook-form + @hookform/resolvers** | Validación sin re-render del árbol completo. |
| Gráficos | **Recharts** | Livianos, sólo en el panel admin (no entran al bundle de la tienda). |
| Imágenes | **next/image** + transformación en subida (`sharp`) | WebP/AVIF, `srcset` responsive, lazy loading, thumbnails generados al subir. |
| Tests | **Vitest + PGlite** (PostgreSQL real en memoria) + **Playwright** (E2E) | Las pruebas de RLS, stock y concurrencia corren contra Postgres de verdad, sin Docker. |
| Deploy | **A definir** — ver `07-LIMITES-PLAN-GRATUITO.md` | La app es Next.js estándar: cambiar de hosting es reconfigurar el deploy, no reescribir nada. |

### Lo que deliberadamente NO usamos

- **Sin pasarela de pagos.** El pago se coordina por transferencia (punto 64).
- **Sin ORM pesado (Prisma/Drizzle).** El cliente de Supabase tipado desde el esquema real
  alcanza, y las operaciones críticas viven en funciones SQL. Un ORM encima de RLS agrega
  una capa de indirección que sólo confunde.
- **Sin state manager global (Redux/Zustand) en la tienda.** El estado del servidor lo
  maneja el servidor; el carrito usa un contexto React pequeño + `localStorage`.
- **Sin librería de componentes completa (MUI/Chakra).** Tendrían su propia identidad
  visual y pelearían con la nuestra. Los primitivos (dialog, popover, select) se toman de
  **Radix UI**, que es *headless*: da accesibilidad y foco correcto, y cero estética propia.
- **Sin búsqueda externa (Elastic/Algolia).** Postgres full-text (`tsvector` + `pg_trgm`)
  resuelve un catálogo de esta escala sobradamente.
- **Sin CDN de video pago en v1.** Ver `docs/03-STORAGE.md`.
- **Sin dark mode** (punto 179): la identidad de Alma Tejida es luz cálida sobre lino. Un
  modo oscuro la contradice y duplicaría el trabajo de diseño sin beneficio comercial.

---

## 4. Arquitectura de ejecución

```
                                 ┌──────────────────────────────┐
   Visitante / Cliente ─────────▶│  Next.js (Vercel/Netlify/CF) │
   (móvil, primero)              │                              │
                                 │  ├ Server Components         │  ← catálogo, producto,
                                 │  │   (lectura, cacheada)     │    home: HTML server-side
                                 │  ├ Client Components         │  ← carrito, galería,
                                 │  │   (interacción)           │    filtros, animación
                                 │  └ Server Actions            │  ← mutaciones
                                 └───────────┬──────────────────┘
                                             │  (service role NUNCA sale del servidor)
                                             ▼
                                 ┌──────────────────────────────┐
                                 │  Supabase                    │
                                 │  ├ Postgres + RLS            │
                                 │  ├ Funciones SQL atómicas    │  ← crear_pedido, stock
                                 │  ├ Auth                      │
                                 │  └ Storage (3 buckets)       │
                                 └──────────────────────────────┘
```

### Tres clientes de Supabase, tres niveles de confianza

Esta separación es el corazón del modelo de seguridad (puntos 10, 13, 158):

| Cliente | Dónde vive | Clave | Puede |
|---|---|---|---|
| `createClient()` (navegador) | Navegador | `ANON_KEY` (pública) | Sólo lo que RLS permite al usuario logueado. Se usa para sesión y poco más. |
| `createPublicClient()` | Servidor, **sin cookies** | `ANON_KEY` | Catálogo público. Al no tocar cookies, permite que las rutas se generen estáticas y se sirvan desde el CDN: mil visitas a la misma manta son **una** consulta, no mil. |
| `createClient()` (servidor) | Server Components / Actions | `ANON_KEY` + cookie de sesión | Todo lo que depende de quién mira. **Es el cliente por defecto.** |
| `createAdminClient()` | Sólo Server Actions verificadas | `SERVICE_ROLE_KEY` | Saltea RLS. Se usa **únicamente** después de comprobar `is_admin()` contra la base, y para tareas de sistema (generar thumbnails, agregación de analíticas). |

La `SERVICE_ROLE_KEY` **nunca** lleva el prefijo `NEXT_PUBLIC_`, y un test de CI falla si
aparece referenciada en un archivo marcado `"use client"`.

### Por qué Server Actions y no una API REST

Cada mutación (agregar al carrito, crear pedido, cambiar stock) es una función del servidor
tipada, invocable directamente desde el componente. No hay que inventar rutas, ni serializar
a mano, ni mantener dos definiciones de tipos. Y lo más importante: **el precio, el stock y
los permisos se recalculan siempre en el servidor** (puntos 107, 108), porque el cliente
literalmente no participa del cálculo.

Se reservan rutas `app/api/*` sólo para lo que *necesita* ser HTTP: webhooks, `sitemap.xml`,
imágenes Open Graph dinámicas y el endpoint de analíticas (que usa `sendBeacon`).

---

## 5. Estrategia de renderizado y caché (el motor del rendimiento)

| Ruta | Estrategia | Revalidación |
|---|---|---|
| `/` (Home) | **Estática** + ISR | `revalidate: 300` + `revalidatePath()` al publicar |
| `/categoria/[slug]` | **Pregenerada** (`generateStaticParams`) + ISR | `revalidatePath()` |
| `/producto/[slug]` | **Pregenerada** de los publicados + ISR | `revalidatePath()` |
| `/ofertas` | Estática, ISR corto (`60`) | `revalidatePath()` |
| `/tienda` | **Dinámica** — depende de los filtros de la URL | — |
| `/carrito`, `/checkout` | Dinámica, sin caché | — |
| `/cuenta/*` | Dinámica, `noindex` | — |
| `/admin/*` | Dinámica, `noindex`, sin caché | — |

Cuando el administrador publica un producto o cambia un precio, la Server Action llama a
`revalidatePath()` sobre las rutas afectadas. **La tienda se actualiza al instante**
(punto 190) sin esperar el TTL y sin re-desplegar.

Consecuencia directa: un visitante que entra a un producto recibe **HTML cacheado en el edge
de Vercel**. No espera a Postgres. Esto es lo que hace que la página se sienta instantánea en
un celular con señal mediocre, y además **protege la cuota gratuita de Supabase**: mil
visitas al mismo producto son una sola consulta a la base.

---

## 6. Estructura de carpetas

```
alma-tejida/
├─ docs/                        # estos documentos
├─ supabase/
│  ├─ migrations/               # SQL versionado, en orden (punto 194)
│  └─ seed/                     # datos demo, jamás en producción (punto 195)
├─ src/
│  ├─ app/
│  │  ├─ (tienda)/              # layout público: header, footer, bottom-nav
│  │  │  ├─ page.tsx                     /
│  │  │  ├─ tienda/                      /tienda
│  │  │  ├─ categoria/[slug]/            /categoria/mantas
│  │  │  ├─ producto/[slug]/             /producto/manta-roma
│  │  │  ├─ ofertas/  novedades/  contacto/
│  │  │  ├─ carrito/  checkout/
│  │  │  ├─ pedido/[numero]/             seguimiento (invitado con token)
│  │  │  └─ cuenta/                      pedidos, datos, preguntas, reseñas
│  │  ├─ (auth)/                # ingresar, crear-cuenta, recuperar
│  │  ├─ admin/                 # panel privado, layout propio
│  │  ├─ api/                   # sólo lo que debe ser HTTP
│  │  ├─ sitemap.ts  robots.ts  not-found.tsx
│  ├─ components/
│  │  ├─ ui/                    # primitivos del design system
│  │  ├─ tienda/                # tarjetas, galería, filtros, carrito
│  │  ├─ admin/                 # tablas, formularios, métricas
│  │  └─ motion/                # variantes de animación reutilizables
│  ├─ lib/
│  │  ├─ supabase/              # los 3 clientes
│  │  ├─ queries/               # lecturas tipadas
│  │  ├─ actions/               # Server Actions (mutaciones)
│  │  ├─ validation/            # esquemas Zod
│  │  └─ utils/                 # precio, formato, slug, imágenes
│  ├─ types/database.ts         # generado desde el esquema real
│  └─ styles/                   # tokens y tema
└─ tests/                       # vitest + playwright
```

---

## 7. Entornos (punto 193)

| Entorno | Base | Rama | URL |
|---|---|---|---|
| Desarrollo | Proyecto Supabase `alma-tejida-dev` | local | `localhost:3000` |
| Preview | mismo `dev` | cualquier rama | `*.vercel.app` |
| Producción | Proyecto Supabase `alma-tejida-prod` | `main` | dominio propio |

Regla dura: **la seed nunca apunta a producción.** El script de seed aborta si la URL de
Supabase coincide con la de producción o si `NODE_ENV === 'production'` (punto 195).

---

## 8. Riesgos asumidos y su mitigación

| Riesgo | Mitigación |
|---|---|
| **Vercel Hobby prohíbe el uso comercial** | Detectado al verificar los límites. Tres alternativas gratuitas y una paga, en `07-LIMITES-PLAN-GRATUITO.md`. La decisión es del negocio, no técnica. |
| Plan gratuito: 500 MB de DB, 1 GB de storage | Imágenes optimizadas al subir, cuotas por producto, analíticas agregadas a diario y crudas con TTL de 90 días. Ver `docs/07-LIMITES-PLAN-GRATUITO.md`. |
| Proyecto Supabase Free se pausa a los 7 días sin actividad | Un cron de Vercel hace un ping diario trivial. Documentado. |
| Venta doble de una pieza única | Reserva transaccional con `SELECT … FOR UPDATE` dentro de una función SQL. Ver `docs/04-FLUJO-PEDIDO-STOCK.md`. |
| Un solo admin ⇒ punto único de falla | Exportación CSV de pedidos/ventas/stock (punto 143) y `docs/08-BACKUP-Y-RECUPERACION.md`. |
| Videos consumiendo storage | Límite duro por producto, validación de formato/duración/peso, y evaluación documentada de alternativas antes de crecer. |

---

## 9. Documentos relacionados

| Documento | Entregable (punto 211) |
|---|---|
| `01-MODELO-DE-DATOS.md` | C + D — modelo y diagrama de relaciones |
| `02-SEGURIDAD-RLS.md` | E — permisos y RLS |
| `03-STORAGE.md` | F — estructura de storage |
| `04-FLUJO-PEDIDO-STOCK.md` | G + H — pedido y stock |
| `05-DESIGN-SYSTEM.md` | I — estructura visual e identidad |
| `06-PLAN-IMPLEMENTACION.md` | J — plan por fases |
| `07-LIMITES-PLAN-GRATUITO.md` | Consumos y límites reales, verificados |
| `08-BACKUP-Y-RECUPERACION.md` | Recuperación ante desastre |
| `09-PUESTA-EN-MARCHA.md` | De cero a vendiendo, paso a paso |
| `10-INFORME-FINAL.md` | Estado, qué se verificó y deuda técnica |
