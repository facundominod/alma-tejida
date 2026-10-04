import Link from 'next/link'
import { Search, ShoppingCart } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { getOrderCounts, getOrders } from '@/lib/queries/admin'
import { ORDER_STATUS_SHORT, ORDER_STATUS_TONE } from '@/lib/labels'
import { formatDate, formatPrice } from '@/lib/utils'
import type { OrderStatus } from '@/types/database'

export const metadata = { title: 'Pedidos' }

const FILTERS: Array<{ key: OrderStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Nuevos' },
  { key: 'contacted', label: 'Contactados' },
  { key: 'awaiting_payment', label: 'Esperando pago' },
  { key: 'paid', label: 'Pagados' },
  { key: 'preparing', label: 'Preparando' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'cancelled', label: 'Cancelados' },
]

export default async function AdminPedidosPage({
  searchParams,
}: PageProps<'/admin/pedidos'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const status = (read('estado') as OrderStatus | 'all') ?? 'all'
  const search = read('buscar') ?? ''
  const page = Number(read('página') ?? '1') || 1

  const [{ orders, total, totalPages }, counts] = await Promise.all([
    getOrders({ status, search, page }),
    getOrderCounts(),
  ])

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Pedidos"
        description={`${total} ${total === 1 ? 'pedido' : 'pedidos'} en esta vista`}
      />

      {/* Buscador: por número, nombre, correo o teléfono */}
      <form className="relative mb-4" role="search">
        {status !== 'all' && <input type="hidden" name="estado" value={status} />}
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-linen-400"
          aria-hidden="true"
        />
        <input
          type="search"
          name="buscar"
          defaultValue={search}
          placeholder="Buscar por AT-00128, nombre, correo o teléfono"
          aria-label="Buscar pedidos"
          className="h-11 w-full rounded-lg border border-border-soft bg-surface pl-11 pr-3 text-[0.9375rem] focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-clay-500/25"
        />
      </form>

      {/* Chips de estado */}
      <div className="scrollbar-none mb-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((filter) => {
          const active = status === filter.key
          const count = counts[filter.key] ?? 0
          const href =
            filter.key === 'all'
              ? '/admin/pedidos'
              : `/admin/pedidos?estado=${filter.key}`

          return (
            <Link
              key={filter.key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors ${
                active
                  ? 'border-clay-300 bg-primary-soft font-medium text-clay-700'
                  : 'border-border-soft bg-surface text-ink-muted hover:border-border-strong'
              }`}
            >
              {filter.label}
              {count > 0 && <span className="tabular text-xs opacity-70">{count}</span>}
            </Link>
          )
        })}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="size-10" strokeWidth={1.3} />}
          title={search ? 'No encontramos ese pedido' : 'Todavía no hay pedidos acá'}
          description={
            search
              ? 'Probá con el número completo o con parte del nombre.'
              : 'Cuando entre un pedido, va a aparecer en esta lista.'
          }
          action={
            search ? (
              <Button asChild variant="secondary">
                <Link href="/admin/pedidos">Ver todos</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* En móvil cada pedido es una tarjeta; en desktop, una tabla.
              Una tabla de 8 columnas con scroll horizontal en un celular es
              exactamente lo que el punto 177 prohibe. */}
          <ul className="space-y-2 md:hidden">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/pedidos/${order.id}`}
                  className="block rounded-xl border border-border-soft bg-surface p-4 transition-colors hover:border-clay-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tabular font-semibold text-ink">{order.order_number}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {order.customer_name}
                      </p>
                    </div>
                    <Badge tone={ORDER_STATUS_TONE[order.status]} size="sm">
                      {ORDER_STATUS_SHORT[order.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-subtle">
                      {formatDate(order.created_at)} · {order.item_count}{' '}
                      {order.item_count === 1 ? 'producto' : 'productos'}
                    </span>
                    <span className="tabular font-semibold">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border border-border-soft bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border-soft bg-surface-muted/60 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Pedido</th>
                  <th scope="col" className="px-4 py-3 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/pedidos/${order.id}`}
                        className="tabular font-semibold text-ink hover:text-clay-700"
                      >
                        {order.order_number}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {order.item_count}{' '}
                        {order.item_count === 1 ? 'producto' : 'productos'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{order.customer_name}</p>
                      <p className="text-xs text-ink-subtle">{order.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ORDER_STATUS_TONE[order.status]} size="sm">
                        {ORDER_STATUS_SHORT[order.status]}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">
                      {formatPrice(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Paginación">
              {page > 1 && (
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={`/admin/pedidos?${new URLSearchParams({
                      ...(status !== 'all' && { estado: status }),
                      ...(search && { buscar: search }),
                      página: String(page - 1),
                    })}`}
                  >
                    Anterior
                  </Link>
                </Button>
              )}
              <span className="tabular px-2 text-sm text-ink-muted">
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={`/admin/pedidos?${new URLSearchParams({
                      ...(status !== 'all' && { estado: status }),
                      ...(search && { buscar: search }),
                      página: String(page + 1),
                    })}`}
                  >
                    Siguiente
                  </Link>
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
