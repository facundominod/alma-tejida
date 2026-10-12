import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Hand, Heart, Package } from 'lucide-react'
import { FrasesQueGiran } from '@/components/tienda/frases-que-giran'
import { ProductGrid } from '@/components/tienda/product-card'
import { AdelantoDePiezas } from '@/components/tienda/adelanto-de-piezas'
import { MosaicoDeCategoria } from '@/components/tienda/mosaico-de-categoria'
import { PromoCarousel } from '@/components/tienda/promo-carousel'
import { Button } from '@/components/ui/button'
import { EmptyState, SectionHeading, ThreadDivider } from '@/components/ui/primitives'
import { IMAGE_SIZES, storageUrl } from '@/lib/images'
import { COPY, PORTADA } from '@/lib/labels'
import {
  getFeaturedProducts,
  getLastUnitsProducts,
  getNewProducts,
} from '@/lib/queries/catalog'
import {
  getCategoryCollages,
  getHeroPromotions,
  getStoreSettings,
  getTopCategories,
} from '@/lib/queries/store'

// Estatica con revalidación. Cuando el administrador publica algo, la Server
// Action inválida el tag y la home se actualiza al instante, sin esperar el
// TTL y sin volver a desplegar.
export const revalidate = 300

/** Un icono por bloque del adelanto, en el mismo orden. */
const ICONOS_DEL_ADELANTO = [Hand, Heart, Package]

