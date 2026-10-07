# Alma Tejida — Límites reales de los planes gratuitos

> Punto 208 del pedido: *"No asumir límites: consultar documentación vigente durante
> implementación."*
> **Verificado en la documentación oficial el 19 de septiembre de 2026.**
> Estos números cambian. Antes de tomar una decisión de plata, volvé a mirarlos.

---

## ⚠️ HALLAZGO CRÍTICO — Vercel Hobby no permite tiendas

Esto es exactamente el caso del **punto 209**, así que la decisión se frena acá y se
documenta en lugar de darla por hecha.

La documentación de Vercel dice, textualmente, en *Fair Use Guidelines → Commercial usage*:

> Los equipos Hobby están restringidos a **uso personal no comercial** únicamente. Todo uso
> comercial de la plataforma requiere un plan Pro o Enterprise.

Y define uso comercial incluyendo, entre otros:

- cualquier método de **solicitar o procesar pagos** de los visitantes del sitio;
- **publicitar la venta de un producto o servicio**;
- recibir pago por crear, actualizar u hospedar el sitio.

**Alma Tejida es una tienda.** Publica productos a la venta y coordina cobros por
transferencia. Entra de lleno en esa definición. Desplegarla en Hobby sería incumplir los
términos del servicio, con riesgo de que bajen el proyecto sin aviso — justo el día que
alguien quiera comprar.

*(Nota: pedir donaciones **no** cuenta como uso comercial. Vender mantas, sí.)*

### La necesidad

Un lugar donde correr la aplicación Next.js, que permita uso comercial.

### Las alternativas, con números

| Opción | Costo | Uso comercial | Qué implica en el código |
|---|---|---|---|
| **Vercel Pro** | **USD 20/mes** (incluye USD 20 de crédito de uso) | ✅ permitido | **Cero cambios.** Es el mismo deploy. |
| **Netlify Free** | USD 0 | ✅ sin restricción comercial | Adaptador de Next.js de Netlify. 300 créditos/mes ≈ **15 GB de tráfico** o 1,5 M de peticiones. |
| **Cloudflare Workers Free** | USD 0 | ✅ sin restricción comercial | Adaptador `@opennextjs/cloudflare`. 100.000 peticiones/día. |
| Netlify Personal | USD 9/mes | ✅ | 1.000 créditos/mes |
| VPS propio | USD 4–6/mes | ✅ | `next start` detrás de un proxy. Más trabajo de mantenimiento. |

### El impacto

**Ninguno sobre el código.** La aplicación es Next.js estándar: no usa nada propietario de
Vercel más allá de `vercel.json` para los dos cron jobs (que en Netlify o Cloudflare se
declaran distinto, en un archivo). Cambiar de hosting es reconfigurar el deploy, no
reescribir la tienda.

### La recomendación

**Empezar en Netlify Free o Cloudflare Workers Free.** Son gratis de verdad, permiten uso
comercial, y con el tráfico de una tienda que arranca sobran. Cuando el tráfico crezca lo
suficiente como para que 15 GB/mes queden cortos, la tienda ya estará facturando y los
USD 20 de Vercel Pro serán una decisión fácil.

Si preferís Vercel desde el día uno por comodidad, son **USD 20/mes**. Es una decisión
comercial válida — pero tenía que ser tuya, no mía, y por eso está acá.

### Lo que NO cambia

**Supabase Free no tiene ninguna restricción de uso comercial.** Toda la base, la
autenticación y el storage siguen gratis en cualquiera de los escenarios. Lo que está en
discusión es sólo dónde corre el front.

---

## Supabase — Plan Free

| Recurso | Límite | Qué significa para Alma Tejida |
|---|---|---|
| Base de datos | **500 MB** | Alcanza para decenas de miles de pedidos. El consumo real lo empujan las analíticas, por eso se purgan a los 90 días. |
| Storage de archivos | **1 GB** | ~4.000 fotos optimizadas, o ~200 si se guardaran los originales. Por eso no se guardan (ver `03-STORAGE.md`). |
| Egreso | **5 GB/mes** | **El límite que más aprieta.** Es lo que sale del servidor: imágenes y videos. |
| Egreso cacheado | 5 GB/mes | Cuota aparte. Ayuda, pero no es infinita. |
| Usuarios activos mensuales | 50.000 | Irrelevante a esta escala. |
| Peticiones a la API | Ilimitadas | |
| CPU / RAM | Compartida · 500 MB | Suficiente: las consultas están indexadas y el catálogo se sirve cacheado. |
| **Backups automáticos** | **❌ NO INCLUIDOS** | Ver `08-BACKUP-Y-RECUPERACION.md`. Es responsabilidad nuestra. |
| **Pausa por inactividad** | **A la semana** | Resuelto con un cron diario de ping (`/api/cron/ping`). |
| Proyectos activos | **Máximo 2** | Justo los dos que usamos: `dev` y `prod`. No queda lugar para un tercero. |

