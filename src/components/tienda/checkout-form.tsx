'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ImageOff, Loader2, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Textarea } from '@/components/ui/field'
import { EmptyState, Overline, ThreadLoader } from '@/components/ui/primitives'
import { placeOrder } from '@/lib/actions/order'
import { trackEvent } from '@/lib/analytics/track'
import { useAuth } from '@/lib/auth/auth-state'
import { useCart } from '@/lib/cart/cart-store'
import { IMAGE_SIZES } from '@/lib/images'
import { COPY } from '@/lib/labels'
import { formatPrice } from '@/lib/utils'
import type { DeliveryMethod } from '@/types/database'

/**
 * Checkout.
 *
 * Fricción mínima: nombre, correo y teléfono. Nada más (punto 9). Crear una
 * cuenta se ofrece DESPUES de haber hecho el pedido, cuando ya no puede
 * costar una venta.
 *
 * La clave de idempotencia se genera al ABRIR esta pantalla, no al enviar:
 * así, un doble clic o un reintento por señal mala mandan la misma clave y la
 * base devuelve el pedido que ya existe en lugar de crear otro (punto 163).
 */
export function CheckoutForm({
  deliveryMethods,
  paymentAlias,
  paymentHolder,
  paymentBank,
  whatsappNumber,
  storeName,
}: {
  deliveryMethods: DeliveryMethod[]
  paymentAlias: string | null
  paymentHolder: string | null
  paymentBank: string | null
  whatsappNumber: string | null
  storeName: string
}) {
  const cart = useCart()
  const router = useRouter()
  const { email: accountEmail, isLoggedIn } = useAuth()

  const [idempotencyKey] = React.useState(() =>
    typeof crypto !== 'undefined' ? crypto.randomUUID() : '',
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const activeMethods = deliveryMethods.filter((m) => m.is_active !== false)
  const [method, setMethod] = React.useState<string>(activeMethods[0]?.key ?? '')
  const selectedMethod = activeMethods.find((m) => m.key === method)
  const needsAddress = selectedMethod?.requires_address === true

  const deliveryCost = Number(selectedMethod?.price ?? 0)
  const estimatedTotal = cart.subtotal + deliveryCost

  React.useEffect(() => {
    if (cart.ready && cart.lines.length > 0) {
      void trackEvent('checkout_started', { metadata: { items: cart.count } })
    }
  }, [cart.ready, cart.lines.length, cart.count])

  // Prellena el correo si la persona ya inicio sesión
  const emailRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (accountEmail && emailRef.current && !emailRef.current.value) {
      emailRef.current.value = accountEmail
    }
  }, [accountEmail])

  if (!cart.ready) return <ThreadLoader label="Preparando tu pedido" />

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="size-10" strokeWidth={1.3} />}
        title={COPY.emptyCart}
        description="Agregá algo al carrito para poder hacer el pedido."
        action={
          <Button asChild size="lg">
            <Link href="/tienda">{COPY.emptyCartAction}</Link>
          </Button>
        }
      />
    )
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setError(null)
    setFieldErrors({})
    setSubmitting(true)

    const form = new FormData(event.currentTarget)

    const result = await placeOrder({
      // Solo variante y cantidad. El precio lo pone el servidor.
      lines: cart.lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
      })),
      customerName: String(form.get('nombre') ?? ''),
      customerEmail: String(form.get('email') ?? ''),
      customerPhone: String(form.get('telefono') ?? ''),
      deliveryMethod: method || undefined,
      shippingAddress: needsAddress
        ? {
            street: String(form.get('calle') ?? ''),
            city: String(form.get('ciudad') ?? ''),
            province: String(form.get('provincia') ?? ''),
            postalCode: String(form.get('codigoPostal') ?? ''),
          }
        : undefined,
      customerNote: String(form.get('nota') ?? '') || undefined,
      idempotencyKey,
      anonToken: cart.anonToken,
    })

    if (result.ok) {
      // El carrito ya cumplio: el pedido vive en la base
      cart.clear()
      void trackEvent('order_created', { metadata: { total: result.total } })
      router.push(`/pedido/${result.orderNumber}?t=${result.accessToken}`)
      return
    }

    setSubmitting(false)

    // Si algo se agoto mientras completaba el formulario, se saca esa línea y
    // se le dice exactamente que paso (punto 146).
    if (result.unavailableVariantId) {
      cart.remove(result.unavailableVariantId)
    }
    setError(result.error)
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-14">
      <div className="space-y-8">
        <section className="space-y-4">
          <Overline>Tus datos</Overline>

          <Field label="Nombre y apellido" required error={fieldErrors.nombre}>
            {(props) => (
              <Input
                {...props}
                name="nombre"
                autoComplete="name"
                placeholder="Como te llamamos"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Correo"
              required
              hint="Te mandamos ahí el número de pedido."
              error={fieldErrors.email}
            >
              {(props) => (
                <Input
                  {...props}
                  ref={emailRef}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="tunombre@correo.com"
                />
              )}
            </Field>

            <Field
              label="Teléfono"
              required
              hint="Para coordinar por WhatsApp."
              error={fieldErrors.telefono}
            >
              {(props) => (
                <Input
                  {...props}
                  name="telefono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="351 123 4567"
                />
              )}
            </Field>
          </div>
        </section>

        {activeMethods.length > 0 && (
          <section className="space-y-4">
            <Overline>Como lo recibis</Overline>

            <div className="space-y-2">
              {activeMethods.map((option) => (
                <label
                  key={option.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 transition-colors ${
                    method === option.key
                      ? 'border-clay-400 bg-primary-soft/40'
                      : 'border-border-soft bg-surface hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name="entrega"
                    value={option.key}
                    checked={method === option.key}
                    onChange={() => setMethod(option.key)}
                    className="mt-1 size-4 accent-[var(--color-primary)]"
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-ink">{option.label}</span>
                      <span className="tabular text-sm text-ink-muted">
                        {Number(option.price ?? 0) > 0
                          ? formatPrice(Number(option.price))
                          : 'Sin cargo'}
                      </span>
                    </span>
                    {option.description && (
                      <span className="block text-sm text-ink-subtle">
                        {option.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            {needsAddress && (
              <div className="grid gap-4 rounded-lg border border-border-soft bg-surface-muted/50 p-4 sm:grid-cols-2">
                <Field label="Calle y número" required className="sm:col-span-2">
                  {(props) => (
                    <Input {...props} name="calle" autoComplete="street-address" />
                  )}
                </Field>
                <Field label="Ciudad" required>
                  {(props) => (
                    <Input {...props} name="ciudad" autoComplete="address-level2" />
                  )}
                </Field>
                <Field label="Provincia">
                  {(props) => (
                    <Input {...props} name="provincia" autoComplete="address-level1" />
                  )}
                </Field>
                <Field label="Código postal">
                  {(props) => (
                    <Input
                      {...props}
                      name="codigoPostal"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                  )}
                </Field>
              </div>
            )}
          </section>
        )}

        <section className="space-y-4">
          <Overline>Algo más que quieras contarnos</Overline>
          <Field label="Nota para el pedido" hint="Opcional. Un color preferido, un regalo, una fecha.">
            {(props) => (
              <Textarea
                {...props}
                name="nota"
                rows={3}
                maxLength={600}
                placeholder="Es para regalo, si pueden envolverlo..."
              />
            )}
          </Field>

          {!isLoggedIn && (
            <Checkbox
              name="crearCuenta"
              label="Quiero seguir mi pedido desde una cuenta"
              description="Después de confirmar te ofrecemos crearla en un paso. No es obligatorio."
              disabled
            />
          )}
        </section>
      </div>

      {/* RESUMEN */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-5">
          <h2 className="font-display text-xl">Tu pedido</h2>

          <ul className="max-h-64 space-y-3 overflow-y-auto">
            {cart.lines.map((line) => (
              <li key={line.variantId} className="flex gap-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                  {line.image ? (
                    <Image
                      src={line.image}
                      alt=""
                      fill
                      sizes={IMAGE_SIZES.row}
                      className="object-cover"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-linen-300">
                      <ImageOff className="size-4" />
                    </span>
                  )}
                  <span className="tabular absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-linen-800 text-[0.625rem] font-semibold text-white">
                    {line.quantity}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  {line.variantLabel && (
                    <p className="truncate text-xs text-ink-subtle">{line.variantLabel}</p>
                  )}
                </div>
                <p className="tabular shrink-0 text-sm">
                  {formatPrice(line.price * line.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <dl className="space-y-2 border-t border-border-soft pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular">{formatPrice(cart.subtotal)}</dd>
            </div>
            {deliveryCost > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">{selectedMethod?.label}</dt>
                <dd className="tabular">{formatPrice(deliveryCost)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border-soft pt-2">
              <dt className="font-medium">Total estimado</dt>
              <dd className="tabular text-xl font-semibold">
                {formatPrice(estimatedTotal)}
              </dd>
            </div>
          </dl>

          <FormError>{error}</FormError>

          <Button type="submit" size="lg" block disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                Creando tu pedido...
              </>
            ) : (
              'Confirmar pedido'
            )}
          </Button>

          <div className="space-y-1.5 rounded-lg bg-surface-muted p-3.5 text-xs leading-relaxed text-ink-muted">
            <p className="font-medium text-ink">Como sigue</p>
            <p>
              Al confirmar generamos tu número de pedido y reservamos las piezas. El pago
              es por transferencia
              {paymentAlias ? (
                <>
                  {' '}
                  al alias <strong className="text-ink">{paymentAlias}</strong>
                  {paymentHolder ? ` (${paymentHolder})` : ''}
                  {paymentBank ? ` · ${paymentBank}` : ''}
                </>
              ) : (
                ', y te pasamos los datos al contactarte'
              )}
              .
            </p>
            {whatsappNumber && (
              <p>Después coordinamos todo por WhatsApp con {storeName}.</p>
            )}
          </div>
        </div>
      </aside>
    </form>
  )
}
