# Alma Tejida — Identidad visual y Design System

> Documento I del entregable 211. Puntos 14–22, 124–129, 147–150, 178–180, 214.

---

## 1. La idea

Alma Tejida no es "una tienda con estética artesanal". Es **un taller digital**: un lugar
tranquilo, con luz de tarde, donde las piezas están apoyadas sobre lino y hay espacio
alrededor de cada una.

Tres reglas gobiernan todas las decisiones visuales:

1. **La fotografía manda.** La interfaz es el lino sobre el que se apoya la pieza, no el
   protagonista (punto 180). Si un elemento de UI compite con una foto, el elemento se va.
2. **Artesanal ≠ antiguo** (punto 15). Nada de marrón por todos lados, ni texturas pesadas, ni
   tipografías de almacén de ramos generales. La calidez viene del **color, el espacio y el
   movimiento**, no de la decoración.
3. **Mejores elementos, no más elementos** (punto 214). Ante la duda, se quita.

---

## 2. Paleta

Extraída de las piezas y del logo: algodón crudo, madera clara, rosa viejo del sello, y un
verde salvia muy apagado que aparece en la botánica del isologo.

### Escala `linen` — la base neutra cálida

| Token | Hex | Uso |
|---|---|---|
| `linen-50` | `#FBF8F4` | **Fondo de la aplicación** |
| `linen-100` | `#F4EDE4` | Superficies alternas, secciones |
| `linen-200` | `#E8DDD0` | Bordes, separadores |
| `linen-300` | `#D6C7B6` | Bordes marcados, deshabilitado |
| `linen-400` | `#B8A491` | Iconos secundarios |
| `linen-500` | `#97806B` | Texto sutil |
| `linen-600` | `#7A6555` | Texto secundario |
| `linen-700` | `#5E4D41` | Texto fuerte |
| `linen-800` | `#453831` | **Texto principal** |
| `linen-900` | `#2E2521` | Títulos de máximo contraste |

### Escala `clay` — la identidad (rosa terracota del sello)

| Token | Hex | Uso |
|---|---|---|
| `clay-50` | `#FBF3EF` | Fondos de realce muy suaves |
| `clay-100` | `#F5E4DC` | Chips, badges suaves |
| `clay-200` | `#EACCBF` | Bordes de realce |
| `clay-300` | `#DCAE9B` | Hover suave |
| `clay-400` | `#C9907A` | Iconografía de marca |
| `clay-500` | `#B67760` | **Primario — botones, enlaces, foco** |
| `clay-600` | `#9C6350` | Hover del primario |
| `clay-700` | `#7E5142` | Activo / texto sobre claro |
| `clay-800` | `#634037` | |
| `clay-900` | `#4A302A` | |

### Acentos

| Token | Hex | Uso |
|---|---|---|
| `wood-400` | `#D8AE7C` | Detalles de madera: separadores, iconos de marca |
| `wood-500` | `#C3945E` | Acento cálido, badge "Nuevo" |
| `sage-500` | `#6F8268` | **Éxito** — pedido confirmado, en stock |
| `amber-500` | `#C08A3E` | **Advertencia** — stock bajo, esperando pago |
| `sale-500` | `#B5533F` | **Oferta** — precio promocional, descuentos |
| `danger-500` | `#A33E33` | Error, cancelado, destructivo |

### Tokens semánticos

Los componentes **nunca** escriben `clay-500`. Escriben el rol:

```css
--at-background        linen-50
--at-surface           #FFFFFF
--at-surface-muted     linen-100
--at-border            linen-200
--at-border-strong     linen-300
--at-text              linen-800
--at-text-muted        linen-600
--at-text-subtle       linen-500
--at-primary           clay-500
--at-primary-hover     clay-600
--at-primary-soft      clay-100
--at-on-primary        #FFFFFF
--at-accent            wood-500
--at-success           sage-500
--at-warning           amber-500
--at-sale              sale-500
--at-danger            danger-500
--at-focus             clay-500
```

Regla dura, verificable por lint: **ningún componente contiene un color literal**. Cambiar la
identidad entera de Alma Tejida es editar un archivo (punto 17).

### Contraste verificado (WCAG AA, punto 129)

