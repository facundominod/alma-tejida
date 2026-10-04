import { AdminHeader } from '@/components/admin/admin-nav'
import { SettingsForm } from '@/components/admin/settings-form'
import { getStorageUsage } from '@/lib/queries/admin'
import { getStoreSettings } from '@/lib/queries/store'

export const metadata = { title: 'Configuración' }

export default async function AdminConfiguracionPage() {
  const [settings, storage] = await Promise.all([getStoreSettings(), getStorageUsage()])

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Configuración"
        description="Todo lo que se ve en la tienda sale de acá. Nada está escrito en el código."
      />
      <SettingsForm settings={settings} storage={storage} />
    </div>
  )
}
