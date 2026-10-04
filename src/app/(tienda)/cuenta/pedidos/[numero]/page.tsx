import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, MessageCircle } from 'lucide-react'
import {
  CancelOrderButton,
  ProofUploader,
  ReviewForm,
} from '@/components/tienda/order-customer-actions'
import { Button } from '@/components/ui/button'
import { Badge, Overline, ThreadDivider } from '@/components/ui/primitives'
import { IMAGE_SIZES, storageUrl } from '@/lib/images'
import { ORDER_FLOW, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/labels'
import { getMyOrder } from '@/lib/queries/account'
import { getStoreSettings } from '@/lib/queries/store'
import { cn, formatDate, formatPrice, whatsappLink } from '@/lib/utils'

export async function generateMetadata({
  params,
}: PageProps<'/cuenta/pedidos/[numero]'>) {
  const { numero } = await params
  return { title: `Pedido ${numero.toUpperCase()}` }
}

export default async function MiPedidoPage({
  params,
}: PageProps<'/cuenta/pedidos/[numero]'>) {
  const { numero } = await params
  const detail = await getMyOrder(numero)

  if (!detail) notFound()

  const { order, items, history, reviews } = detail
  const settings = await getStoreSettings()

  const whatsapp = whatsappLink(
    settings.whatsapp_number,
    `Hola! Te escribo por mi pedido ${order.order_number}.`,
  )

  const currentIndex = ORDER_FLOW.indexOf(order.status)
  const cancelled = order.status === 'cancelled'
  const delivered = order.status === 'delivered'
  const awaitingPayment = ['pending', 'contacted', 'awaiting_payment'].includes(order.status)

  const reviewedProducts = new Set(reviews.map((review) => review.product_id))

  return (
    <div className="space-y-6">
      <Link
        href="/cuenta/pedidos"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-clay-700"
      >
        <ArrowLeft className="size-4" />
        Mis pedidos
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="tabular font-display text-2xl text-linen-900">
            {order.order_number}
          </h2>
          <p className="text-sm text-ink-subtle">{formatDate(order.created_at)}</p>
        </div>
        <Badge tone={ORDER_STATUS_TONE[order.status]}>
          {ORDER_STATUS_LABEL[order.status]}
        </Badge>
      </header>

      {/* TIMELINE */}
      {!cancelled ? (
        <ol className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          {ORDER_FLOW.map((status, index) => {
            const done = index <= currentIndex
            const active = index === currentIndex
            const entry = history.find((h) => h.to_status === status)

            return (
              <li key={status} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border-2',
                      done
                        ? 'border-clay-500 bg-clay-500 text-white'
                        : 'border-border-strong bg-surface',
                    )}
                    aria-hidden="true"
                  >
                    {done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  {index < ORDER_FLOW.length - 1 && (
                    <span
                      className={cn(
                        'w-0.5 flex-1',
                        index < currentIndex ? 'bg-clay-400' : 'bg-border-soft',
                      )}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className={cn('pb-5', index === ORDER_FLOW.length - 1 && 'pb-0')}>
                  <p
                    className={cn(
                      'text-sm leading-6',
                      active
                        ? 'font-medium text-clay-700'
                        : done
                          ? 'text-ink'
                          : 'text-ink-subtle',
                    )}
                  >
                    {ORDER_STATUS_LABEL[status]}
                  </p>
                  {entry && (
                    <p className="text-xs text-ink-subtle">
                      {formatDate(entry.created_at)}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="rounded-xl border border-danger/25 bg-[color-mix(in_srgb,var(--color-danger)_6%,white)] px-4 py-4">
          <p className="font-medium text-danger">Este pedido fue cancelado</p>
          {order.cancel_reason && (
            <p className="mt-1 text-sm text-ink-muted">{order.cancel_reason}</p>
          )}
        </div>
      )}

      {/* PAGO */}
      {awaitingPayment && settings.payment_alias && (
        <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <Overline>Para completar el pago</Overline>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Alias</dt>
              <dd className="tabular font-medium">{settings.payment_alias}</dd>
            </div>
            {settings.payment_holder && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Titular</dt>
                <dd className="font-medium">{settings.payment_holder}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Importe</dt>
              <dd className="tabular font-medium">{formatPrice(order.total)}</dd>
            </div>
          </dl>

          <ProofUploader orderId={order.id} proofCount={0} />
        </section>
      )}

      {/* ITEMS */}
      <section className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline className="mb-3">Lo que pediste</Overline>

        <ul className="divide-y divide-border-soft">
          {items.map((item) => {
            const image = item.image_url ? storageUrl(item.image_url) : null
            const canReview =
              delivered && item.product_id && !reviewedProducts.has(item.product_id)

            return (
              <li key={item.id} className="space-y-3 py-3 first:pt-0 last:pb-0">
                <div className="flex gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-surface-muted">
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

                  <div className="min-w-0 flex-1">
                    {item.product_slug ? (
                      <Link
                        href={`/producto/${item.product_slug}`}
                        className="font-medium hover:text-clay-700"
                      >
                        {item.product_name}
                      </Link>
                    ) : (
                      <p className="font-medium">{item.product_name}</p>
                    )}
                    {item.variant_label && (
                      <p className="text-sm text-ink-subtle">{item.variant_label}</p>
                    )}
                    <p className="tabular text-sm text-ink-muted">
                      {item.quantity} × {formatPrice(item.unit_price)}
                    </p>
                  </div>

                  <p className="tabular shrink-0 font-medium">
                    {formatPrice(item.line_total)}
                  </p>
                </div>

                {canReview && (
                  <ReviewForm
                    orderId={order.id}
                    productId={item.product_id!}
                    productName={item.product_name}
                  />
                )}
              </li>
            )
          })}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-border-soft pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd className="tabular">{formatPrice(order.subtotal)}</dd>
          </div>
          {Number(order.discount_total) > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">Descuento</dt>
              <dd className="tabular text-sale">−{formatPrice(order.discount_total)}</dd>
            </div>
          )}
          {Number(order.delivery_cost) > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">Entrega</dt>
              <dd className="tabular">{formatPrice(order.delivery_cost)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-border-soft pt-2">
            <dt className="font-medium">Total</dt>
            <dd className="tabular text-xl font-semibold">{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        {whatsapp && (
          <Button asChild variant="whatsapp">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Escribirnos
            </a>
          </Button>
        )}
        <CancelOrderButton orderId={order.id} status={order.status} />
      </div>

      <ThreadDivider />
    </div>
  )
}
