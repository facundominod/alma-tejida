'use client'

import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { BrandWatermark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { Price } from '@/components/ui/primitives'
import { useCart } from '@/lib/cart/cart-store'
import { usePresence } from '@/lib/ui/use-presence'
import { IMAGE_SIZES } from '@/lib/images'
import { COPY } from '@/lib/labels'
import { cn, formatPrice } from '@/lib/utils'

/**
 * Carrito lateral.
 *
 * Entra desde la derecha con `ease-soft` (rebote mínimo) en 360 ms. Se puede
 * cerrar con Escape, tocando el fondo o el botón: las tres salidas que la
 * gente intenta.
 */
export function CartSheet() {
  const cart = useCart()
  const { montado, visible } = usePresence(cart.isOpen, 360)

  React.useEffect(() => {
    if (!cart.isOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') cart.close()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [cart])

  if (!montado) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-[var(--at-dur-base)]',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      >
          <button
            type="button"
            className="absolute inset-0 bg-linen-900/30 backdrop-blur-[2px]"
            onClick={cart.close}
            aria-label="Cerrar carrito"
            tabIndex={-1}
          />

          <aside
            className={cn(
              'absolute inset-y-0 right-0 flex w-full max-w-md flex-col',
              'bg-background shadow-overlay',
              // 360ms con rebote minimo, igual que antes, pero en CSS
              'transition-transform duration-[360ms] ease-[var(--ease-soft-alma)]',
              'motion-reduce:transition-none',
              visible ? 'translate-x-0' : 'translate-x-full',
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Carrito de compras"
          >
            <header className="flex items-center justify-between border-b border-border-soft px-5 py-4">
              <h2 className="font-display text-xl">
                Tu carrito
                {cart.count > 0 && (
                  <span className="ml-2 text-base text-ink-subtle">({cart.count})</span>
                )}
              </h2>
              <button
                type="button"
                onClick={cart.close}
                className="-mr-2 grid size-11 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted"
                aria-label="Cerrar carrito"
              >
                <X className="size-5" />
              </button>
            </header>

            {cart.lines.length === 0 ? (
              <EmptyCart onClose={cart.close} />
            ) : (
              <>
                <ul className="flex-1 divide-y divide-border-soft overflow-y-auto px-5">
                  {cart.lines.map((line) => (
                    <li key={line.variantId} className="flex gap-3.5 py-4">
                      <Link
                        href={`/producto/${line.slug}`}
                        onClick={cart.close}
                        className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-surface-muted"
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
                            <ShoppingBag className="size-6" />
                          </span>
                        )}
                      </Link>

                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/producto/${line.slug}`}
                              onClick={cart.close}
                              className="block truncate font-medium leading-snug hover:text-clay-700"
                            >
                              {line.name}
                            </Link>
                            {line.variantLabel && (
                              <p className="truncate text-sm text-ink-subtle">
                                {line.variantLabel}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => cart.remove(line.variantId)}
                            className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-muted hover:text-danger"
                            aria-label={`Quitar ${line.name}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-2">
                          <QuantityStepper
                            value={line.quantity}
                            max={line.madeToOrder ? 99 : (line.maxAvailable ?? 99)}
                            onChange={(q) => cart.setQuantity(line.variantId, q)}
                            label={line.name}
                          />
                          <Price
                            final={line.price * line.quantity}
                            list={
                              line.listPrice && line.listPrice > line.price
                                ? line.listPrice * line.quantity
                                : null
                            }
                            size="sm"
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <footer className="space-y-3 border-t border-border-soft bg-surface px-5 pb-5 pt-4">
                  {cart.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-muted">Descuento</span>
                      <span className="tabular font-medium text-sale">
                        −{formatPrice(cart.discount)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink-muted">Subtotal</span>
                    <span className="tabular text-xl font-semibold">
                      {formatPrice(cart.subtotal)}
                    </span>
                  </div>
                  <p className="text-xs text-ink-subtle">
                    El total final se confirma al hacer el pedido.
                  </p>
                  <Button asChild size="lg" block>
                    <Link href="/checkout" onClick={cart.close}>
                      Hacer el pedido
                    </Link>
                  </Button>
                  <Button variant="ghost" block onClick={cart.close}>
                    Seguir mirando
                  </Button>
                </footer>
              </>
            )}
          </aside>
      </div>
    </div>
  )
}

function EmptyCart({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <BrandWatermark className="pointer-events-none absolute inset-0 m-auto size-64 text-linen-900" />
      <ShoppingBag className="size-10 text-linen-300" strokeWidth={1.3} />
      <div className="space-y-1">
        <p className="font-display text-xl">{COPY.emptyCart}</p>
        <p className="text-sm text-ink-muted">{COPY.emptyCartHint}</p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/tienda" onClick={onClose}>
          {COPY.emptyCartAction}
        </Link>
      </Button>
    </div>
  )
}

export function QuantityStepper({
  value,
  max,
  min = 1,
  onChange,
  label,
  size = 'sm',
}: {
  value: number
  max: number
  min?: number
  onChange: (value: number) => void
  label: string
  size?: 'sm' | 'md'
}) {
  const boxSize = size === 'sm' ? 'size-8' : 'size-10'

  return (
    <div className="inline-flex items-center rounded-lg border border-border-soft">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        className={`${boxSize} grid place-items-center rounded-l-lg text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-35 disabled:hover:bg-transparent`}
        aria-label={`Quitar una unidad de ${label}`}
      >
        <Minus className="size-3.5" />
      </button>
      <span
        className="tabular w-8 text-center text-sm font-medium"
        aria-live="polite"
        aria-label={`Cantidad: ${value}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={`${boxSize} grid place-items-center rounded-r-lg text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-35 disabled:hover:bg-transparent`}
        aria-label={`Agregar una unidad de ${label}`}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
