import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BloqueDeLaFicha } from '@/components/tienda/bloques-de-la-ficha'
import { FichaDeMedidas } from '@/components/tienda/ficha-de-medidas'
import { GuiaDePrecios } from '@/components/tienda/guia-de-precios'
import { ProductGrid } from '@/components/tienda/product-card'
import { ProductQuestions } from '@/components/tienda/product-questions'
import { ProductReviews } from '@/components/tienda/product-reviews'
import { ProductView } from '@/components/tienda/product-view'
import { SectionHeading, ThreadDivider } from '@/components/ui/primitives'
import { calcularEntrega } from '@/lib/fecha-de-entrega'
import { coverUrl, storageUrl } from '@/lib/images'
import {
  getProductBySlug,
  getProductQuestions,
  getProductReviews,
  getPublishedSlugs,
  getRelatedProducts,
} from '@/lib/queries/catalog'
import { getStoreSettings } from '@/lib/queries/store'
import { siteUrl } from '@/lib/env'

export const revalidate = 300

/**
 * Se pregeneran las fichas publicadas. Una pieza compartida por WhatsApp se
 * abre desde el CDN, sin esperar a la base.
 */
export async function generateStaticParams() {
  const slugs = await getPublishedSlugs()
  return slugs.slice(0, 500).map(({ slug }) => ({ slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/producto/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const detail = await getProductBySlug(slug)

  if (!detail) {
    return { title: 'Pieza no encontrada', robots: { index: false } }
  }

  const { product } = detail
  const image = coverUrl(product)
  const price = Number(product.final_price ?? 0)

  // Compartir una pieza tiene que mostrar foto, nombre y precio (punto 121)
  const description =
    product.short_description ??
    `${product.name} — tejido a mano por Alma Tejida. $${price.toLocaleString('es-AR')}.`

  return {
    title: product.name,
    description,
    alternates: { canonical: `/producto/${product.slug}` },
    openGraph: {
      type: 'website',
      title: `${product.name} · Alma Tejida`,
      description,
      url: `${siteUrl}/producto/${product.slug}`,
      images: image ? [{ url: image, width: 1200, height: 1500, alt: product.name }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: image ? [image] : [],
    },
  }
}

export default async function ProductoPage({ params }: PageProps<'/producto/[slug]'>) {
  const { slug } = await params
  const detail = await getProductBySlug(slug)

  if (!detail) notFound()

  const { product, variants, attributes, combinations, media, description } = detail

  const [settings, questions, reviews, related] = await Promise.all([
    getStoreSettings(),
    getProductQuestions(product.id),
    getProductReviews(product.id),
    getRelatedProducts(product.id, product.category_id),
  ])

  const available =
    product.available_total > 0 || product.availability_mode === 'made_to_order'

  // Datos estructurados: es lo que hace que Google muestre precio y
  // disponibilidad directamente en los resultados.
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.short_description ?? description ?? undefined,
    image: media
      .filter((m) => m.type === 'image')
      .map((m) => storageUrl(m.storage_path))
      .filter(Boolean)
      .slice(0, 6),
    sku: variants[0]?.sku ?? undefined,
    brand: { '@type': 'Brand', name: settings.store_name },
    category: product.category_name ?? undefined,
    offers: {
      '@type': 'Offer',
      url: `${siteUrl}/producto/${product.slug}`,
      priceCurrency: settings.currency,
      price: Number(product.final_price ?? 0),
      availability: available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
    ...(product.rating_count > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: Number(product.rating_avg),
        reviewCount: product.rating_count,
      },
    }),
  }

  return (
    <>
      <script
        type="application/ld+json"
        // El objeto lo construimos nosotros desde la base: no hay entrada de
        // usuario sin escapar dentro de este JSON.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="at-container py-6 md:py-10">
        <ProductView
          entrega={
            product.availability_mode === 'made_to_order'
              ? calcularEntrega(product.lead_time_days ?? 0)
              : null
          }
          product={product}
          variants={variants}
          attributes={attributes}
          combinations={combinations}
          media={media}
          whatsappNumber={settings.whatsapp_number}
        />

        {/* TODO LO DEMÁS, PLEGADO.
            Antes la descripción, la lista de precios, las medidas, las
            preguntas y las reseñas venían abiertas una abajo de la otra:
            media docena de pantallas entre el botón de comprar y las piezas
            relacionadas. Quien ya decidió scrollea todo eso sin leer nada.

            La descripción arranca abierta porque es lo que se lee siempre;
            el resto se abre si hace falta. El contenido está en el HTML
            aunque esté plegado: el buscador lo indexa igual. */}
        <div className="mx-auto mt-10 max-w-3xl">
          {description && (
            <BloqueDeLaFicha titulo="Sobre esta pieza" abierto>
              {/* Texto plano, saltos de línea respetados. Nunca HTML crudo. */}
              <div className="whitespace-pre-line leading-relaxed text-ink-muted">
                {description}
              </div>
            </BloqueDeLaFicha>
          )}

          {/* La lista de precios, para COMPARAR. El selector de arriba sirve
              para comprar; esta tabla sirve para decidir. */}
          {Object.keys(combinations).length > 1 && (
            <BloqueDeLaFicha
              titulo="Precios por medida"
              resumen={`${Object.keys(combinations).length} combinaciones`}
            >
              <GuiaDePrecios
                attributes={attributes}
                variants={variants}
                combinations={combinations}
                sinEncabezado
              />
            </BloqueDeLaFicha>
          )}

          {attributes.length > 0 && (
            <BloqueDeLaFicha titulo="Medidas">
              <FichaDeMedidas attributes={attributes} sinEncabezado />
            </BloqueDeLaFicha>
          )}

          <BloqueDeLaFicha
            id="preguntas"
            titulo="Preguntas"
            resumen={
              questions.length > 0
                ? `${questions.length} respondidas`
                : 'Preguntá sin cuenta'
            }
            abierto={questions.length > 0}
          >
            <ProductQuestions
              productId={product.id}
              productName={product.name}
              questions={questions}
              whatsappNumber={settings.whatsapp_number}
              sinEncabezado
            />
          </BloqueDeLaFicha>

          <BloqueDeLaFicha
            id="resenas"
            titulo="Reseñas"
            resumen={
              product.rating_count > 0
                ? `${product.rating_count} · ${product.rating_avg.toFixed(1)} de 5`
                : 'Todavía ninguna'
            }
          >
            <ProductReviews
              reviews={reviews}
              ratingAvg={product.rating_avg}
              ratingCount={product.rating_count}
              sinEncabezado
            />
          </BloqueDeLaFicha>
        </div>

        {related.length > 0 && (
          <section className="mt-20">
            <SectionHeading overline="También te puede gustar" title="Piezas relacionadas" />
            <ProductGrid products={related} priorityCount={0} />
          </section>
        )}
      </div>
    </>
  )
}