### Las tres cosas que hay que mirar

**1. El egreso de 5 GB es el techo real.**
Un producto con 8 fotos optimizadas pesa ~1,6 MB de descarga completa. 5 GB ÷ 1,6 MB
≈ **3.000 visitas completas a fichas de producto por mes**. En la práctica alcanza para
bastante más, porque casi nadie abre las 8 fotos y el CDN de la plataforma de hosting
absorbe buena parte de las repeticiones.

**2. Un solo video puede romper todo.**
25 MB × 200 reproducciones = 5 GB. **Un video visto doscientas veces agota el egreso del
mes y tira abajo la tienda entera, imágenes incluidas.** De ahí vienen las tres defensas:
un video por producto, 25 MB de tope y `preload="none"` (no descarga nada hasta que
alguien toca play).

**3. Sin backups automáticos.**
El plan Free no los incluye. La recuperación depende de lo que documentamos nosotros.

---

## Vercel — Plan Hobby (si se usara, ver la advertencia de arriba)

| Recurso | Incluido/mes |
|---|---|
| Fast Data Transfer | 100 GB |
| Edge Requests | 1.000.000 |
| Invocaciones de funciones | 1.000.000 |
| Fast Origin Transfer | 10 GB |
| CPU activa | 4 horas |
| **Transformaciones de imagen** | **5.000/mes** |
| Lecturas de caché de imagen | 300.000/mes |
| Escrituras de caché de imagen | 100.000/mes |
| Cron jobs por proyecto | 100 |
| Builds por día | 100 |
| Tiempo de build | 45 min |

### Las 5.000 transformaciones de imagen

Es el número menos obvio y el que más fácil se pasa. `next/image` genera **una
transformación por cada combinación única de (imagen, ancho, calidad)**.

Cálculo para un catálogo de 100 productos con 8 fotos cada uno:

```
100 productos × 8 fotos × 4 anchos del srcset = 3.200 transformaciones
```

Entra, pero sin mucho aire. Mitigaciones ya implementadas:

- `deviceSizes` y `imageSizes` recortados en `next.config.ts` a los anchos que la tienda
  usa de verdad, en lugar de la lista larga por defecto;
- `sizes` declarado explícitamente en cada contexto (`src/lib/images.ts`), para que el
  navegador pida un solo ancho y no varios;
- las miniaturas ya vienen generadas de la subida, así que las tarjetas del catálogo piden
  un archivo chico que casi no necesita transformarse;
- `minimumCacheTTL` de 30 días: una transformación se reutiliza un mes entero.

---

## Netlify — Plan Free (alternativa recomendada)

| Recurso | Incluido |
|---|---|
| Créditos | **300/mes** |
| Equivalencia: tráfico | 20 créditos/GB → **15 GB/mes** |
| Equivalencia: peticiones | 2 créditos por 10.000 → **1,5 M/mes** |
| Equivalencia: deploys | 15 créditos cada uno → 20 deploys/mes |
| Dominio propio con SSL | ✅ incluido |
| Uso comercial | ✅ **sin restricción** |

Los 300 créditos se reparten entre tráfico, cómputo, peticiones y deploys, así que conviene
no desplegar veinte veces por día: cada deploy cuesta 15 créditos, un 5 % del mes.

### Las funciones corren en Ohio y no se pueden mover

Medido el 2026-10-07 sobre la tienda publicada:

| Ruta | TTFB | Total | HTML |
|---|---|---|---|
| `/` (estática) | 567 ms | 709 ms | 19 KB |
| `/tienda` (dinámica) | 893 ms | 1,06 s | 16 KB |
| `/producto/[slug]` | 639 ms | 830 ms | 16 KB |

