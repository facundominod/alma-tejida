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
import { PISO_PARA_REDONDEAR } from '@/lib/redondeo'
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
   * Las tres piezas que se adelantan en la portada.
   *
   * Las que ya tienen precio de verdad van primero. Hay piezas cargadas en $1
   * mientras se definen los precios, y la portada es el peor lugar para que
   * salgan: es la primera pantalla y la que decide si alguien sigue mirando.
   * En cuanto tengan su precio, entran solas al orden normal.
   */
  const adelanto = [...featured, ...novedades, ...últimas]
    .filter((p, i, todas) => todas.findIndex((o) => o.id === p.id) === i)
    .sort(
      (a, b) =>
        Number(Number(b.final_price ?? 0) >= PISO_PARA_REDONDEAR) -
        Number(Number(a.final_price ?? 0) >= PISO_PARA_REDONDEAR),
    )
    .slice(0, 3)
    // Se dan vuelta porque la última del arreglo es la que queda ARRIBA de la
    // pila, y es la única que muestra nombre y precio. La mejor va adelante.
    .reverse()

  return (
    <>
      {/* =====================================================================
          HERO — 62vh en móvil, NO pantalla completa.
          El CTA entra sin scrollear y un producto real aparece con un gesto.
          ================================================================== */}
      <section className="relative">
        <div className="at-container pt-6 md:pt-10">
          <div className="at-organic relative overflow-hidden bg-clay-100">
            <div className="at-alto-hero relative grid md:min-h-[520px] md:grid-cols-2">
              {/* Texto */}
              <div className="relative z-10 flex flex-col justify-center gap-4 px-6 py-10 sm:gap-5 md:px-12 md:py-16">
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

                <div className="flex flex-wrap gap-3 pt-1">
                  <Button asChild size="lg">
                    <Link href={texto(hero.cta_href, '/tienda')}>
                      {texto(hero.cta_label, PORTADA.boton)}
                      <ArrowRight />
                    </Link>
                  </Button>
                  {categories.length > 0 && (
                    <Button asChild variant="secondary" size="lg">
                      <Link href={`/categoria/${categories[0].slug}`}>
                        {categories[0].name}
                      </Link>
                    </Button>
                  )}
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
                    ? 'relative min-h-[260px] md:min-h-full'
                    : 'relative hidden md:block md:min-h-full'
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
            overline="Recién salidas del telar"
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