export default async function HomePage() {
  const [settings, promotions, categories, collages, featured, novedades, últimas] =
    await Promise.all([
      getStoreSettings(),
      getHeroPromotions(),
      getTopCategories(),
      getCategoryCollages(),
      getFeaturedProducts(8),
      getNewProducts(4),
      getLastUnitsProducts(4),
    ])

  const hero = settings.home_hero ?? {}

  /**
   * `??` no alcanza: sólo cae al respaldo con nulo, y una casilla vacía del
   * panel llega como `''`. La portada se quedaba con el texto vacío y no
   * mostraba nada.
   *
   * Se arregló también del lado de guardar, pero esto queda igual: lo que ya
   * está guardado en la base no se arregla solo, y una portada en blanco es
   * de lo peor que puede pasarle a una tienda.
   */
  const texto = (valor: string | undefined, respaldo: string) =>
    valor?.trim() ? valor : respaldo
  const heroImage = hero.image_url ? storageUrl(hero.image_url, 'brand') : null
  const hasCatalog = featured.length > 0 || novedades.length > 0
  /**
   * Las tres piezas que se muestran en la portada, al azar.
   *
   * Al azar y no las destacadas: así la portada cambia sola cada vez que se
   * revalida, sin que nadie tenga que elegir cuáles mostrar. Son decorativas
   * -no llevan a ningún lado-, así que lo único que importa es que tengan foto.
   *
   * El azar se calcula en el servidor y queda fijo hasta la próxima
   * revalidación: si se sorteara en el navegador, la portada cambiaría al
   * hidratar y React avisaría de la diferencia.
   */
  const adelanto = [...featured, ...novedades, ...últimas]
    .filter((p, i, todas) => todas.findIndex((o) => o.id === p.id) === i)
    .filter((p) => p.cover_path)
    .map((pieza) => ({ pieza, orden: Math.random() }))
    .sort((a, b) => a.orden - b.orden)
    .map(({ pieza }) => pieza)
    .slice(0, 3)

  return (
    <>
      {/* =====================================================================
          HERO — 62vh en móvil, NO pantalla completa.
          El CTA entra sin scrollear y un producto real aparece con un gesto.
          ================================================================== */}
      <section className="relative">
        <div className="at-container pt-6 md:pt-10">
          <div className="at-organic relative overflow-hidden bg-clay-100">
            {/* `min-w-0` en las dos celdas, y no es decoración.
                Un hijo de grilla arranca con `min-width: auto`: se niega a
                encogerse por debajo de su contenido. El título del hero es
                más ancho que la columna en un teléfono, así que la celda
                medía 359 px dentro de una tarjeta de 343 y se salía 16 px por
                la derecha. La tarjeta tiene `overflow-hidden`, así que no
                hacía scrollear la página -por eso la prueba de desborde pasaba
                en verde- pero dejaba el texto torcido: 40 px de aire a la
                izquierda y 24 a la derecha. En una pantalla de 320 px se
                salía 71 px. */}
            {/* Dos columnas reción en `lg`, no en `md`.
                A 768 px -una tablet en vertical- la columna del texto queda
                con 256 px útiles y el titulo se parte en cuatro renglones de
                una palabra: "Cada / nudo, / hecho / con amor." Entero arriba
                y la foto abajo se lee, que es lo que tiene que hacer un
                título. */}
            <div className="at-alto-hero relative grid lg:min-h-[520px] lg:grid-cols-2">
              {/* Texto.
                  `@container` para que los botones de abajo midan el ancho de
                  ESTA columna y no el de la pantalla: en tablet la columna
                  tiene 256 px útiles y un botón entero no entra, aunque la
                  pantalla tenga 768. */}
              <div className="@container relative z-10 flex min-w-0 flex-col justify-center gap-4 px-5 py-10 sm:gap-5 sm:px-7 md:px-10 md:py-14 lg:py-16">
                {/* La frase de la tienda primero, después las de la casa. */}
                <FrasesQueGiran
                  frases={[settings.tagline, ...PORTADA.frases].filter(Boolean)}
                  className="text-clay-600"
                />

                <h1 className="text-display-xl max-w-[16ch] text-clay-900">
                  {texto(hero.title, PORTADA.titulo)}
                </h1>

                <p className="max-w-md text-[0.9375rem] leading-relaxed text-clay-800/85 sm:text-[1.0625rem]">
                  {texto(hero.subtitle, PORTADA.subtitulo)}{' '}
                  {/* Sólo cuando hay alto para él, y sólo si la tienda no
                      escribió su propio subtítulo: si lo escribió, manda el
                      suyo entero y no se le agrega nada. */}
                  {!hero.subtitle?.trim() && (
                    <span className="hidden sm:inline">{PORTADA.subtituloDetalle}</span>
                  )}
                </p>

                <div className="flex flex-col gap-3 pt-1 @xs:flex-row @xs:flex-wrap">
                  <Button asChild size="lg" className="w-full @xs:w-auto">
                    <Link href={texto(hero.cta_href, '/tienda')}>
                      {texto(hero.cta_label, PORTADA.boton)}
                      <ArrowRight />
                    </Link>
                  </Button>
                  {/* El principal ya lleva al catálogo entero, así que el
                      segundo ofrece lo otro que alguien quiere al llegar: que
                      le hagan una a medida. */}
                  <Button asChild variant="secondary" size="lg" className="w-full @xs:w-auto">
                    <Link href="/contacto">Pedí tu medida</Link>
                  </Button>
                </div>
              </div>

              {/* Fotografía protagonista, o el adelanto de piezas.
                  Sin ninguna de las dos, en celular esta celda serían 220px de
                  textura vacía justo donde tiene que estar el producto: se
                  oculta. En desktop se conserva para que la grilla de dos
                  columnas no colapse. */}
              <div
                className={
                  heroImage || adelanto.length > 0
                    ? 'relative min-w-0 min-h-[260px] md:min-h-[340px] lg:min-h-full'
                    : 'relative hidden min-w-0 lg:block lg:min-h-full'
                }
              >
                {heroImage ? (
                  <Image
                    src={heroImage}
                    alt=""
                    fill
                    sizes={IMAGE_SIZES.hero}
                    priority
                    className="object-cover"
                  />
                ) : (
                  /* La foto de portada manda si está cargada. Si no, el lugar
                     más caro de la pantalla lo ocupan las piezas. */
                  <AdelantoDePiezas piezas={adelanto} />
                )}
                {/* En móvil el texto queda encima de la foto: este velo
                    garantiza el contraste sin apagar la fotografía. */}
                {/* El velo garantiza el contraste del texto cuando hay foto
                    de fondo. Con el adelanto no va: taparía las piezas y
                    además les comería el click. */}
                {heroImage && (
                  <div className="absolute inset-0 bg-gradient-to-t from-clay-100 via-clay-100/35 to-transparent md:bg-gradient-to-r md:from-clay-100 md:via-clay-100/20 md:to-transparent" />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROMOCIONES — reales, de la base */}
      {promotions.length > 0 && (
        <section className="pt-10 md:pt-14">
          <PromoCarousel promotions={promotions} />
        </section>
      )}

      {/* CATEGORIAS — scroll lateral en móvil */}
      {categories.length > 0 && (
        <section className="pt-14 md:pt-20">
          <div className="at-container">
            <SectionHeading
              overline="Por donde empezar"
              title="Categorías"
              action={
                <Button asChild variant="link" size="sm">
                  <Link href="/tienda">
                    Ver todo <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />
          </div>

          <div className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-4 md:overflow-visible md:px-8 lg:gap-6">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.id}
                href={`/categoria/${category.slug}`}
                className="group w-[44vw] shrink-0 snap-start sm:w-[30vw] md:w-auto"
              >
                <div className="at-organic relative aspect-square overflow-hidden bg-surface-muted">
                  <MosaicoDeCategoria
                    fotos={collages[category.id] ?? []}
                    imagenPropia={category.image_path}
                    nombre={category.name}
                  />
                </div>
                <p className="pt-2.5 text-center font-display text-[1.0625rem] text-linen-900">
                  <span className="at-thread-underline">{category.name}</span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* DESTACADOS */}
      {featured.length > 0 && (
        <section className="at-container pt-16 md:pt-24">
          <SectionHeading
            overline="Lo que elegimos mostrar"
            title="Piezas destacadas"
            description="Las que más nos gusta hacer, y las que más se llevan."
            action={
              <Button asChild variant="link" size="sm">
                <Link href="/tienda">
                  Ver toda la tienda <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          <ProductGrid products={featured} priorityCount={2} />
        </section>
      )}

      {/* ULTIMAS UNIDADES — colección automática por stock (punto 110) */}
      {últimas.length > 0 && (
        <section className="at-weave mt-16 py-14 md:mt-24 md:py-20">
          <div className="at-container">
            <SectionHeading
              overline="Quedan pocas"
              title="Últimas unidades"
              description="De varias de estas no queda otra igual, porque no la hay."
            />
            <ProductGrid products={últimas} priorityCount={0} />
          </div>
        </section>
      )}

      {/* NOVEDADES */}
      {novedades.length > 0 && (
        <section className="at-container pt-16 md:pt-24">
          <SectionHeading
            overline="Recién hechas"
            title="Novedades"
            action={
              <Button asChild variant="link" size="sm">
                <Link href="/novedades">
                  Ver novedades <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
          <ProductGrid products={novedades} priorityCount={0} />
        </section>
      )}

      {/* Catálogo todavía vacío: el administrador recien empieza */}
      {!hasCatalog && (
        <section className="at-container pt-16">
          <EmptyState
            title={COPY.catalogComingSoon}
            description={COPY.catalogComingSoonHint}
            action={
              <Button asChild variant="secondary">
                <Link href="/contacto">Escribinos</Link>
              </Button>
            }
          />
        </section>
      )}

      <ThreadDivider className="pt-20" />

      {/* BIENVENIDA
          Lo que Silvana quiere decir, en el lugar donde se puede leer sin
          apuro. En el hero no entraba: ahí hay que contestar qué se vende y
          cuánto tarda, no contar de dónde viene la pieza. */}
      <section className="at-container pt-14 md:pt-20">
        <div className="relative mx-auto max-w-2xl overflow-hidden rounded-xl border border-border-soft bg-surface px-6 py-9 text-center md:px-10 md:py-12">
          <div className="at-weave pointer-events-none absolute inset-0" />
          <div className="relative space-y-4">
            <h2 className="font-display text-2xl text-linen-900 md:text-3xl">
              {PORTADA.bienvenida.titulo}
            </h2>
            <p className="mx-auto max-w-prose text-[1.0625rem] leading-relaxed text-clay-700">
              {PORTADA.bienvenida.bajada}
            </p>
            {PORTADA.bienvenida.parrafos.map((parrafo) => (
              <p
                key={parrafo.slice(0, 24)}
                className="mx-auto max-w-prose leading-relaxed text-ink-muted"
              >
                {parrafo}
              </p>
            ))}
            <p className="pt-1 font-display text-[1.0625rem] text-clay-700">
              {PORTADA.bienvenida.remate}
            </p>
          </div>
        </div>
      </section>

      {/* COMO TRABAJAMOS — tres ideas, sin promesas que no podamos cumplir */}
      <section className="at-container pb-6 pt-8">
        <div className="grid gap-8 md:grid-cols-3 md:gap-10">
          {/* El texto vive en PORTADA.adelanto, con el resto de la copia de la
              portada. Acá quedan sólo los iconos, que son decisión de esta
              pantalla y no texto que alguien vaya a querer editar. */}
          {PORTADA.adelanto.map((item, i) => {
            const Icono = ICONOS_DEL_ADELANTO[i] ?? Hand
            return (
            <div key={item.titulo} className="flex gap-4">
              <Icono className="mt-0.5 size-6 shrink-0 text-clay-400" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="font-display text-lg text-linen-900">{item.titulo}</p>
                <p className="text-sm leading-relaxed text-ink-muted">{item.texto}</p>
              </div>
            </div>
          )
          })}
        </div>
      </section>
    </>
  )
}