De los 567 ms de la portada, **335 son conexión y TLS**: distancia hasta el borde de
Netlify. El catálogo suma ~330 ms porque es dinámico y va a buscar los datos a la base,
que está en São Paulo, desde una función que está en **Ohio** (`functions_region: cmh`).

Cada página dinámica hace el recorrido Argentina → Ohio → São Paulo → Ohio → Argentina.

**Se intentó mover las funciones a `sa-east-1` y la API de Netlify lo rechaza**
(`Unprocessable Entity`): elegir región de funciones es de plan pago.

| Salida | Costo | Impacto |
|---|---|---|
| **Dejarlo así** | gratis | ~330 ms extra en las rutas dinámicas. Las públicas se sirven cacheadas y casi no lo sufren. |
| Netlify Pro | **USD 19/mes** | Permite elegir región. Quitaría la mayor parte de esos 330 ms. |

Se eligió dejarlo. Lo que sí se hizo, gratis, fue atacar el síntoma donde se nota:
pantallas de espera en las rutas lentas, transición de entrada, y **achicar las fotos en
el navegador antes de subirlas** —que es donde esa distancia dolía de verdad: 4 MB
cruzando el continente eran quince segundos por foto, y ahora son 250 KB—.

### Un solo contribuyente en repositorios privados

Encontrado al conectar el repositorio, no antes: Netlify **bloquea la compilación** si el
commit lo firmó alguien que no es miembro verificado del equipo.

```
Build blocked: Unrecognized Git contributor.
This plan allows only verified account members to push to private repos.
```

No hay forma gratuita de agregar un segundo contribuyente: es una restricción de plan, no
una configuración. Las tres salidas, con su costo:

**Netlify identifica al contribuyente por su usuario de GitHub, no por el correo del
commit.** El campo que lo dice está en la API del deploy:

```
committer: 'facundominod'
strict_contributor_verification_failure: true
```

Cambiar `git config user.email` NO sirve —se probó—: el correo del commit no entra en
la comparación. Las salidas reales:

| Salida | Costo | Qué implica |
|---|---|---|
| **Vincular la cuenta de GitHub al usuario de Netlify** | gratis | Netlify pasa a reconocer a ese usuario como miembro. Es la primera a probar. |
| Hacer público el repositorio | gratis | La restricción sólo aplica a repos privados. Publica el código (se verificó que no contiene ningún secreto). |
| Netlify Pro | **USD 19/mes** | Permite contribuyentes que no son miembros. |

**Impacto:** mientras trabaje una sola persona, cualquiera de las dos gratuitas alcanza. El
día que sean varias, en repo privado, cada una necesita ser miembro del equipo —o sea, el
plan pago— o el repositorio tiene que ser público.

Esto es exactamente lo que pide el punto 209: una decisión que empujaba hacia un plan pago,
frenada, con su alternativa gratuita y su impacto escritos.

---

## Estimación de consumo real

Supuesto: **50 productos publicados, 8 fotos cada uno, 1.500 visitas/mes, 40 pedidos/mes.**

| Recurso | Estimado | Límite | Uso |
|---|---|---|---|
| Base Supabase | ~25 MB | 500 MB | 5 % |
| Storage Supabase | ~90 MB | 1 GB | 9 % |
| Egreso Supabase | ~1,2 GB | 5 GB | 24 % |
| Tráfico de hosting | ~4 GB | 15 GB (Netlify) | 27 % |
| Transformaciones de imagen | ~1.600 | 5.000 | 32 % |

**Conclusión: el plan gratuito aguanta cómodo esta escala.** El primer recurso que va a
apretar es el egreso, y va a apretar por los videos, no por las fotos.

---

## Señales de que llegó el momento de pagar

| Señal | Qué hacer |
|---|---|
| Storage > 70 % | El panel ya avisa. Revisar videos primero: son lo que pesa. |
| Egreso > 80 % antes del día 20 | Mover los videos a un CDN de video, o sacarlos. |
| Base > 300 MB | Revisar `analytics_events`; la purga de 90 días debería bastar. |
| La tienda va lenta con muchas visitas | Supabase Pro (USD 25/mes) por el compute dedicado. |
| Vendés de verdad todos los meses | Vercel Pro (USD 20/mes) si querés su comodidad. |

**Regla del punto 209:** ninguna función de este proyecto depende hoy de un plan pago. La
única decisión de plata pendiente es dónde se hospeda el front, y está planteada arriba con
sus tres alternativas gratuitas.
