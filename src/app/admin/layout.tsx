import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminNav } from '@/components/admin/admin-nav'
import { getUnreadCount } from '@/lib/queries/admin'
import { getStoreSettings } from '@/lib/queries/store'
import { getCurrentProfile } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: { default: 'Administración', template: '%s · Administración' },
  robots: { index: false, follow: false },
}

// El panel refleja el estado del negocio AHORA. Nada de cache.
export const dynamic = 'force-dynamic'

/**
 * Panel de administración.
 *
 * El middleware ya redirige a quien no sea admin, pero esta comprobación se
 * hace igual y contra la base: la seguridad no delega en una sola capa. Y
 * aunque las dos fallaran, RLS seguiria diciendo que no a cada consulta.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/ingresar?volver=/admin')
  if (profile.role !== 'admin') redirect('/')

  const [settings, unread] = await Promise.all([getStoreSettings(), getUnreadCount()])

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted/40 md:flex-row">
      <AdminNav
        storeName={settings.store_name}
        logoUrl={settings.logo_url}
        unreadCount={unread}
        userName={profile.full_name ?? profile.email ?? 'Administración'}
      />

      {/* pb-16 deja lugar a las pestanas inferiores en móvil */}
      <main id="contenido" className="min-w-0 flex-1 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
