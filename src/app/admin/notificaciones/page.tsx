import Link from 'next/link'
import { Bell } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import { MarkAllRead, NotificationRow } from '@/components/admin/notification-list'
import { EmptyState } from '@/components/ui/primitives'
import { getAdminNotifications } from '@/lib/queries/admin'

export const metadata = { title: 'Notificaciones' }

/**
 * Centro de notificaciones (puntos 98, 99, 152, 153).
 *
 * Se agrupan por entidad: los avisos del mismo pedido quedan juntos, así una
 * compra genera una fila, no quince.
 */
export default async function AdminNotificacionesPage() {
  const notifications = await getAdminNotifications(80)
  const unread = notifications.filter((n) => !n.read_at).length

  // Agrupación visual por entidad. La deduplicación dura (que no se repita un
  // aviso de stock bajo sin leer) la hace un índice único en la base.
  const groups = new Map<string, typeof notifications>()
  for (const notification of notifications) {
    const key =
      notification.entity_type && notification.entity_id
        ? `${notification.entity_type}:${notification.entity_id}`
        : notification.id
    groups.set(key, [...(groups.get(key) ?? []), notification])
  }

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Notificaciones"
        description={
          unread > 0 ? `${unread} sin leer` : 'Estas al día con todo'
        }
        action={unread > 0 ? <MarkAllRead /> : undefined}
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-10" strokeWidth={1.3} />}
          title="Todavía no hay novedades"
          description="Los pedidos, preguntas y avisos de stock bajo van a aparecer acá."
        />
      ) : (
        <ul className="space-y-2">
          {[...groups.values()].map((group) => (
            <li key={group[0].id}>
              {group.length === 1 ? (
                <NotificationRow notification={group[0]} />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border-soft bg-surface">
                  {group.map((notification, index) => (
                    <div
                      key={notification.id}
                      className={index > 0 ? 'border-t border-border-soft' : ''}
                    >
                      <NotificationRow notification={notification} nested />
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-ink-subtle">
        Por ahora las notificaciones son internas. El envío por correo se puede sumar
        después, cuando haga falta: ver{' '}
        <Link href="/admin/configuracion" className="underline">
          Configuración
        </Link>
        .
      </p>
    </div>
  )
}
