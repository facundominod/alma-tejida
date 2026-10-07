import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/tienda/copy-button'
import { Badge, Overline, ThreadDivider } from '@/components/ui/primitives'
import { IMAGE_SIZES } from '@/lib/images'
import { ORDER_FLOW, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/labels'
import { safeQuery } from '@/lib/queries/safe'
import { getStoreSettings } from '@/lib/queries/store'
import { createPublicClient } from '@/lib/supabase/public'
import { cn, formatDate, formatPrice, whatsappLink } from '@/lib/utils'
import type { PublicOrder } from '@/types/database'

export const metadata: Metadata = {
  title: 'Seguimiento del pedido',
  robots: { index: false, follow: false },
}

/**
 * Seguimiento de pedido para invitados (punto 9).
 *
 * `orders` está cerrada a `anon`. El único camino es get_order_public(), que
 * exige el número MAS el token de 122 bits. Sin token no hay pedido, y un
 * token equivocado da el mismo resultado que uno inexistente: nada.
 */
/**
 * NO lleva `loading.tsx`, a proposito.
 *
 * Se intento agregarle uno y rompio algo mas importante: un `loading.tsx`
 * abre un limite de streaming, Next manda la cabecera HTTP apenas empieza a
 * enviar el armazon, y a partir de ahi `notFound()` ya no puede cambiar el
 * codigo de estado. El resultado era que un pedido con token invalido
 * respondia **200** en lugar de 404 -decia "todo bien" sobre algo que no
 * existe-.
 *
 * Lo encontro la prueba "un pedido sin token no se puede mirar". Vale mas el
 * 404 correcto que un esqueleto en una ruta que se abre una sola vez, desde
 * un enlace de WhatsApp.
 */
export default async function PedidoPage({
  params,
  searchParams,
}: PageProps<'/pedido/[numero]'>) {
  const { numero } = await params
  const query = await searchParams
  const token = Array.isArray(query.t) ? query.t[0] : query.t

  if (!token) notFound()

  // Si la base no responde, esta página tiene que dar 404, no reventar con un
  // error 500: para quien entra es la misma situación —no podemos mostrarle su
  // pedido— y una pantalla de error del framework no le dice nada.
  const order = await safeQuery<PublicOrder | null>(
    async () => {
      const supabase = createPublicClient()
      const { data } = await supabase.rpc('get_order_public', {
        p_order_number: numero,
        p_token: token,
      })
      return data as PublicOrder | null
    },
    null,
    'seguimiento de pedido',
  )

  if (!order) notFound()

  const settings = await getStoreSettings()

  const whatsapp = whatsappLink(
    settings.whatsapp_number,
    `Hola! Te escribo por el pedido ${order.order_number}.`,
  )

  const currentIndex = ORDER_FLOW.indexOf(order.status)
  const cancelled = order.status === 'cancelled'

  return (
    <div className="at-container py-8 md:py-14">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Cabecera */}
        <header className="space-y-3 text-center">
          <Overline>Tu pedido</Overline>
          <h1 className="text-display-lg tabular">{order.order_number}</h1>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
            <span className="text-sm text-ink-subtle">
              {formatDate(order.created_at)}
            </span>
          </div>
        </header>

        {/* Guardá este enlace */}
        <div className="rounded-xl border border-clay-200 bg-clay-50 px-4 py-3.5 text-sm">
          <p className="font-medium text-clay-800">Guardá este enlace</p>
          <p className="mt-0.5 text-clay-700/85">
            Es la forma de seguir tu pedido sin crear una cuenta. También te lo mandamos
            por correo.
          </p>
          <CopyButton className="mt-2.5" />
        </div>

        {/* Timeline */}
        {!cancelled ? (
          <section aria-label="Estado del pedido">
            <ol className="space-y-0">
              {ORDER_FLOW.map((status, index) => {
                const done = index <= currentIndex
                const active = index === currentIndex
                const entry = order.timeline.find((t) => t.status === status)

                return (
                  <li key={status} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors',
                          done
                            ? 'border-clay-500 bg-clay-500 text-white'
                            : 'border-border-strong bg-surface',
                        )}
                        aria-hidden="true"
                      >
                        {done && <Check className="size-3.5" strokeWidth={3} />}
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

                    <div className={cn('pb-6', index === ORDER_FLOW.length - 1 && 'pb-0')}>
                      <p
                        className={cn(
                          'font-medium leading-7',
                          active ? 'text-clay-700' : done ? 'text-ink' : 'text-ink-subtle',
                        )}
                      >
                        {ORDER_STATUS_LABEL[status]}
                      </p>
                      {entry && (
                        <p className="text-sm text-ink-subtle">
                          {formatDate(entry.created_at)}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ) : (
          <div className="rounded-xl border border-danger/25 bg-[color-mix(in_srgb,var(--color-danger)_6%,white)] px-4 py-4 text-center">
            <p className="font-medium text-danger">Este pedido fue cancelado</p>
            <p className="mt-1 text-sm text-ink-muted">
              Si fue un error, escribinos y lo resolvemos.
            </p>
          </div>
        )}

        {/* Pago por transferencia */}
        {!cancelled &&
          ['pending', 'contacted', 'awaiting_payment'].includes(order.status) &&
          settings.payment_alias && (
            <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-5">
              <h2 className="font-display text-xl">Para completar el pago</h2>
              <dl className="space-y-2 text-sm">
                <PaymentRow label="Alias" value={settings.payment_alias} copyable />
                {settings.payment_cbu && (
                  <PaymentRow label="CBU" value={settings.payment_cbu} copyable />
                )}
                {settings.payment_holder && (
                  <PaymentRow label="Titular" value={settings.payment_holder} />
                )}
                {settings.payment_bank && (
                  <PaymentRow label="Banco" value={settings.payment_bank} />
                )}
                <PaymentRow label="Importe" value={formatPrice(order.total)} />
              </dl>
              {settings.payment_instructions && (
                <p className="text-sm leading-relaxed text-ink-muted">
                  {settings.payment_instructions}
                </p>
              )}
              <p className="text-xs text-ink-subtle">
                Cuando transfieras, avisanos por WhatsApp y confirmamos el pedido.
              </p>
            </section>
          )}

        {/* Detalle */}
        <section className="rounded-xl border border-border-soft bg-surface p-5">
          <h2 className="mb-4 font-display text-xl">Lo que pediste</h2>

          <ul className="divide-y divide-border-soft">
            {order.items.map((item, index) => (
              <li key={index} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                  {item.image_url && (
                    <Image
                      src={item.image_url}
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

        {whatsapp && (
          <Button asChild variant="whatsapp" size="lg" block>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Coordinar por WhatsApp
            </a>
          </Button>
        )}

        <ThreadDivider />

        <div className="space-y-3 text-center">
          <p className="text-sm text-ink-muted">
            ¿Querés seguir tus pedidos más fácil? Creá tu cuenta con este mismo correo y{' '}
            <span className="tabular font-medium text-ink">{order.order_number}</span> va
            a aparecer en &ldquo;Mis pedidos&rdquo;.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild variant="secondary">
              <Link href="/crear-cuenta">Crear cuenta</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/tienda">Seguir mirando</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PaymentRow({
  label,
  value,
  copyable,
}: {
  label: string
  value: string
  copyable?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-soft py-2 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-medium">
        <span className="tabular">{value}</span>
        {copyable && <CopyButton value={value} icon={<Copy className="size-3.5" />} />}
      </dd>
    </div>
  )
}
