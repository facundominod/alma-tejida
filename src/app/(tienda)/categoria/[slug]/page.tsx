import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PackageSearch } from 'lucide-react'
import { ProductGrid } from '@/components/tienda/product-card'
import { Button } from '@/components/ui/button'
import { EmptyState, Overline } from '@/components/ui/primitives'
import { IMAGE_SIZES, storageUrl } from '@/lib/images'
import { COPY } from '@/lib/labels'
import { getCatalog } from '@/lib/queries/catalog'
import { getCategories, getCategoryBySlug } from '@/lib/queries/store'

// Estatica: entrar por categoría es el camino de navegación más usado
// después de la home, y conviene que salga del CDN.
export const revalidate = 300

export async function generateStaticParams() {
  const categories = await getCategories()
  return categories.map((category) => ({ slug: category.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/categoria/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)

  if (!category) return { title: 'Categoría no encontrada', robots: { index: false } }

  return {
    title: category.name,
    description:
      category.description ??
      `${category.name} tejidos a mano por Alma Tejida. Piezas únicas, hechas de a una.`,
    alternates: { canonical: `/categoria/${category.slug}` },
  }
}

export default async function CategoriaPage({ params }: PageProps<'/categoria/[slug]'>) {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)

  if (!category) notFound()

  const { products, total } = await getCatalog({ categorySlug: slug, perPage: 48 })
  const image = storageUrl(category.image_path)

  return (
    <div className="at-container py-8 md:py-12">
      <header className="mb-10">
        {image ? (
          <div className="at-organic relative mb-6 aspect-[21/9] overflow-hidden bg-surface-muted md:aspect-[3/1]">
            <Image
              src={image}
              alt=""
              fill
              sizes={IMAGE_SIZES.hero}
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-linen-900/60 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6 md:p-10">
              <Overline className="text-white/75">Categoría</Overline>
              <h1 className="text-display-lg text-white">{category.name}</h1>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Overline>Categoría</Overline>
            <h1 className="text-display-lg">{category.name}</h1>
          </div>
        )}

        {/* LA RESEÑA DE LA CATEGORÍA
            Es lo primero que se lee al entrar, y tiene su propio campo: antes
            compartía el de la descripción para buscadores y por eso eran todas
            de una línea.

            Va en una caja con un filete al costado y no como un párrafo
            suelto: así se lee como una presentación de quien hace las piezas y
            no como una descripción automática. El ancho se corta en 65
            caracteres de línea para que se pueda leer de verdad. */}
        {category.intro ? (
          <div className="border-l-2 border-clay-200 pl-4 md:pl-5">
            <p className="max-w-[65ch] whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink-muted">
              {category.intro}
            </p>
          </div>
        ) : (
          category.description && (
            <p className="max-w-2xl text-ink-muted">{category.description}</p>
          )
        )}

        <p className="mt-3 text-sm text-ink-muted">
          <span className="tabular font-medium text-ink">{total}</span>{' '}
          {total === 1 ? 'pieza' : 'piezas'}
        </p>
      </header>

      {products.length > 0 ? (
        <ProductGrid products={products} priorityCount={4} />
      ) : (
        <EmptyState
          icon={<PackageSearch className="size-10" strokeWidth={1.3} />}
          title={COPY.emptyCategory}
          description={COPY.emptyCategoryHint}
          action={
            <Button asChild variant="secondary">
              <Link href="/tienda">Ver toda la tienda</Link>
            </Button>
          }
        />
      )}
    </div>
  )
}
