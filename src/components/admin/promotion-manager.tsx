'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Loader2, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/field'
import { Badge, EmptyState } from '@/components/ui/primitives'
import {
  deletePromotion,
  savePromotion,
  togglePromotion,
} from '@/lib/actions/admin/catalog'
import { formatDate, formatPrice } from '@/lib/utils'
import type { Category, DiscountType, Promotion } from '@/types/database'

type PromotionRow = Promotion & { target_count: number; is_current: boolean }

/**
 * Promociones (puntos 25, 106, 107).
 *
 * El descuento se calcula SIEMPRE en la base, con la misma función que usa el
 * catálogo, la ficha y el pedido. Acá solo se define a que alcanza y cuando
 * rige; no hay una segunda cuenta que pueda dar distinto.
 */
export function PromotionManager({
  promotions,
  categories,
  products,
}: {
  promotions: PromotionRow[]
  categories: Category[]
  products: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<PromotionRow | 'new' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)

  function describe(promo: PromotionRow) {
    if (promo.discount_type === 'percent') return `${Number(promo.discount_value)}% menos`
    if (promo.discount_type === 'fixed_price')
      return `Precio fijo ${formatPrice(promo.discount_value)}`
    return `${formatPrice(promo.discount_value)} de descuento`
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus />
          Nueva promoción
        </Button>
      </div>

      <FormError>{error}</FormError>

      {editing && (
        <PromotionForm
          promotion={editing === 'new' ? undefined : editing}
          categories={categories}
          products={products}
          onDone={() => {
            setEditing(null)
            router.refresh()
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {promotions.length === 0 && !editing ? (
        <EmptyState
          icon={<Tag className="size-10" strokeWidth={1.3} />}
          title="Todavía no hay promociones"
          description="Un 20% en mantas, un precio especial, una liquidación. Se crean acá y aparecen solas en el inicio y en Ofertas."
          action={<Button onClick={() => setEditing('new')}>Crear la primera</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {promotions.map((promo) => {
            const current = promo.is_current

            return (
              <li
                key={promo.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border-soft bg-surface p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{promo.title}</p>
                    <Badge tone={current ? 'success' : 'neutral'} size="sm">
                      {current
                        ? 'Vigente'
                        : promo.is_active
                          ? 'Fuera de fecha'
                          : 'Apagada'}
                    </Badge>
                    {promo.show_in_hero && (
                      <Badge tone="wood" size="sm">
                        En el inicio
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-subtle">
                    {describe(promo)} · {promo.target_count}{' '}
                    {promo.target_count === 1 ? 'destino' : 'destinos'}
                    {promo.starts_at && ` · desde ${formatDate(promo.starts_at)}`}
                    {promo.ends_at && ` · hasta ${formatDate(promo.ends_at)}`}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={promo.is_active ? 'secondary' : 'soft'}
                    disabled={pending === promo.id}
                    onClick={async () => {
                      setPending(promo.id)
                      const result = await togglePromotion(promo.id, !promo.is_active)
                      setPending(null)
                      if (!result.ok) setError(result.error)
                      else router.refresh()
                    }}
                  >
                    {pending === promo.id && <Loader2 className="animate-spin" />}
                    {promo.is_active ? 'Apagar' : 'Encender'}
                  </Button>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditing(promo)}
                    aria-label={`Editar ${promo.title}`}
                  >
                    <Pencil />
                  </Button>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-ink-subtle hover:text-danger"
                    aria-label={`Borrar ${promo.title}`}
                    onClick={async () => {
                      setPending(promo.id)
                      const result = await deletePromotion(promo.id)
                      setPending(null)
                      if (!result.ok) setError(result.error)
                      else router.refresh()
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-ink-subtle">
        Los pedidos guardan el descuento que se aplico en el momento. Apagar o borrar
        una promoción no cambia ninguna venta pasada.
      </p>
    </div>
  )
}

function PromotionForm({
  promotion,
  categories,
  products,
  onDone,
  onCancel,
}: {
  promotion?: PromotionRow
  categories: Category[]
  products: Array<{ id: string; name: string }>
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [type, setType] = React.useState<DiscountType>(
    promotion?.discount_type ?? 'percent',
  )
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([])
  const [selectedProducts, setSelectedProducts] = React.useState<string[]>([])

  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    id: string,
  ) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const result = await savePromotion({
      id: promotion?.id,
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      discountType: type,
      discountValue: Number(form.get('discountValue') ?? 0),
      startsAt: String(form.get('startsAt') ?? '') || null,
      endsAt: String(form.get('endsAt') ?? '') || null,
      isActive: form.get('isActive') === 'on',
      showInHero: form.get('showInHero') === 'on',
      position: Number(form.get('position') ?? 0),
      ctaLabel: String(form.get('ctaLabel') ?? ''),
      ctaHref: String(form.get('ctaHref') ?? ''),
      productIds: selectedProducts,
      categoryIds: selectedCategories,
    })

    setPending(false)
    if (!result.ok) setError(result.error)
    else onDone()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-clay-200 bg-clay-50/50 p-4"
    >
      <h2 className="font-display text-lg">
        {promotion ? `Editar ${promotion.title}` : 'Nueva promoción'}
      </h2>

      <Field label="Título" required hint="Es lo que se lee en el inicio.">
        {(props) => (
          <Input
            {...props}
            name="title"
            defaultValue={promotion?.title}
            placeholder="20% en mantas"
            maxLength={120}
          />
        )}
      </Field>

      <Field label="Descripción">
        {(props) => (
          <Textarea
            {...props}
            name="description"
            defaultValue={promotion?.description ?? ''}
            rows={2}
            maxLength={300}
            placeholder="Hasta el domingo, en todas las mantas tejidas a mano"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de descuento" required>
          {(props) => (
            <Select
              {...props}
              value={type}
              onChange={(e) => setType(e.target.value as DiscountType)}
            >
              <option value="percent">Porcentaje</option>
              <option value="amount_off">Monto de descuento</option>
              <option value="fixed_price">Precio especial</option>
            </Select>
          )}
        </Field>

        <Field
          label={type === 'percent' ? 'Porcentaje' : 'Monto'}
          required
          hint={
            type === 'percent'
              ? 'Entre 1 y 100'
              : type === 'fixed_price'
                ? 'El precio al que queda'
                : 'Cuanto se descuenta'
          }
        >
          {(props) => (
            <Input
              {...props}
              name="discountValue"
              type="number"
              inputMode="numeric"
              min={1}
              max={type === 'percent' ? 100 : undefined}
              defaultValue={promotion?.discount_value ?? ''}
              className="tabular"
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Desde" hint="Opcional. Vacío = ya rige.">
          {(props) => (
            <Input
              {...props}
              name="startsAt"
              type="date"
              defaultValue={promotion?.starts_at?.slice(0, 10) ?? ''}
            />
          )}
        </Field>
        <Field label="Hasta" hint="Opcional. Vacío = sin fecha de corte.">
          {(props) => (
            <Input
              {...props}
              name="endsAt"
              type="date"
              defaultValue={promotion?.ends_at?.slice(0, 10) ?? ''}
            />
          )}
        </Field>
      </div>

      {/* Alcance */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">A que alcanza</legend>

        {categories.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-subtle">Categorías enteras</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    toggle(selectedCategories, setSelectedCategories, category.id)
                  }
                  aria-pressed={selectedCategories.includes(category.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selectedCategories.includes(category.id)
                      ? 'border-clay-400 bg-primary-soft font-medium text-clay-700'
                      : 'border-border-soft bg-surface text-ink-muted'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {products.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-subtle">Piezas sueltas</p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border-soft bg-surface p-2">
              {products.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-surface-muted"
                >
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(product.id)}
                    onChange={() => toggle(selectedProducts, setSelectedProducts, product.id)}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  {product.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {promotion && (
          <p className="text-xs text-ink-subtle">
            Al guardar se reemplaza el alcance anterior por lo que elijas ahora.
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Texto del botón" hint="Por defecto: Ver piezas">
          {(props) => (
            <Input
              {...props}
              name="ctaLabel"
              defaultValue={promotion?.cta_label ?? ''}
              maxLength={40}
            />
          )}
        </Field>
        <Field label="A donde lleva" hint="Por defecto: /ofertas">
          {(props) => (
            <Input
              {...props}
              name="ctaHref"
              defaultValue={promotion?.cta_href ?? ''}
              placeholder="/categoria/mantas"
              maxLength={200}
            />
          )}
        </Field>
      </div>

      <div className="space-y-2">
        <Checkbox
          name="isActive"
          label="Encendida"
          defaultChecked={promotion?.is_active ?? true}
        />
        <Checkbox
          name="showInHero"
          label="Mostrar en el inicio"
          description="Aparece en el carrusel de promociones."
          defaultChecked={promotion?.show_in_hero ?? true}
        />
      </div>

      <Field label="Orden en el carrusel">
        {(props) => (
          <Input
            {...props}
            name="position"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={promotion?.position ?? 0}
            className="tabular w-28"
          />
        )}
      </Field>

      <FormError>{error}</FormError>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Guardar promoción
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X />
          Cancelar
        </Button>
      </div>
    </form>
  )
}
