import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FichaDeMedidas } from '@/components/tienda/ficha-de-medidas'
import { ProductGrid } from '@/components/tienda/product-card'
import { ProductQuestions } from '@/components/tienda/product-questions'
import { ProductReviews } from '@/components/tienda/product-reviews'
import { ProductView } from '@/components/tienda/product-view'
import { SectionHeading, ThreadDivider } from '@/components/ui/primitives'
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
          product={product}
          variants={variants}
          attributes={attributes}
          combinations={combinations}
          media={media}
          whatsappNumber={settings.whatsapp_number}
        />

        {description && (
          <section className="mx-auto mt-16 max-w-3xl">
            <h2 className="mb-4 font-display text-2xl">Sobre esta pieza</h2>
            {/* Texto plano, saltos de línea respetados. Nunca HTML crudo. */}
            <div className="whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink-muted">
              {description}
            </div>
          </section>
        )}

        {/* Las medidas, escritas y debajo de la descripcion: lo que alguien
            vuelve a mirar cuando ya decidio que le gusta y ahora compara con
            su propia cama. */}
        <FichaDeMedidas attributes={attributes} />

        <ThreadDivider className="my-16" />

        <div className="mx-auto max-w-3xl space-y-16">
          <ProductQuestions
            productId={product.id}
            productName={product.name}
            questions={questions}
            whatsappNumber={settings.whatsapp_number}
          />

          <div id="resenas" className="scroll-mt-24">
            <ProductReviews
              reviews={reviews}
              ratingAvg={product.rating_avg}
              ratingCount={product.rating_count}
            />
          </div>
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