| Combinación | Ratio | |
|---|---|---|
| `text` sobre `background` | **11,6 : 1** | AAA |
| `text-muted` sobre `background` | **6,1 : 1** | AA |
| `on-primary` sobre `primary` | **4,7 : 1** | AA |
| `sale` sobre `background` | **5,2 : 1** | AA |
| `primary` sobre `background` | **4,6 : 1** | AA (texto ≥ 16 px) |

El precio tachado usa `text-subtle` **y** tachado **y** tamaño menor: la información nunca
depende sólo del color.

### Sin dark mode (punto 179)

La identidad de Alma Tejida **es** luz cálida sobre lino. Invertirla produce otra marca.
No se implementa. Los tokens ya están centralizados, así que la decisión es reversible sin
refactor — pero hoy sería trabajo doble sin beneficio.

---

## 3. Tipografía

| Rol | Fuente | Por qué |
|---|---|---|
| Display | **Fraunces** (variable, ejes `opsz` y `SOFT`) | Serif contemporánea con curvas suaves. Tiene carácter artesanal sin ser rústica. El eje `SOFT` permite redondear las terminaciones justo lo necesario. |
| Texto / UI | **Inter** (variable) | Máxima legibilidad en celular, cifras tabulares para los precios, y `font-feature-settings` para que los números de un listado queden alineados. |

Ambas se cargan con `next/font/google`: auto-hospedadas, subsetting latino, `display: swap`
y **cero layout shift** (punto 122). No hay pedido a un dominio externo.

### Escala (fluida, `clamp()`)

| Token | Móvil → Desktop | Fuente | Uso |
|---|---|---|---|
| `display-xl` | 2,5 → 4,25 rem | Fraunces 300 | Hero del home |
| `display-lg` | 2 → 3 rem | Fraunces 300 | Título de sección |
| `display-md` | 1,625 → 2,25 rem | Fraunces 400 | Nombre de producto en ficha |
| `title` | 1,25 → 1,5 rem | Fraunces 400 | Títulos de tarjeta |
| `body-lg` | 1,0625 rem | Inter 400 | Descripción de producto |
| `body` | 1 rem | Inter 400 | Base — **nunca menos de 16 px** en móvil |
| `label` | 0,875 rem | Inter 500 | Etiquetas de formulario |
| `caption` | 0,8125 rem | Inter 400 | Metadatos |
| `overline` | 0,75 rem · `tracking .14em` · mayúsculas | Inter 600 | Categorías, kickers — el gesto tipográfico del logo |

El `overline` con tracking amplio es la cita directa a la palabra **TEJIDA** del sello. Es el
detalle que hace que la web y el logo se reconozcan como la misma marca.

Precios: `font-variant-numeric: tabular-nums`. Los números no bailan al cambiar de variante.

---

## 4. Espacio, forma y profundidad

### Espacio
Escala de 4 px: `1 2 3 4 6 8 12 16 20 24 32`. Secciones con `py-16` en móvil y `py-24/32` en
desktop. **El aire es parte del producto** (punto 16).

### Radios — "orgánicos muy sutiles" (punto 16)

```css
--at-radius-sm    6px
--at-radius-md    10px
--at-radius-lg    16px
--at-radius-xl    24px
--at-radius-organic   22px 18px 22px 18px   /* leve asimetría */
--at-radius-full  9999px
```

`radius-organic` se usa **sólo** en imágenes de categoría y en el marco del hero. Aplicado en
todo se volvería un tic. Aplicado en dos lugares, se siente hecho a mano.

### Sombras — cálidas, nunca negras

```css
--at-shadow-sm    0 1px 2px  rgba(69,56,49,.05)
--at-shadow-md    0 2px 4px  rgba(69,56,49,.04), 0 8px 24px -12px rgba(69,56,49,.12)
--at-shadow-lg    0 4px 8px  rgba(69,56,49,.04), 0 16px 40px -16px rgba(69,56,49,.16)
--at-shadow-focus 0 0 0 3px rgba(182,119,96,.28)
```

Una sombra negra sobre lino se ve sucia. Todas las sombras usan el marrón del texto con
opacidad muy baja: el resultado parece **luz de tarde**, no un `box-shadow`.

---

## 5. Textura: presente, casi invisible (punto 18)

> **No hay una foto de lana gigante detrás de nada.**

La textura aparece en cinco lugares, siempre bajo el 4 % de opacidad o como trazo fino:

1. **Trama base** — patrón CSS de dos gradientes cruzados a 45°, opacidad 0,025, sobre
   `linen-100`. Se usa en secciones alternas. A un metro no se ve; se *siente* que el fondo
   no es plano.
2. **Separadores de hilo** — un SVG de una línea ondulada de 1 px con un nudito en el medio,
   entre secciones, en `linen-300`.
3. **Marca de agua del isologo** — la botánica del sello, a 3 % de opacidad, en el pie y en el
   estado vacío del carrito.
4. **Puntada de foco** — el `outline` de foco no es un rectángulo: es un trazo redondeado de
   2 px en `clay-500` con el halo cálido. Accesible y con personalidad.
5. **Loader de hilo** (punto 149) — un `<path>` SVG de ~1,5 KB: un hilo que se dibuja y forma
   una puntada, en bucle de 1,2 s. Anima `stroke-dashoffset` (propiedad barata) y pesa menos
   que un GIF de carga cualquiera.

---

## 6. Movimiento (puntos 19–22)

### La regla que ordena todo

> La animación transmite **calidad**, nunca **lentitud** (punto 21).

Si la persona *espera* a que algo termine de animarse, la animación está mal hecha. El techo
duro es **300 ms para que una vista completa esté lista**.

### Duraciones y curvas

```css
--at-dur-instant  120ms   /* hover, foco, cambio de estado */
--at-dur-fast     180ms   /* botones, chips, tooltips */
--at-dur-base     240ms   /* entrada de tarjetas, acordeones */
--at-dur-slow     360ms   /* modales, carrito lateral */
--at-dur-hero     600ms   /* sólo el hero, sólo una vez */

--at-ease-out     cubic-bezier(.22, .61, .36, 1)    /* entradas */
--at-ease-in-out  cubic-bezier(.65, .05, .36, 1)    /* transiciones */
--at-ease-soft    cubic-bezier(.34, 1.26, .64, 1)   /* rebote mínimo: carrito */
```

### Catálogo de animaciones (punto 20)

| Elemento | Qué hace | Duración |
|---|---|---|
| Tarjetas de producto | `opacity 0→1`, `translateY 12px→0`, **stagger 35 ms, tope 6 items** | 240 ms |
| Cambio de categoría | Crossfade + desplazamiento de 8 px | 200 ms |
| Hover de tarjeta | Imagen `scale(1.04)`, sombra `md→lg`, se dibuja un hilo bajo el nombre | 180 ms |
| Apertura de producto | La imagen de la tarjeta **crece hacia la galería** (`layoutId` de Motion) | 320 ms |
| Galería | Swipe con arrastre real y momentum (Embla) | — |
| Cambio de variante | Crossfade de la foto, **nunca salto de layout** | 160 ms |
| Agregar al carrito | Botón → check, badge del carrito con rebote mínimo, toast | 180 ms |
| Carrito lateral | Entrada desde la derecha con `ease-soft` | 360 ms |
| Modales | Escala `0,97→1` + fundido del fondo | 240 ms |
| Carrusel de promos | Fundido automático **cada 6 s**, pausa al hover/foco/toque | 500 ms |
| Contadores del dashboard | Conteo ascendente, **sólo una vez** | 600 ms |

Stagger con tope de 6: la séptima tarjeta aparece junto con la sexta. Con 40 productos, nadie
espera 40 × 35 ms = 1,4 s (punto 21).

### Rendimiento (punto 22)

- Sólo se animan `transform` y `opacity`. **Cero animaciones de `width`, `height`, `top` o
  `box-shadow`** — obligan a recalcular layout y tiran los 60 fps.
- `will-change` se aplica al empezar y se retira al terminar; dejarlo puesto consume memoria
  de GPU.
- La entrada de tarjetas usa `IntersectionObserver` con `once: true`: no hay animación
  recalculándose al hacer scroll hacia arriba.
- Motion se importa **sólo en los componentes cliente que lo usan**. La home en servidor no
  arrastra la librería.

### `prefers-reduced-motion` (puntos 22, 129)

No es un `transition: none` global. Cada animación tiene su variante reducida:

| Normal | Reducida |
|---|---|
| Desplazar + fundir | Sólo fundir, 120 ms |
| Carrusel automático | **Se detiene**, sólo control manual |
| Imagen que crece a la galería | Corte directo |
| Loader de hilo | Punto que pulsa suavemente |

