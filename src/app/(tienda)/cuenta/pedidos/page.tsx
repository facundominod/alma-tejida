import Image from 'next/image'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { IMAGE_SIZES, storageUrl } from '@/lib/images'
import { COPY, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/labels'
import { getMyOrders } from '@/lib/queries/account'
import { formatDate, formatPrice } from '@/lib/utils'

export const metadata = { title: 'Mis pedidos' }

export default async function MisPedidosPage() {
  const orders = await getMyOrders()

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package className="size-10" strokeWidth={1.3} />}
        title={COPY.emptyOrders}
        description={COPY.emptyOrdersHint}
        action={
          <Button asChild>
            <Link href="/tienda">Ver la tienda</Link>
          </Button>
        }
      />
    )
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/cuenta/pedidos/${order.order_number}`}
            className="block rounded-xl border border-border-soft bg-surface p-4 transition-colors hover:border-clay-300"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="tabular font-semibold text-ink">{order.order_number}</p>
                <p className="text-sm text-ink-subtle">{formatDate(order.created_at)}</p>
              </div>
              <Badge tone={ORDER_STATUS_TONE[order.status]}>
                {ORDER_STATUS_LABEL[order.status]}
              </Badge>
            </div>

            <div className="mt-3 flex items-center gap-2">
              {order.items.slice(0, 4).map((item) => {
                const image = item.image_url ? storageUrl(item.image_url) : null
                return (
                  <div
                    key={item.id}
                    className="relative size-12 overflow-hidden rounded-md bg-surface-muted"
                  >
                    {image && (
                      <Image
                        src={image}
                        alt=""
                        fill
                        sizes={IMAGE_SIZES.row}
                        className="object-cover"
                      />
                    )}
                  </div>
                )
              })}
              {order.items.length > 4 && (
                <span className="text-sm text-ink-subtle">+{order.items.length - 4}</span>
              )}
              <span className="tabular ml-auto font-semibold">
                {formatPrice(order.total)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
