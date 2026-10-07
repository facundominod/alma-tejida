import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import { MediaManager } from '@/components/admin/media-manager'
import { ProductActions } from '@/components/admin/product-actions'
import { ProductForm } from '@/components/admin/product-form'
import {
  VariantBuilder,
  type AttributeDraft,
  type VariantDraft,
} from '@/components/admin/variant-builder'
import { Badge } from '@/components/ui/primitives'
import { PRODUCT_STATUS_LABEL } from '@/lib/labels'
import { getAdminCategories, getAdminProduct } from '@/lib/queries/admin'
import { getStoreSettings } from '@/lib/queries/store'
import type { AttributeType } from '@/types/database'

export async function generateMetadata({ params }: PageProps<'/admin/productos/[id]'>) {
  const { id } = await params
  const detail = await getAdminProduct(id)
  return { title: detail?.product.name ?? 'Pieza' }
}

export default async function EditarProductoPage({
  params,
}: PageProps<'/admin/productos/[id]'>) {
  const { id } = await params
  const detail = await getAdminProduct(id)

  if (!detail) notFound()

  const { product, attributes, values, variants, combinations, media } = detail
  const [categories, settings] = await Promise.all([
    getAdminCategories(),
    getStoreSettings(),
  ])

  // Se traduce lo que hay en la base al formato que entiende el editor: las
  // claves reales hacen de "clave temporal", así que guardar no duplica nada.
  const attributeDrafts: AttributeDraft[] = attributes.map((attr) => ({
    key: attr.id,
    id: attr.id,
    name: attr.name,
    type: attr.type as AttributeType,
    values: values
      .filter((value) => value.attribute_id === attr.id)
      .map((value) => ({
        key: value.id,
        id: value.id,
        value: value.value,
        color_hex: value.color_hex,
      })),
  }))

  const variantDrafts: VariantDraft[] = variants.map((variant) => ({
    key: variant.id,
    id: variant.id,
    options: Object.fromEntries(
      combinations
        .filter((combo) => combo.variant_id === variant.id)
        .map((combo) => [combo.attribute_id, combo.value_id]),
    ),
    sku: variant.sku ?? '',
    price_override: variant.price_override?.toString() ?? '',
    is_active: variant.is_active,
    stock: variant.stock,
    reserved: variant.reserved,
  }))

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/admin/productos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-clay-700"
      >
        <ArrowLeft className="size-4" />
        Productos
      </Link>

      <AdminHeader
        title={product.name}
        description={`/producto/${product.slug}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                product.status === 'published'
                  ? 'success'
                  : product.status === 'draft'
                    ? 'neutral'
                    : 'warning'
              }
            >
              {PRODUCT_STATUS_LABEL[product.status]}
            </Badge>
            <ProductActions
              productId={product.id}
              status={product.status}
              slug={product.slug}
            />
          </div>
        }
      />

      {/* Accesos directos a las tres partes del editor.
          En un celular, esta pantalla mide varias veces el alto de la
          pantalla: sin esto hay que adivinar que mas abajo hay algo. */}
      <nav
        aria-label="Partes de esta pieza"
        className="-mx-1 flex gap-1 overflow-x-auto pb-1 xl:hidden"
      >
        {[
          { href: '#fotos', label: 'Fotos' },
          { href: '#datos', label: 'Datos y precio' },
          { href: '#caracteristicas', label: 'Caracteristicas' },
        ].map((parte) => (
          <a
            key={parte.href}
            href={parte.href}
            className="shrink-0 rounded-lg border border-border-soft px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            {parte.label}
          </a>
        ))}
      </nav>

      {/* En pantalla ancha: datos a la izquierda, fotos y caracteristicas a la
          derecha. En celular se apila, y ahi las FOTOS van primero.

          Antes iba primero el formulario entero -quince campos- y el gestor de
          fotos quedaba tan abajo que parecia no existir. Recien creada una
          pieza, lo siguiente que se quiere hacer es sacarle fotos, no volver a
          escribir el nombre. */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="order-1 space-y-6 xl:order-2">
          <div id="fotos" className="scroll-mt-20">
            <MediaManager productId={product.id} media={media} />
          </div>

          <div id="caracteristicas" className="scroll-mt-20">
            <VariantBuilder
              productId={product.id}
              basePrice={Number(product.base_price)}
              initialAttributes={attributeDrafts}
              initialVariants={variantDrafts}
            />
          </div>
        </div>

        <div id="datos" className="order-2 scroll-mt-20 space-y-6 xl:order-1">
          <ProductForm
            product={product}
            categories={categories}
            defaults={{
              stockDisplay: settings.default_stock_display,
              lowStockThreshold: settings.default_low_stock_threshold,
            }}
          />
        </div>
      </div>
    </div>
  )
}