El movimiento se va; la información y la jerarquía se quedan intactas.

---

## 7. Arquitectura visual de las pantallas

### Home — móvil primero (puntos 23, 125)

```
┌──────────────────────────────┐
│ ☰   alma TEJIDA          🛒  │  header 56px, se oculta al bajar
├──────────────────────────────┤
│                              │
│   [ fotografía protagonista ]│  62vh — NO ocupa la pantalla entera
│                              │
│   Piezas tejidas a mano,     │  Fraunces display-xl
│   una por una.               │
│   [ Ver productos ]          │  ← CTA visible SIN hacer scroll
├──────────────────────────────┤
│ ◀ 20% OFF en mantas      ▶ │  promociones reales de la base
├──────────────────────────────┤
│  Categorías  (scroll lateral)│
├──────────────────────────────┤
│  Destacados  ▓▓ ▓▓           │  ← producto visible al primer scroll
└──────────────────────────────┘
```

El hero ocupa **62 vh, no 100** (punto 125). El CTA entra sin scrollear y un producto real
aparece con un solo gesto. Un hero de pantalla completa en celular es una pared.

### Ficha de producto

**Móvil:** galería a ancho completo con swipe → nombre → precio → disponibilidad → variantes →
cantidad → agregar al carrito → consultar por WhatsApp → descripción → preguntas → reseñas.
El botón de compra queda **fijo abajo** al scrollear.

**Desktop:** dos columnas. Izquierda: miniaturas verticales + imagen grande con zoom al hover.
Derecha: todo lo demás, en columna pegajosa.

### Catálogo

Móvil: 2 columnas (una sola columna desperdicia pantalla y obliga a scrollear de más).
Tablet: 3. Desktop: 4 + barra lateral de filtros (puntos 127, 128).

La tarjeta muestra **cinco cosas y ninguna más** (punto 31): foto, nombre, precio (con el
anterior tachado si hay oferta), disponibilidad, e indicador de variantes ("3 colores"). El
resto vive en la ficha.

### Navegación inferior en móvil (punto 126)

Se implementa, con criterio: **4 destinos** (Inicio · Tienda · Carrito · Cuenta), 56 px de
alto, área táctil de 44 px mínimo, badge en el carrito, y se **oculta al escribir** para no
tapar el teclado. En desktop no existe.

### Panel admin (punto 178)

Misma paleta y misma tipografía, **menos decoración**: más densidad, fondo `surface` plano,
sin animaciones de entrada más allá de un fundido de 120 ms. Se reconoce como Alma Tejida,
pero es una herramienta de trabajo, no una vidriera.

Tablas responsive de verdad (punto 177): en móvil, cada fila se convierte en una tarjeta con
las 3 o 4 columnas que importan. Ninguna tabla de 12 columnas con scroll horizontal.

---

## 8. Microcopy (puntos 147, 148)

Cálido, simple, profesional. **Sin cursilería.**

| Situación | Texto | Lo que evitamos |
|---|---|---|
| Carrito vacío | *Tu carrito todavía está vacío.* + [Ver productos] | "Tu carrito espera su primera pieza soñada ✨" |
| Sin resultados | *No encontramos piezas con ese filtro.* + [Limpiar filtros] | "¡Ups! 😢" |
| Sin stock | *Sin stock por ahora* + [Consultar si vuelve] | "AGOTADO!!!" |
| Pieza única vendida | *Esta pieza ya encontró su casa.* | — (acá sí, porque es literalmente cierto) |
| Pedido creado | *Listo. Tu pedido es el **AT-00128**.* | "¡¡Felicitaciones por tu compra!!" |
| Error de red | *No pudimos conectar. Revisá tu conexión e intentá de nuevo.* | "Error 500" |
| Se agotó durante el checkout | *Se agotó mientras completabas el pedido. Lo sacamos del carrito.* | Un error genérico |
| 404 (punto 150) | *Esta página se soltó del telar.* + [Volver al inicio] + 4 productos reales | Una pantalla vacía |

Una sola frase con imagen poética por pantalla, como mucho. La personalidad está en el tono,
no en la cantidad de metáforas textiles.

---

## 9. Accesibilidad (punto 129)

