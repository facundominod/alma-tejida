import { AdminHeader } from '@/components/admin/admin-nav'
import { CategoryManager } from '@/components/admin/category-manager'
import { getAdminCategories } from '@/lib/queries/admin'

export const metadata = { title: 'Categorías' }

export default async function AdminCategoriasPage() {
  const categories = await getAdminCategories()

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Categorías"
        description="Las creas vos. No hay ninguna escrita en el código."
      />
      <div className="max-w-3xl">
        <CategoryManager categories={categories} />
      </div>
    </div>
  )
}
