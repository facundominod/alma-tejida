import { AdminHeader } from '@/components/admin/admin-nav'
import { PromotionManager } from '@/components/admin/promotion-manager'
import { getAdminCategories, getAdminProducts, getAdminPromotions } from '@/lib/queries/admin'

export const metadata = { title: 'Promociones' }

export default async function AdminPromocionesPage() {
  const [promotions, categories, products] = await Promise.all([
    getAdminPromotions(),
    getAdminCategories(),
    getAdminProducts({ status: 'published' }),
  ])

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Promociones"
        description="Lo que crees acá aparece solo en el inicio y en Ofertas."
      />
      <div className="max-w-3xl">
        <PromotionManager
          promotions={promotions}
          categories={categories}
          products={products.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </div>
  )
}