- Navegación completa por teclado; **anillo de foco visible siempre**, nunca `outline: none`.
- Enlace "Saltar al contenido" como primer elemento tabulable.
- Los primitivos interactivos (modal, select, tabs, tooltip) vienen de **Radix UI**: manejo de
  foco, `aria-*` y navegación por teclado correctos de fábrica.
- `alt` obligatorio en toda imagen de producto — es un campo del formulario del admin, y si
  está vacío se autocompleta con "Nombre — vista N".
- Objetivos táctiles de **44 × 44 px** mínimo en móvil.
- Formularios con `<label>` real asociado, errores con `aria-live="polite"` y `aria-invalid`.
- Estructura de encabezados sin saltos: un solo `h1` por página.
- Estados anunciados por texto además de color (stock, estado de pedido, errores).
- `prefers-reduced-motion` respetado en todas las animaciones.

---

## 10. Presupuesto de rendimiento (puntos 122, 205)

| Métrica | Objetivo | Cómo |
|---|---|---|
| LCP | < 2,0 s en 4G | Imagen del hero con `priority`, HTML cacheado en el edge |
| CLS | < 0,05 | `width`/`height` en toda imagen, fuentes con `size-adjust`, sin banners que empujen |
| INP | < 150 ms | Poco JS en la tienda, animaciones en el compositor |
| JS de la home | **≤ 231 KB** comprimido | Server Components, Recharts sólo en admin, Motion sólo en la galería |
| Fuentes | 2 familias variables, subset latino | ~38 KB en total |

### Por qué 225 y no 110

Este documento decía **110 KB** hasta que se midió. La primera medición real dio **416**.

El número de 110 estaba escrito sin medir, y era imposible: el piso del stack elegido,
antes de una sola línea propia, ya son ~151 KB comprimidos.

| Pieza | Comprimido | ¿Se puede sacar? |
|---|---|---|
| React DOM | 70 KB | No, sin cambiar de framework |
| Router de Next | 43 KB | No |
| Runtime de Server Actions | 39 KB | No, y es lo que hace que los formularios no necesiten API propia |
| Código de Alma Tejida | ~60 KB | Sí, y de ahí salieron los 205 KB que faltaban |

De 416 a 211 se bajó sacando tres cosas del bundle inicial, todas medidas:

1. **Zod fuera del cliente** (−13 KB) — `src/lib/env.ts` lo importaba y ese módulo lo lee
   todo el mundo, así que el validador de esquemas viajaba a cada visita para comprobar
   dos variables de entorno. Ahora son veinte líneas sin dependencias.
2. **Cliente de Supabase con `import()` diferido** (−66 KB) — la tienda pública sólo lo
   necesita para saber si el icono dice "Ingresar" o "Mi cuenta". Eso puede llegar tarde;
   la primera pintura, no.
3. **Motion reemplazado por CSS en el header, el menú y el carrito** (−50 KB) — son
   componentes del layout, o sea que estaban en TODAS las páginas. Las tres animaciones
   que hacían (desplazar, fundir, escalar) las hace CSS en el compositor, igual de suave.
   `AnimatePresence` se reemplazó por `usePresence` (`src/lib/ui/use-presence.ts`), 50
   líneas. Motion sigue en la galería de la ficha de producto: ahí su valor es alto y el
   costo queda en una sola ruta.

### El empaquetador cambió el número

La primera medición (211 KB en la home) era con **Turbopack**, que es el que Next 16 usa
por defecto. Pero el despliegue a Netlify **no puede usar Turbopack**: parte el middleware
en trozos que el empaquetador de funciones de borde no sabe juntar. Con webpack, la misma
home son **219,7 KB**: unos 14 KB más en algunas páginas, porque divide el código en más
archivos y con menos filo.

Se compila con webpack **en todos lados**, no sólo al desplegar. Tener dos empaquetadores
significaría que las 138 pruebas de navegador corren sobre un artefacto distinto del que
recibe la gente, y que este presupuesto mediría un paquete que no existe en producción.
Cuesta 22 segundos más por build.

El tope es la medición más ~5%. `npm run measure` lo verifica contra el
servidor de producción y falla si se pasa; sirve para detectar la próxima dependencia que
se cuele en el cliente, que es lo único que queda bajo nuestro control.

No se persigue el 100/100 sacrificando funcionalidad (punto 205). Se corrigen problemas
reales, medidos con Lighthouse móvil en cada release.
