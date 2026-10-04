import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone, Truck } from 'lucide-react'
import { OrderActions } from '@/components/admin/order-actions'
import { Badge, Overline } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { IMAGE_SIZES } from '@/lib/images'
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/labels'
import { getOrderDetail } from '@/lib/queries/admin'
import { getStoreSettings } from '@/lib/queries/store'
import { formatDateTime, formatPrice, whatsappLink } from '@/lib/utils'

export async function generateMetadata({ params }: PageProps<'/admin/pedidos/[id]'>) {
  const { id } = await params
  const detail = await getOrderDetail(id)
  return { title: detail ? `Pedido ${detail.order.order_number}` : 'Pedido' }
}

export default async function AdminPedidoPage({ params }: PageProps<'/admin/pedidos/[id]'>) {
  const { id } = await params
  const detail = await getOrderDetail(id)

  if (!detail) notFound()

  const { order, items, history, proofs } = detail
  const settings = await getStoreSettings()

  // Mensaje contextual, ya armado: el administrador toca y habla (punto 168)
  const resumen = items
    .map(
      (item) =>
        `• ${item.quantity} × ${item.product_name}${
          item.variant_label ? ` (${item.variant_label})` : ''
        }`,
    )
    .join('\n')

  const whatsapp = whatsappLink(
    order.customer_phone,
    `Hola ${order.customer_name.split(' ')[0]}! Te escribimos de ${settings.store_name} por tu pedido ${order.order_number}:\n${resumen}\n\nTotal: ${formatPrice(order.total)}` +
      (settings.payment_alias
        ? `\n\nPara transferir: ${settings.payment_alias}${settings.payment_holder ? ` (${settings.payment_holder})` : ''}`
        : ''),
  )

  const address = order.shipping_address as Record<string, string> | null

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/admin/pedidos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-clay-700"
      >
        <ArrowLeft className="size-4" />
        Todos los pedidos
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="tabular font-display text-2xl text-linen-900 md:text-3xl">
            {order.order_number}
          </h1>
          <p className="text-sm text-ink-muted">{formatDateTime(order.created_at)}</p>
        </div>
        <Badge tone={ORDER_STATUS_TONE[order.status]}>
          {ORDER_STATUS_LABEL[order.status]}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* PRODUCTOS */}
          <section className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
            <Overline className="mb-3">Lo que pidio</Overline>

            <ul className="divide-y divide-border-soft">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                    {item.image_url && (
                      <Image
                        src={
                          item.image_url.startsWith('http')
                            ? item.image_url
                            : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog/${item.image_url}`
                        }
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
                        target="_blank"
                        className="font-medium text-ink hover:text-clay-700"
                      >
                        {item.product_name}
                      </Link>
                    ) : (
                      <p className="font-medium text-ink">{item.product_name}</p>
                    )}
                    {item.variant_label && (
                      <p className="text-sm text-ink-subtle">{item.variant_label}</p>
                    )}
                    <p className="tabular text-sm text-ink-muted">
                      {item.quantity} × {formatPrice(item.unit_price)}
                      {item.sku && <span className="text-ink-subtle"> · {item.sku}</span>}
                    </p>
                    {item.promotion_title && (
                      <Badge tone="sale" size="sm" className="mt-1">
                        {item.promotion_title}
                      </Badge>
                    )}
                  </div>

                  <p className="tabular shrink-0 font-medium">
                    {formatPrice(item.line_total)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-border-soft pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular">{formatPrice(order.subtotal)}</dd>
              </div>
              {Number(order.discount_total) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Descuento</dt>
                  <dd className="tabular text-sale">
                    −{formatPrice(order.discount_total)}
                  </dd>
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
                <dd className="tabular text-xl font-semibold">
                  {formatPrice(order.total)}
                </dd>
              </div>
            </dl>
          </section>

          {/* HISTORIAL */}
          <section className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
            <Overline className="mb-3">Historial</Overline>
            <ol className="space-y-2.5 text-sm">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">
                    {ORDER_STATUS_LABEL[entry.to_status]}
                  </span>
                  <span className="text-xs text-ink-subtle">
                    {formatDateTime(entry.created_at)}
                  </span>
                  {entry.note && (
                    <span className="w-full text-ink-muted">{entry.note}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <OrderActions
            orderId={order.id}
            orderNumber={order.order_number}
            status={order.status}
            internalNote={order.internal_note}
            whatsappHref={whatsapp}
            proofs={proofs.map((proof) => ({
              id: proof.id,
              path: proof.storage_path,
              createdAt: proof.created_at,
            }))}
          />

          {/* CLIENTE */}
          <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
            <Overline>Cliente</Overline>
            <p className="font-medium text-ink">{order.customer_name}</p>

            <div className="space-y-2 text-sm">
              <a
                href={`tel:${order.customer_phone.replace(/\s/g, '')}`}
                className="flex items-center gap-2 text-ink-muted hover:text-clay-700"
              >
                <Phone className="size-4 shrink-0" />
                {order.customer_phone}
              </a>
              <a
                href={`mailto:${order.customer_email}`}
                className="flex items-center gap-2 break-all text-ink-muted hover:text-clay-700"
              >
                <Mail className="size-4 shrink-0" />
                {order.customer_email}
              </a>
              {order.delivery_method && (
                <p className="flex items-center gap-2 text-ink-muted">
                  <Truck className="size-4 shrink-0" />
                  {settings.delivery_methods?.find((m) => m.key === order.delivery_method)
                    ?.label ?? order.delivery_method}
                </p>
              )}
              {address && (
                <p className="flex items-start gap-2 text-ink-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {[address.street, address.city, address.province, address.postalCode]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </p>
              )}
              {order.user_id ? (
                <Badge tone="success" size="sm">
                  Tiene cuenta
                </Badge>
              ) : (
                <Badge tone="neutral" size="sm">
                  Compro como invitado
                </Badge>
              )}
            </div>

            {order.customer_note && (
              <div className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm">
                <p className="mb-0.5 text-xs font-medium text-ink-subtle">
                  Nota del cliente
                </p>
                <p className="text-ink">{order.customer_note}</p>
              </div>
            )}

            {whatsapp && (
              <Button asChild variant="whatsapp" block size="sm">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  Escribirle por WhatsApp
                </a>
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
