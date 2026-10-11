'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ImageOff, ShoppingBag } from 'lucide-react'
import { Ovillo } from '@/components/ui/ovillo'
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
import {
  calcularPreciosDePago,
  precioSegunMedio,
  COPY_PAGO,
} from '@/lib/medios-de-pago'
import type { CartLine } from '@/lib/cart/cart-store'
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
type Datos = {
  nombre: string
  email: string
  telefono: string
  calle: string
  ciudad: string
  provincia: string
  codigoPostal: string
  nota: string
}

/**
 * Cada campo se lee por su nombre, a la vista.
 *
 * Podría ser un `map` sobre una lista de claves y quedaría más corto, pero
 * entonces el nombre del campo sólo existiría como dato y nada podría
 * comprobar que un `<input name="x">` tiene quien lo lea. Hay una prueba que
 * compara los `name=` del formulario con los `.get()` de este archivo justo
 * para eso: un campo que se completa y se pierde en el camino no rompe el
 * build ni los tipos, simplemente llega vacío al servidor.
 */
function leerDatos(form: HTMLFormElement): Datos {
  const data = new FormData(form)
  const limpio = (valor: FormDataEntryValue | null) => String(valor ?? '').trim()
  return {
    nombre: limpio(data.get('nombre')),
    email: limpio(data.get('email')),
    telefono: limpio(data.get('telefono')),
    calle: limpio(data.get('calle')),
    ciudad: limpio(data.get('ciudad')),
    provincia: limpio(data.get('provincia')),
    codigoPostal: limpio(data.get('codigoPostal')),
    nota: limpio(data.get('nota')),
  }
}

/** El precio unitario de una línea según el medio que eligió. */
function precioDeLinea(line: CartLine): number {
  return precioSegunMedio(
    calcularPreciosDePago({
      precioTarjeta: line.price,
      porcentajeContado: line.cashDiscountPercent,
      cuotas: line.cardInstallments,
    }),
    line.medioDePago,
  )
}

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
  // DOS PASOS. El primero pide los datos; el segundo los muestra junto con las
  // piezas y los medios de pago elegidos, y recién ahí se confirma.
  //
  // Los campos del primer paso quedan MONTADOS pero ocultos mientras se
  // revisa. Así volver a editar no pierde nada: el navegador se acordó por su
  // cuenta, sin que haya que copiar cada valor a un estado y devolverlo.
  const [paso, setPaso] = React.useState<'datos' | 'revisar'>('datos')
  const [datos, setDatos] = React.useState<Datos | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const activeMethods = deliveryMethods.filter((m) => m.is_active !== false)
  const [method, setMethod] = React.useState<string>(activeMethods[0]?.key ?? '')
  const selectedMethod = activeMethods.find((m) => m.key === method)
  const needsAddress = selectedMethod?.requires_address === true

  const deliveryCost = Number(selectedMethod?.price ?? 0)
  // El total es el de los medios de pago ELEGIDOS, no el de lista: es el
  // número que la clienta vino viendo desde la ficha.
  const estimatedTotal = cart.totalAPagar + deliveryCost

  // Qué medios hay REALMENTE en este pedido. La nota del pie habla sólo de los
  // que se van a usar: datos de transferencia a quien no transfiere es ruido.
  const hayContado = cart.lines.some((l) => l.medioDePago !== 'tarjeta')
  const hayTarjeta = cart.lines.some((l) => l.medioDePago === 'tarjeta')

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

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    // El navegador ya validó los campos obligatorios al llegar hasta acá.
    setError(null)
    setFieldErrors({})
    setDatos(leerDatos(event.currentTarget))
    setPaso('revisar')

    // Arriba del todo: el resumen empieza ahí y en un teléfono quedaría
    // fuera de pantalla.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function confirmar() {
    if (submitting || !datos) return

    setError(null)
    setFieldErrors({})
    setSubmitting(true)

    const result = await placeOrder({
      // Solo variante y cantidad. El precio lo pone el servidor.
      lines: cart.lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        paymentMethod: line.medioDePago,
      })),
      customerName: datos.nombre,
      customerEmail: datos.email,
      customerPhone: datos.telefono,
      deliveryMethod: method || undefined,
      shippingAddress: needsAddress
        ? {
            street: datos.calle,
            city: datos.ciudad,
            province: datos.provincia,
            postalCode: datos.codigoPostal,
          }
        : undefined,
      customerNote: datos.nota || undefined,
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
    // El error se muestra en el resumen, que está a la vista en los dos pasos,
    // y desde la revisión hay un botón para volver a los campos.
    setError(result.error)
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-14">
      {paso === 'revisar' && datos && (
        <Revision
          datos={datos}
          lineas={cart.lines}
          metodo={selectedMethod?.label ?? null}
          pideDireccion={needsAddress}
          ahorro={cart.ahorroPorPago}
          alVolver={() => {
            setPaso('datos')
            setError(null)
          }}
        />
      )}

      {/* Los campos quedan montados: ver la nota de arriba. */}
      <div className="space-y-8" hidden={paso === 'revisar'}>
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
                  <p className="truncate text-xs text-sage-600">
                    {COPY_PAGO.elegido(line.medioDePago)}
                  </p>
                </div>
                <p className="tabular shrink-0 text-sm">
                  {formatPrice(precioDeLinea(line) * line.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <dl className="space-y-2 border-t border-border-soft pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular">{formatPrice(cart.subtotal)}</dd>
            </div>
            {cart.ahorroPorPago > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Por tu forma de pago</dt>
                <dd className="tabular font-medium text-sage-600">
                  −{formatPrice(cart.ahorroPorPago)}
                </dd>
              </div>
            )}
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

          {paso === 'datos' ? (
            <>
              <Button type="submit" size="lg" block>
                Revisar el pedido
              </Button>
              <p className="text-center text-xs text-ink-subtle">
                Todavía no se confirma nada. Vas a poder repasarlo.
              </p>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="lg"
                block
                disabled={submitting}
                onClick={confirmar}
              >
                {submitting ? (
                  <>
                    <Ovillo />
                    Creando tu pedido...
                  </>
                ) : (
                  'Confirmar pedido'
                )}
              </Button>
              <Button asChild variant="ghost" block>
                <Link href="/tienda">Agregar otra pieza</Link>
              </Button>
            </>
          )}

          <div className="space-y-1.5 rounded-lg bg-surface-muted p-3.5 text-xs leading-relaxed text-ink-muted">
            <p className="font-medium text-ink">Como sigue</p>
            <p>Al confirmar generamos tu número de pedido y reservamos las piezas.</p>
            {/* Los datos de transferencia sólo si hay alguna pieza que se vaya a
                pagar así. Antes esta nota decía "el pago es por transferencia"
                sin más, y desde que se puede elegir tarjeta eso contradice lo
                que la persona acaba de marcar tres renglones más arriba. */}
            {hayContado && (
              <p>
                Para lo que pagás por transferencia
                {paymentAlias ? (
                  <>
                    , el alias es <strong className="text-ink">{paymentAlias}</strong>
                    {paymentHolder ? ` (${paymentHolder})` : ''}
                    {paymentBank ? ` · ${paymentBank}` : ''}
                  </>
                ) : (
                  ' te pasamos los datos al contactarte'
                )}
                .
              </p>
            )}
            {hayTarjeta && (
              <p>Lo que va con tarjeta lo coordinamos al contactarte.</p>
            )}
            {whatsappNumber && (
              <p>Después coordinamos todo por WhatsApp con {storeName}.</p>
            )}
          </div>
        </div>
      </aside>
    </form>
  )
}

