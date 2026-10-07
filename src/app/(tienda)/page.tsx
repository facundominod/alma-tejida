import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Hand, Heart, Package } from 'lucide-react'
import { FrasesQueGiran } from '@/components/tienda/frases-que-giran'
import { ProductGrid } from '@/components/tienda/product-card'
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
import { getHeroPromotions, getStoreSettings, getTopCategories } from '@/lib/queries/store'

// Estatica con revalidación. Cuando el administrador publica algo, la Server
// Action inválida el tag y la home se actualiza al instante, sin esperar el
// TTL y sin volver a desplegar.
export const revalidate = 300

export default async function HomePage() {
  const [settings, promotions, categories, featured, novedades, últimas] =
    await Promise.all([
      getStoreSettings(),
      getHeroPromotions(),
      getTopCategories(),
      getFeaturedProducts(8),
      getNewProducts(4),
      getLastUnitsProducts(4),
    ])

  const hero = settings.home_hero ?? {}
  const heroImage = hero.image_url ? storageUrl(hero.image_url, 'brand') : null
  const hasCatalog = featured.length > 0 || novedades.length > 0

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
              <div className="relative z-10 flex flex-col justify-center gap-5 px-6 py-12 md:px-12 md:py-16">
                {/* La frase de la tienda primero, después las de la casa. */}
                <FrasesQueGiran
                  frases={[settings.tagline, ...PORTADA.frases].filter(Boolean)}
                  className="text-clay-600"
                />

                <h1 className="text-display-xl max-w-[16ch] text-clay-900">
                  {hero.title ?? PORTADA.titulo}
                </h1>

                <p className="max-w-md text-[1.0625rem] leading-relaxed text-clay-800/85">
                  {hero.subtitle ?? PORTADA.subtitulo}
                </p>

                <div className="flex flex-wrap gap-3 pt-1">
                  <Button asChild size="lg">
                    <Link href={hero.cta_href ?? '/tienda'}>
                      {hero.cta_label ?? PORTADA.boton}
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

              {/* Fotografía protagonista */}
              {/* Sin foto cargada, en celular esta celda serían 220px de
                  textura vacía justo donde tiene que estar el producto: se
                  oculta. En desktop se conserva para que la grilla de dos
                  columnas no colapse. */}
              <div
                className={
                  heroImage
                    ? 'relative min-h-[200px] md:min-h-full'
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
                  <div className="at-weave absolute inset-0 bg-clay-200/45" />
                )}
                {/* En móvil el texto queda encima de la foto: este velo
                    garantiza el contraste sin apagar la fotografía. */}
                <div className="absolute inset-0 bg-gradient-to-t from-clay-100 via-clay-100/35 to-transparent md:bg-gradient-to-r md:from-clay-100 md:via-clay-100/20 md:to-transparent" />
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
              overline="Explorar"
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
            {categories.slice(0, 8).map((category) => {
              const image = storageUrl(category.image_path)
              return (
                <Link
                  key={category.id}
                  href={`/categoria/${category.slug}`}
                  className="group w-[44vw] shrink-0 snap-start sm:w-[30vw] md:w-auto"
                >
                  <div className="at-organic relative aspect-square overflow-hidden bg-surface-muted">
                    {image ? (
                      <Image
                        src={image}
                        alt=""
                        fill
                        sizes={IMAGE_SIZES.category}
                        className="object-cover transition-transform duration-[var(--at-dur-base)] ease-[var(--ease-out-alma)] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
                      />
                    ) : (
                      <div className="at-weave h-full w-full" />
                    )}
                  </div>
                  <p className="pt-2.5 text-center font-display text-[1.0625rem] text-linen-900">
                    <span className="at-thread-underline">{category.name}</span>
                  </p>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* DESTACADOS */}
      {featured.length > 0 && (
        <section className="at-container pt-16 md:pt-24">
          <SectionHeading
            overline="Selección"
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
              overline="Se están yendo"
              title="Últimas unidades"
              description="Quedan pocas de cada una. Varias son piezas únicas."
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
          {[
            {
              icon: Hand,
              title: 'Hecho a mano',
              text: 'Cada pieza se teje de a una. Las pequeñas diferencias son parte de eso.',
            },
            {
              icon: Heart,
              title: 'Materiales elegidos',
              text: 'Lanas y algodones seleccionados uno por uno, pensados para durar.',
            },
            {
              icon: Package,
              title: 'Coordinamos con vos',
              text: 'Hacés el pedido y lo terminamos de acordar por WhatsApp, sin apuro.',
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-4">
              <item.icon
                className="mt-0.5 size-6 shrink-0 text-clay-400"
                strokeWidth={1.5}
              />
              <div className="space-y-1">
                <p className="font-display text-lg text-linen-900">{item.title}</p>
                <p className="text-sm leading-relaxed text-ink-muted">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
