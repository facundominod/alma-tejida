# Alma Tejida — Plan de implementación

> Documento J del entregable 211. Corresponde a las fases del punto 210.

---

## Orden y criterio

Cada fase deja algo **funcionando de punta a punta**, no una capa horizontal a medio hacer.
El criterio para dar una fase por cerrada es siempre el mismo: *¿se puede usar de verdad?*

| Fase | Contenido | Se considera lista cuando… |
|---|---|---|
| **1 · Arquitectura** | Stack, modelo de datos, seguridad, design system | Los 8 documentos de `docs/` están escritos y el proyecto compila |
| **2 · Supabase** | Migraciones, enums, tablas, índices, RLS, funciones SQL, buckets | Las migraciones aplican limpio sobre una base vacía; los tests de RLS pasan |
| **3 · Identidad** | Tokens, tipografías, primitivos de UI, layout, header, footer, bottom-nav, loader, 404 | La cáscara de la tienda se ve y se navega, sin datos |
| **4 · Catálogo** | Categorías, productos, multimedia, home, `/tienda`, ficha, búsqueda, filtros | Un producto cargado a mano se ve en home, catálogo y ficha |
| **5 · Variantes** | Atributos dinámicos, generación de combinaciones, stock por variante | Se elige Color + Medida y el precio y la disponibilidad responden |
| **6 · Carrito** | Invitado (localStorage) + cliente (base), fusión al iniciar sesión | El carrito sobrevive al cierre del navegador y se fusiona al loguearse |
| **7 · Pedidos** | `create_order`, reservas, estados, comprobante, WhatsApp | Un pedido real reserva stock y es idempotente ante doble clic |
| **8 · Clientes** | Auth completa, Mi cuenta, historial, seguimiento de invitado | Cliente y admin entran, y A no ve nada de B |
| **9 · Interacción** | Preguntas y reseñas con moderación | Pregunta → notificación → respuesta → publicación |
| **10 · Admin** | Productos, pedidos, stock móvil, categorías, promociones, configuración | El admin gestiona todo el negocio desde el celular |
| **11 · Analíticas** | Eventos, agregación diaria, dashboard, embudo, exportación CSV | El dashboard responde las 7 preguntas del punto 85 |
| **12 · Notificaciones** | Centro interno admin + cliente, agrupación, badges | Un pedido genera **una** notificación, no quince |
| **13 · SEO y performance** | Metadata, OG, sitemap, robots, datos estructurados, Lighthouse | Compartir un producto en WhatsApp muestra foto, nombre y precio |
| **14 · QA** | Seguridad, responsive, compra completa, concurrencia | La suite pasa, incluido el test de última unidad simultánea |
| **15 · Deploy** | Vercel, variables por entorno, dominio, backups | La tienda está en línea con datos reales y sin datos demo |

---

## Dependencias reales

```
1 ──▶ 2 ──┬──▶ 3 ──▶ 4 ──▶ 5 ──▶ 6 ──▶ 7 ──┬──▶ 9  ──┐
          │                                 │         ├──▶ 13 ──▶ 14 ──▶ 15
          └──────────────▶ 8 ───────────────┴──▶ 10 ──┤
                                                 │    │
                                                 └─▶ 11 ─▶ 12
```

La fase 2 bloquea todo lo demás: sin el esquema y las policies no hay nada que consultar.
Las fases 9 y 11 pueden ir en paralelo con la 10.

---

## Reglas que no se negocian durante la implementación

1. **Ninguna migración se edita después de aplicada.** Se agrega una nueva (punto 194).
2. **Ninguna mutación sin `requireAdmin()` o sin RLS que la cubra.**
3. **Ningún precio calculado en TypeScript.** Siempre `effective_price()`.
4. **Ningún `UPDATE` directo sobre `product_variants.stock`.** Siempre la función de stock.
5. **Ningún color literal en un componente.** Siempre un token.
6. **Ningún dato de demostración en producción** (punto 192).
7. **Ningún commit con `SERVICE_ROLE` fuera de `src/lib/supabase/admin.ts`.**

---

## Estado actual

Fases 1 a 13 **construidas y verificadas**. Ver [`10-INFORME-FINAL.md`](./10-INFORME-FINAL.md).

- [x] **Fase 1 — Arquitectura** · 11 documentos, stack elegido y justificado
- [x] **Fase 2 — Supabase** · 14 migraciones, 27 tablas, RLS, funciones atómicas, 3 buckets
- [x] **Fase 3 — Identidad** · tokens, tipografías, primitivos, layout, loader de hilo, 404
- [x] **Fase 4 — Catálogo** · home, tienda, categorías, ficha, búsqueda, filtros
- [x] **Fase 5 — Variantes** · atributos dinámicos, generación de combinaciones, stock por variante
- [x] **Fase 6 — Carrito** · invitado en localStorage, fusión al iniciar sesión
- [x] **Fase 7 — Pedidos** · `create_order` atómica, reservas, estados, comprobante, WhatsApp
- [x] **Fase 8 — Clientes** · auth completa, Mi cuenta, seguimiento de invitado
- [x] **Fase 9 — Interacción** · preguntas y reseñas con moderación
- [x] **Fase 10 — Admin** · productos, pedidos, stock móvil, categorías, promociones, configuración
- [x] **Fase 11 — Analíticas** · eventos con dedupe, agregación diaria, dashboard, embudo
- [x] **Fase 12 — Notificaciones** · centro interno con agrupación y badges
- [x] **Fase 13 — SEO y performance** · metadata, OG, sitemap, datos estructurados, rutas estáticas
- [~] **Fase 14 — QA** · 73 pruebas de base y código + 138 de navegador en seis tamaños,
      todas verdes. La prueba de concurrencia real está escrita y se saltea sola hasta
      que haya una base a la que conectarse. Falta medir Lighthouse, que necesita la app
      desplegada con datos reales.
- [ ] **Fase 15 — Deploy** · depende de dos decisiones tuyas: dónde se hospeda
      (ver `07-LIMITES-PLAN-GRATUITO.md`) y crear el proyecto de Supabase
      (ver `09-PUESTA-EN-MARCHA.md`).
