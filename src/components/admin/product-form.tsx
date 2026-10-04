'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/field'
import { Overline } from '@/components/ui/primitives'
import { saveProduct } from '@/lib/actions/admin/catalog'
import { STOCK_DISPLAY_LABEL } from '@/lib/labels'
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
  defaults: { stockDisplay: StockDisplayMode; lowStockThreshold: number }
}) {
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const [availability, setAvailability] = React.useState<AvailabilityMode>(
    product?.availability_mode ?? 'in_stock',
  )
  const [hasSale, setHasSale] = React.useState(product?.sale_price != null)

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
      salePrice: hasSale ? number('salePrice') : null,
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
              placeholder="Manta Roma"
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

        <Field label="Precio normal" required>
          {(props) => (
            <Input
              {...props}
              name="basePrice"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={product?.base_price ?? ''}
              className="tabular"
            />
          )}
        </Field>

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
          {saving ? <Loader2 className="animate-spin" /> : saved ? <Check /> : null}
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
