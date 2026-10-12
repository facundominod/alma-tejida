'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ImageOff, MessageCircle, ShoppingBag, Trash2 } from 'lucide-react'
import { QuantityStepper } from '@/components/tienda/cart-sheet'
import { BrandWatermark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { EmptyState, Price, ThreadLoader } from '@/components/ui/primitives'
import { useCart } from '@/lib/cart/cart-store'
import { IMAGE_SIZES } from '@/lib/images'
import { COPY } from '@/lib/labels'
import { formatPrice, whatsappLink } from '@/lib/utils'
import { usePreciosDelCarrito } from '@/lib/cart/use-precios-del-carrito'
import { SelectorDePago } from '@/components/tienda/selector-de-pago'

/**
 * Página de carrito.
 *
 * Los precios que se muestran salen de localStorage y son solo orientativos.
 * El total real lo calcula el servidor al crear el pedido: por eso el resumen
 * lo dice explicitamente en lugar de prometer un número que podría cambiar.
 */
export function CartPageView({ whatsappNumber }: { whatsappNumber: string | null }) {
  const cart = useCart()
  const { precioDe, motivosDe, total: totalConReglas } = usePreciosDelCarrito(
    cart.lines,
  )

  if (!cart.ready) {
    return <ThreadLoader label="Abriendo tu carrito" />
  }

  if (cart.lines.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border-soft bg-surface">
        <BrandWatermark className="pointer-events-none absolute inset-0 m-auto size-72 text-linen-900" />
        <EmptyState
          icon={<ShoppingBag className="size-10" strokeWidth={1.3} />}
          title={COPY.emptyCart}
          description={COPY.emptyCartHint}
          action={
            <Button asChild size="lg">
              <Link href="/tienda">{COPY.emptyCartAction}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const resumen = cart.lines
    .map((line) => {
      const label = line.variantLabel ? ` (${line.variantLabel})` : ''
      return `• ${line.quantity} × ${line.name}${label}`
    })
    .join('\n')

  const whatsapp = whatsappLink(
    whatsappNumber,
    `Hola! Queria consultar por este pedido:\n${resumen}`,
  )

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-14">
      <ul className="divide-y divide-border-soft border-y border-border-soft">
        {cart.lines.map((line) => (
          <li key={line.variantId} className="flex gap-4 py-5">
            <Link
              href={`/producto/${line.slug}`}
              className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-surface-muted sm:size-28"
            >
              {line.image ? (
                <Image
                  src={line.image}
                  alt={line.name}
                  fill
                  sizes={IMAGE_SIZES.row}
                  className="object-cover"
                />
              ) : (
                <span className="grid h-full place-items-center text-linen-300">
                  <ImageOff className="size-6" />
                </span>
              )}
            </Link>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/producto/${line.slug}`}
                    className="font-display text-lg leading-snug hover:text-clay-700"
                  >
                    {line.name}
                  </Link>
                  {line.variantLabel && (
                    <p className="text-sm text-ink-subtle">{line.variantLabel}</p>
                  )}
                  {line.madeToOrder && (
                    <p className="text-xs text-warning">Se hace por encargo</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => cart.remove(line.variantId)}
                  className="-mr-1 grid size-9 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-muted hover:text-danger"
                  aria-label={`Quitar ${line.name} del carrito`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <div className="mt-3">
                <SelectorDePago
                  precio={line.price}
                  porcentajeContado={line.cashDiscountPercent}
                  cuotas={line.cardInstallments}
                  cantidad={line.quantity}
                  valor={line.medioDePago}
                  alElegir={(medio) => cart.setMedioDePago(line.variantId, medio)}
                  etiqueta={line.name}
                />

                {/* Los descuentos que entraron, con nombre. "Pagás menos" sin
                    decir por qué se lee como un error de la tienda. */}
                {motivosDe(line).length > 1 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {motivosDe(line).map((m) => (
                      <li
                        key={m.motivo}
                        className="rounded-md bg-sale/10 px-2 py-0.5 text-[0.75rem] font-medium text-sale"
                      >
                        {m.motivo} −{m.porcentaje}%
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                <QuantityStepper
                  value={line.quantity}
                  max={line.madeToOrder ? 99 : (line.maxAvailable ?? 99)}
                  onChange={(q) => cart.setQuantity(line.variantId, q)}
                  label={line.name}
                  size="md"
                />
                {(() => {
                  // El precio sale del MOTOR, que es el que después cobra. Si
                  // acá se calculara por separado, el carrito mostraría un
                  // número y el pedido cobraría otro en cuanto hubiera una
                  // regla de oferta.
                  const unitario = precioDe(line)
                  return (
                    <Price
                      final={unitario * line.quantity}
                      list={unitario < line.price ? line.price * line.quantity : null}
                    />
                  )
                })()}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-5">
          <h2 className="font-display text-xl">Resumen</h2>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">
                {cart.count} {cart.count === 1 ? 'producto' : 'productos'}
              </dt>
              <dd className="tabular">{formatPrice(cart.listSubtotal)}</dd>
            </div>
            {cart.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Descuento</dt>
                <dd className="tabular font-medium text-sale">
                  −{formatPrice(cart.discount)}
                </dd>
              </div>
            )}
            {cart.subtotal - totalConReglas > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Por tu forma de pago</dt>
                <dd className="tabular font-medium text-sage-600">
                  −{formatPrice(Math.max(cart.subtotal - totalConReglas, 0))}
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border-soft pt-3">
              <dt className="font-medium">Total</dt>
              <dd className="tabular text-xl font-semibold">
                {formatPrice(totalConReglas)}
              </dd>
            </div>
          </dl>

          {cart.subtotal - totalConReglas > 0 && (
            <p className="rounded-lg bg-sage-100 px-3.5 py-2.5 text-sm font-medium text-sage-600">
              Te estás ahorrando {formatPrice(Math.max(cart.subtotal - totalConReglas, 0))}.
            </p>
          )}

          <p className="text-xs leading-relaxed text-ink-subtle">
            La entrega y el total final se confirman al hacer el pedido.
          </p>

          <Button asChild size="lg" block>
            <Link href="/checkout">Hacer el pedido</Link>
          </Button>

          {whatsapp && (
            <Button asChild variant="whatsapp" block>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Consultar por WhatsApp
              </a>
            </Button>
          )}

          <Button asChild variant="ghost" block>
            <Link href="/tienda">Seguir mirando</Link>
          </Button>
        </div>
      </aside>
    </div>
  )
}
