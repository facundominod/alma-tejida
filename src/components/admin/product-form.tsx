'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, Eye } from 'lucide-react'
import { Ovillo } from '@/components/ui/ovillo'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/field'
import { Overline } from '@/components/ui/primitives'
import { saveProduct } from '@/lib/actions/admin/catalog'
import { STOCK_DISPLAY_LABEL } from '@/lib/labels'
import { cn, formatPrice } from '@/lib/utils'
import { calcularPreciosDePago, porcentajeDesdePrecio } from '@/lib/medios-de-pago'
import type { AvailabilityMode, Category, Product, StockDisplayMode } from '@/types/database'

/**
 * Información, precio y publicación de una pieza.
 *
 * Las variantes y las fotos viven en sus propios bloques: meterlo todo en un
 * solo formulario gigante es la forma más rápida de que nadie lo complete.
 */
export function ProductForm({
  product,
  categories,
  defaults,
}: {
  product?: Product
  categories: Category[]
  defaults: {
    stockDisplay: StockDisplayMode
    lowStockThreshold: number
    cashDiscountPercent: number
    cardInstallments: number
  }
}) {
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const [availability, setAvailability] = React.useState<AvailabilityMode>(
    product?.availability_mode ?? 'in_stock',
  )
  const [hasSale, setHasSale] = React.useState(product?.sale_price != null)

  // Descuento por transferencia o efectivo. Nulo en la pieza significa "el de
  // la tienda", así que el interruptor arranca prendido solo si esta pieza
  // tiene uno propio.
  const [descuentoPropio, setDescuentoPropio] = React.useState(
    product?.cash_discount_percent != null,
  )
  const [descuento, setDescuento] = React.useState(
    product?.cash_discount_percent != null ? String(product.cash_discount_percent) : '',
  )

  // Precio y costo se llevan en estado para poder mostrar el margen mientras
  // se escribe. El resto del formulario va sin control: no hace falta.
  const [precio, setPrecio] = React.useState(String(product?.base_price ?? ''))
  const [costo, setCosto] = React.useState(String(product?.base_cost ?? ''))

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const number = (key: string) => {
      const raw = String(form.get(key) ?? '').trim()
      return raw === '' ? null : Number(raw)
    }

    const result = await saveProduct({
      id: product?.id,
      name: String(form.get('name') ?? ''),
      categoryId: String(form.get('categoryId') ?? '') || null,
      shortDescription: String(form.get('shortDescription') ?? ''),
      description: String(form.get('description') ?? ''),
      basePrice: number('basePrice') ?? 0,
      baseCost: number('baseCost'),
      salePrice: hasSale ? number('salePrice') : null,
      // Nulo a propósito cuando no tiene uno propio: así hereda el de la
      // tienda para siempre, en vez de quedar congelado en el valor de hoy.
      cashDiscountPercent: descuentoPropio ? (Number(descuento) || 0) : null,
      saleStartsAt: hasSale ? String(form.get('saleStartsAt') ?? '') || null : null,
      saleEndsAt: hasSale ? String(form.get('saleEndsAt') ?? '') || null : null,
      availabilityMode: availability,
      leadTimeDays: availability === 'made_to_order' ? number('leadTimeDays') : null,
      stockDisplay: String(form.get('stockDisplay') ?? 'vague') as StockDisplayMode,
      lowStockThreshold: number('lowStockThreshold') ?? defaults.lowStockThreshold,
      showWhenOutOfStock: form.get('showWhenOutOfStock') === 'on',
      isFeatured: form.get('isFeatured') === 'on',
      featuredPosition: number('featuredPosition') ?? 0,
      status: String(form.get('status') ?? 'draft') as 'draft' | 'published' | 'archived',
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)

    // Una pieza nueva pasa al editor completo, donde están variantes y fotos
    if (!product) {
      router.push(`/admin/productos/${result.productId}`)
    } else {
      router.refresh()
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* INFORMACION ------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Información</Overline>

        <Field label="Nombre de la pieza" required>
          {(props) => (
            <Input
              {...props}
              name="name"
              defaultValue={product?.name}
              placeholder="Respaldo Sol"
              maxLength={160}
            />
          )}
        </Field>

        <Field label="Categoría">
          {(props) => (
            <Select {...props} name="categoryId" defaultValue={product?.category_id ?? ''}>
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Descripción corta"
          hint="Se ve en las tarjetas del catálogo y al compartir la pieza."
        >
          {(props) => (
            <Input
              {...props}
              name="shortDescription"
              defaultValue={product?.short_description ?? ''}
              maxLength={300}
              placeholder="Tejida en algodon peinado, liviana y abrigada"
            />
          )}
        </Field>

        <Field label="Descripción completa" hint="Materiales, medidas, cuidados.">
          {(props) => (
            <Textarea
              {...props}
              name="description"
              defaultValue={product?.description ?? ''}
              rows={6}
              maxLength={8000}
            />
          )}
        </Field>
      </section>

      {/* PRECIO ------------------------------------------------------------ */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Precio</Overline>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio normal" required>
            {(props) => (
              <Input
                {...props}
                name="basePrice"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="tabular"
              />
            )}
          </Field>

          <Field
            label="Cuánto te cuesta"
            hint="Opcional. No sale nunca a la tienda."
          >
            {(props) => (
              <Input
                {...props}
                name="baseCost"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <MargenEnVivo precio={precio} costo={costo} />

        <PagoDeLaPieza
          precio={precio}
          propio={descuentoPropio}
          alCambiarPropio={setDescuentoPropio}
          descuento={descuento}
          alCambiarDescuento={setDescuento}
          porDefecto={defaults.cashDiscountPercent}
          cuotas={defaults.cardInstallments}
        />

        <Checkbox
          name="hasSale"
          label="Tiene precio promocional"
          description="Si una combinación concreta cuesta distinto, eso se configura en Variantes."
          checked={hasSale}
          onChange={(e) => setHasSale(e.target.checked)}
        />

        {hasSale && (
          <div className="grid gap-4 rounded-lg bg-surface-muted/60 p-3.5 sm:grid-cols-3">
            <Field label="Precio promocional" required>
              {(props) => (
                <Input
                  {...props}
                  name="salePrice"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={product?.sale_price ?? ''}
                  className="tabular"
                />
              )}
            </Field>
            <Field label="Desde" hint="Opcional">
              {(props) => (
                <Input
                  {...props}
                  name="saleStartsAt"
                  type="date"
                  defaultValue={product?.sale_starts_at?.slice(0, 10) ?? ''}
                />
              )}
            </Field>
            <Field label="Hasta" hint="Opcional">
              {(props) => (
                <Input
                  {...props}
                  name="saleEndsAt"
                  type="date"
                  defaultValue={product?.sale_ends_at?.slice(0, 10) ?? ''}
                />
              )}
            </Field>
          </div>
        )}
      </section>

      {/* DISPONIBILIDAD ---------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Disponibilidad</Overline>

        <div className="space-y-2">
          {(
            [
              {
                value: 'in_stock',
                label: 'Con stock',
                description: 'Hay unidades hechas. Se vende mientras queden.',
              },
              {
                value: 'made_to_order',
                label: 'A pedido',
                description: 'Se fabrica por encargo. Se puede comprar aunque el stock sea 0.',
              },
              {
                value: 'unique_piece',
                label: 'Pieza única',
                description: 'Una sola, irrepetible. Al venderse queda "vendida".',
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                availability === option.value
                  ? 'border-clay-400 bg-primary-soft/40'
                  : 'border-border-soft hover:border-border-strong'
              }`}
            >
              <input
                type="radio"
                name="availabilityMode"
                value={option.value}
                checked={availability === option.value}
                onChange={() => setAvailability(option.value)}
                className="mt-1 size-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm">
                <span className="block font-medium text-ink">{option.label}</span>
                <span className="block text-ink-subtle">{option.description}</span>
              </span>
            </label>
          ))}
        </div>

        {availability === 'made_to_order' && (
          <Field
            label="Tiempo de elaboración (días)"
            hint="Se le muestra al cliente: 'A pedido · ~15 días'."
          >
            {(props) => (
              <Input
                {...props}
                name="leadTimeDays"
                type="number"
                inputMode="numeric"
                min={1}
                defaultValue={product?.lead_time_days ?? ''}
                className="tabular"
              />
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Que ve el cliente del stock"
            hint="Mostrar el número exacto no siempre conviene."
          >
            {(props) => (
              <Select
                {...props}
                name="stockDisplay"
                defaultValue={product?.stock_display ?? defaults.stockDisplay}
              >
                {(Object.keys(STOCK_DISPLAY_LABEL) as StockDisplayMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {STOCK_DISPLAY_LABEL[mode]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Avisarme cuando queden" hint="Unidades o menos.">
            {(props) => (
              <Input
                {...props}
                name="lowStockThreshold"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={product?.low_stock_threshold ?? defaults.lowStockThreshold}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <Checkbox
          name="showWhenOutOfStock"
          label="Mantener visible cuando se agote"
          description="Aparece como agotada, con la opción de consultar si vuelve."
          defaultChecked={product?.show_when_out_of_stock ?? true}
        />
      </section>

      {/* PUBLICACION ------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Publicación</Overline>

        <Field label="Estado" hint="Un borrador no se ve en la tienda, ni por URL.">
          {(props) => (
            <Select {...props} name="status" defaultValue={product?.status ?? 'draft'}>
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </Select>
          )}
        </Field>

        <Checkbox
          name="isFeatured"
          label="Destacar en el inicio"
          description="Aparece en la sección de piezas destacadas."
          defaultChecked={product?.is_featured ?? false}
        />

        <Field label="Orden entre destacadas" hint="Menor número, más arriba.">
          {(props) => (
            <Input
              {...props}
              name="featuredPosition"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={product?.featured_position ?? 0}
              className="tabular w-28"
            />
          )}
        </Field>
      </section>

      <FormError>{error}</FormError>

      <div className="sticky bottom-16 z-10 flex flex-wrap gap-3 rounded-xl border border-border-soft bg-background/95 p-3 backdrop-blur-sm md:bottom-4">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? <Ovillo /> : saved ? <Check /> : null}
          {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
        </Button>

        {product?.status === 'published' && (
          <Button asChild variant="secondary" size="lg">
            <a href={`/producto/${product.slug}`} target="_blank" rel="noopener noreferrer">
              <Eye />
              Ver en la tienda
            </a>
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * El margen, mientras se escribe el precio.
 *
 * El numero que importa no es el precio ni el costo: es la diferencia. Verla
 * recien en un informe a fin de mes es tarde para cambiarla; verla mientras
 * se decide el precio es el momento en que sirve.
 *
 * No se muestra nada si falta alguno de los dos: un margen de 100% porque no
 * hay costo cargado es peor que ningun margen.
 */
/**
 * Los dos precios de la pieza, según cómo se pague.
 *
 * POR QUÉ SE PUEDE ESCRIBIR EL PRECIO Y NO SOLO EL PORCENTAJE
 * Nadie decide "16,28 % de descuento". Se decide "este respaldo lo doy a
 * 180 lucas por transferencia". Así que los dos campos editan lo mismo y cada
 * uno calcula el otro.
 *
 * Lo que se GUARDA es siempre el porcentaje -ver la migración 0018-, para que
 * el precio de contado siga al de lista cuando éste cambie. Si se guardara el
 * precio, subir el de lista dejaría el de contado viejo y nadie se enteraría
 * hasta cobrar de menos.
 *
 * EL BORRADOR
 * Mientras se escribe en el campo del precio, lo que se muestra es el
 * borrador y no el valor recalculado. Sin eso los dos campos se pelean: cada
 * tecla recalcularía el porcentaje, el porcentaje recalcularía el precio, y el
 * cursor saltaría encima de lo que se está tipeando.
 */
function PagoDeLaPieza({
  precio,
  propio,
  alCambiarPropio,
  descuento,
  alCambiarDescuento,
  porDefecto,
  cuotas,
}: {
  precio: string
  propio: boolean
  alCambiarPropio: (v: boolean) => void
  descuento: string
  alCambiarDescuento: (v: string) => void
  porDefecto: number
  cuotas: number
}) {
  const [borrador, setBorrador] = React.useState<string | null>(null)

  const aplicado = propio ? Number(descuento) || 0 : porDefecto
  const p = calcularPreciosDePago({
    precioTarjeta: precio,
    porcentajeContado: aplicado,
    cuotas,
  })

  function escribirPrecio(valor: string) {
    setBorrador(valor)
    const pct = porcentajeDesdePrecio({ precioTarjeta: precio, precioContado: valor })
    if (pct != null) alCambiarDescuento(String(pct))
  }

  return (
    <div className="space-y-3.5 rounded-lg bg-surface-muted/60 p-3.5">
      <Checkbox
        name="descuentoPropio"
        label="Esta pieza tiene su propio descuento por transferencia"
        description={`Si lo dejás destildado usa el de la tienda: ${porDefecto}%.`}
        checked={propio}
        onChange={(e) => {
          alCambiarPropio(e.target.checked)
          // Al prender el interruptor arranca desde el de la tienda, que es el
          // número que ya estaba rigiendo: así se ajusta en vez de empezar de
          // cero y dejar la pieza sin descuento por un paso intermedio.
          if (e.target.checked && !descuento) alCambiarDescuento(String(porDefecto))
          setBorrador(null)
        }}
      />

      {propio && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Descuento" hint="En porcentaje">
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="decimal"
                min={0}
                max={99.99}
                step={0.01}
                value={descuento}
                onChange={(e) => {
                  alCambiarDescuento(e.target.value)
                  setBorrador(null)
                }}
                className="tabular"
              />
            )}
          </Field>

          <Field label="O el precio que querés cobrar" hint="Por transferencia o efectivo">
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={borrador ?? (p.contado || '')}
                onChange={(e) => escribirPrecio(e.target.value)}
                onBlur={() => setBorrador(null)}
                className="tabular"
              />
            )}
          </Field>
        </div>
      )}

      {p.tarjeta > 0 && (
        <dl className="space-y-1.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-ink-soft">Con tarjeta</dt>
            <dd className="tabular font-medium">
              {formatPrice(p.tarjeta)}
              {p.cuotas > 1 && (
                <span className="ml-2 font-normal opacity-75">
                  ({p.cuotas} × {formatPrice(p.valorCuota)})
                </span>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-ink-soft">Por transferencia o efectivo</dt>
            <dd className="tabular font-medium text-sage-600">
              {formatPrice(p.contado)}
              {p.hayDescuento && (
                <span className="ml-2 font-normal opacity-75">(−{p.porcentaje}%)</span>
              )}
            </dd>
          </div>
          {p.hayDescuento && (
            <p className="pt-0.5 text-xs text-ink-soft">
              La clienta se ahorra {formatPrice(p.ahorro)}. Es el número que va a ver en la
              tienda.
            </p>
          )}
        </dl>
      )}
    </div>
  )
}

function MargenEnVivo({ precio, costo }: { precio: string; costo: string }) {
  const p = Number(precio)
  const c = Number(costo)

  if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0 || c <= 0) return null

  const ganancia = p - c
  const margen = (ganancia / p) * 100
  const perdida = ganancia <= 0

  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg px-3.5 py-3 text-sm',
        perdida ? 'bg-danger/10 text-danger' : 'bg-sage-100 text-sage-600',
      )}
    >
      <span className="font-medium">
        {perdida ? 'Estas perdiendo plata' : 'Te queda'}
      </span>
      <span className="tabular">
        {formatPrice(ganancia)} por unidad
        <span className="ml-2 opacity-75">({margen.toFixed(0)}% de margen)</span>
      </span>
    </div>
  )
}
