import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import { ProductForm } from '@/components/admin/product-form'
import { getAdminCategories } from '@/lib/queries/admin'
import { getStoreSettings } from '@/lib/queries/store'

export const metadata = { title: 'Nueva pieza' }

/**
 * Alta de una pieza.
 *
 * Primero lo mínimo: nombre y precio. Variantes y fotos aparecen después de
 * guardar, cuando ya existe algo a lo que colgarlas. Pedir todo de una vez
 * es la forma más rápida de que un formulario quede a medio llenar.
 */
export default async function NuevoProductoPage() {
  const [categories, settings] = await Promise.all([
    getAdminCategories(),
    getStoreSettings(),
  ])

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
        title="Nueva pieza"
        description="Cargá lo básico y guardá. Después agregás fotos y variantes."
      />

      <div className="max-w-2xl">
        <ProductForm
          categories={categories}
          defaults={{
            stockDisplay: settings.default_stock_display,
            lowStockThreshold: settings.default_low_stock_threshold,
          }}
        />
      </div>
    </div>
  )
}