/**
 * El paso de revisar.
 *
 * Lo que se mira antes de confirmar no es "el total": es si el teléfono está
 * bien escrito, si la dirección es la correcta y si cada pieza quedó con el
 * medio de pago que uno quería. Por eso están los datos en crudo y una línea
 * por pieza con su forma de pago, y no solo un número grande.
 */
function Revision({
  datos,
  lineas,
  metodo,
  pideDireccion,
  ahorro,
  alVolver,
}: {
  datos: Datos
  lineas: CartLine[]
  metodo: string | null
  pideDireccion: boolean
  ahorro: number
  alVolver: () => void
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Overline>Repasá tu pedido</Overline>
          <p className="mt-1 text-sm text-ink-muted">
            Está todo a tiempo de cambiarse. Nada se confirmó todavía.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={alVolver}>
          Volver a editar
        </Button>
      </header>

      {ahorro > 0 && (
        <p className="rounded-xl bg-sage-100 px-4 py-3 font-medium text-sage-600">
          Te estás ahorrando {formatPrice(ahorro)} por cómo elegiste pagar.
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <h3 className="font-display text-base">Las piezas</h3>
        <ul className="divide-y divide-border-soft">
          {lineas.map((line) => {
            const unitario = precioDeLinea(line)
            return (
              <li key={line.variantId} className="flex flex-wrap gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {line.quantity > 1 && (
                      <span className="tabular text-ink-muted">{line.quantity} × </span>
                    )}
                    {line.name}
                  </p>
                  {line.variantLabel && (
                    <p className="text-xs text-ink-subtle">{line.variantLabel}</p>
                  )}
                  <p className="text-xs text-sage-600">
                    {COPY_PAGO.elegido(line.medioDePago)}
                    {line.medioDePago === 'tarjeta' && line.cardInstallments > 1
                      ? ` · hasta ${line.cardInstallments} cuotas sin interés`
                      : ''}
                  </p>
                  {line.madeToOrder && (
                    <p className="text-xs text-warning">Se hace por encargo</p>
                  )}
                </div>
                <p className="tabular shrink-0 text-sm font-medium">
                  {formatPrice(unitario * line.quantity)}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <h3 className="font-display text-base">Tus datos</h3>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Dato titulo="Nombre" valor={datos.nombre} />
          <Dato titulo="Correo" valor={datos.email} />
          <Dato titulo="Teléfono" valor={datos.telefono} />
          {metodo && <Dato titulo="Entrega" valor={metodo} />}
          {pideDireccion && (
            <Dato
              titulo="Dirección"
              valor={[datos.calle, datos.ciudad, datos.provincia, datos.codigoPostal]
                .filter(Boolean)
                .join(', ')}
            />
          )}
          {datos.nota && <Dato titulo="Tu mensaje" valor={datos.nota} />}
        </dl>
      </section>
    </div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  if (!valor) return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-subtle">{titulo}</dt>
      <dd className="break-words">{valor}</dd>
    </div>
  )
}
