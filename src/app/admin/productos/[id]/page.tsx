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

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <ProductForm
            product={product}
            categories={categories}
            defaults={{
              stockDisplay: settings.default_stock_display,
              lowStockThreshold: settings.default_low_stock_threshold,
            }}
          />
        </div>

        <div className="space-y-6">
          <MediaManager productId={product.id} media={media} />

          <VariantBuilder
            productId={product.id}
            basePrice={Number(product.base_price)}
            initialAttributes={attributeDrafts}
            initialVariants={variantDrafts}
          />
        </div>
      </div>
    </div>
  )
}
