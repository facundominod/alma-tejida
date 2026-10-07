'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input, Select } from '@/components/ui/field'
import { Badge, Overline } from '@/components/ui/primitives'
import { saveProductStructure } from '@/lib/actions/admin/catalog'
import { cn, formatPrice } from '@/lib/utils'
import type { AttributeType } from '@/types/database'

/**
 * Características y variantes (puntos 35-40, 102-105, 190).
 *
 * El flujo es exactamente el del punto 103:
 *   + Agregar característica → "Color" → opciones: Crudo, Rosa, Verde
 *   + Agregar característica → "Medida" → opciones: 1,20x1,50 / 1,50x2,00
 *   → Generar combinaciones → borrar las que no se fabrican → guardar
 *
 * Generar combinaciones NO pisa lo que ya existe: una combinación que ya
 * estaba conserva su id, su SKU y su stock. Regenerar después de agregar un
 * color no puede costarle el inventario a nadie.
 *
 * El stock NO se edita acá: se carga en la pantalla de Stock, que deja su
 * movimiento. Acá solo se ve, para saber que se está tocando.
 */

let counter = 0
const nextKey = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`

export type ValueDraft = {
  key: string
  id?: string | null
  value: string
  color_hex?: string | null
}

export type AttributeDraft = {
  key: string
  id?: string | null
  name: string
  type: AttributeType
  values: ValueDraft[]
}

export type VariantDraft = {
  key: string
  id?: string | null
  options: Record<string, string>
  sku: string
  price_override: string
  is_active: boolean
  stock?: number
  reserved?: number
}

const TYPE_LABELS: Record<AttributeType, string> = {
  select: 'Opciones (lista)',
  color: 'Color',
  measure: 'Medida',
  number: 'Número',
  text: 'Texto libre',
}

export function VariantBuilder({
  productId,
  basePrice,
  initialAttributes,
  initialVariants,
}: {
  productId: string
  basePrice: number
  initialAttributes: AttributeDraft[]
  initialVariants: VariantDraft[]
}) {
  const router = useRouter()
  const [attributes, setAttributes] = React.useState<AttributeDraft[]>(initialAttributes)
  const [variants, setVariants] = React.useState<VariantDraft[]>(initialVariants)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const hasAttributes = attributes.length > 0

  /* ---------------------------------------------------------------- atributos */
  function addAttribute() {
    setAttributes((current) => [
      ...current,
      { key: nextKey('attr'), name: '', type: 'select', values: [] },
    ])
  }

  function updateAttribute(key: string, patch: Partial<AttributeDraft>) {
    setAttributes((current) =>
      current.map((attr) => (attr.key === key ? { ...attr, ...patch } : attr)),
    )
  }

  function removeAttribute(key: string) {
    setAttributes((current) => current.filter((attr) => attr.key !== key))
    // Las variantes que dependian de ese atributo dejan de tener sentido
    setVariants((current) =>
      current.map((variant) => ({
        ...variant,
        options: Object.fromEntries(
          Object.entries(variant.options).filter(([attrKey]) => attrKey !== key),
        ),
      })),
    )
  }

  function addValue(attrKey: string) {
    setAttributes((current) =>
      current.map((attr) =>
        attr.key === attrKey
          ? { ...attr, values: [...attr.values, { key: nextKey('val'), value: '' }] }
          : attr,
      ),
    )
  }

  function updateValue(attrKey: string, valueKey: string, patch: Partial<ValueDraft>) {
    setAttributes((current) =>
      current.map((attr) =>
        attr.key === attrKey
          ? {
              ...attr,
              values: attr.values.map((value) =>
                value.key === valueKey ? { ...value, ...patch } : value,
              ),
            }
          : attr,
      ),
    )
  }

  function removeValue(attrKey: string, valueKey: string) {
    setAttributes((current) =>
      current.map((attr) =>
        attr.key === attrKey
          ? { ...attr, values: attr.values.filter((value) => value.key !== valueKey) }
          : attr,
      ),
    )
    setVariants((current) =>
      current.filter((variant) => variant.options[attrKey] !== valueKey),
    )
  }

  /* ---------------------------------------------------------------- variantes */

  /** Firma estable de una combinación, para reconocerla entre regeneraciones. */
  const signature = React.useCallback(
    (options: Record<string, string>) =>
      Object.entries(options)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([attr, value]) => `${attr}:${value}`)
        .join('|'),
    [],
  )

  function generateCombinations() {
    const usable = attributes.filter((attr) => attr.values.some((v) => v.value.trim()))
    if (usable.length === 0) return

    let combos: Array<Record<string, string>> = [{}]
    for (const attr of usable) {
      const next: Array<Record<string, string>> = []
      for (const combo of combos) {
        for (const value of attr.values.filter((v) => v.value.trim())) {
          next.push({ ...combo, [attr.key]: value.key })
        }
      }
      combos = next
    }

    const existing = new Map(variants.map((v) => [signature(v.options), v]))

    setVariants(
      combos.map((options) => {
        // Si esta combinación ya existia, se conserva TAL CUAL: id, SKU,
        // precio y stock incluidos.
        const previous = existing.get(signature(options))
        if (previous) return previous

        return {
          key: nextKey('var'),
          options,
          sku: '',
          price_override: '',
          is_active: true,
        }
      }),
    )
  }

  function removeVariant(key: string) {
    setVariants((current) => current.filter((variant) => variant.key !== key))
  }

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((current) =>
      current.map((variant) => (variant.key === key ? { ...variant, ...patch } : variant)),
    )
  }

  function labelFor(options: Record<string, string>) {
    return attributes
      .map((attr) => attr.values.find((v) => v.key === options[attr.key])?.value)
      .filter(Boolean)
      .join(' · ')
  }

  /* ------------------------------------------------------------------ guardar */
  async function save() {
    setSaving(true)
    setError(null)

    const cleanAttributes = attributes
      .filter((attr) => attr.name.trim())
      .map((attr) => ({
        key: attr.key,
        id: attr.id ?? null,
        name: attr.name.trim(),
        type: attr.type,
        values: attr.values
          .filter((value) => value.value.trim())
          .map((value) => ({
            key: value.key,
            id: value.id ?? null,
            value: value.value.trim(),
            color_hex: attr.type === 'color' ? (value.color_hex ?? null) : null,
          })),
      }))

    const result = await saveProductStructure({
      productId,
      attributes: cleanAttributes,
      variants: variants.map((variant) => ({
        id: variant.id ?? null,
        options: variant.options,
        sku: variant.sku.trim() || null,
        price_override: variant.price_override.trim() || null,
        is_active: variant.is_active,
      })),
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* CARACTERISTICAS --------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Overline>Características</Overline>
            <p className="mt-1 text-sm text-ink-muted">
              Cada pieza define las suyas. Un respaldo puede tener medida y color;
              un espejo, diámetro y terminación.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={addAttribute}>
            <Plus />
            Agregar característica
          </Button>
        </div>

        {!hasAttributes && (
          <p className="rounded-lg bg-surface-muted px-3.5 py-3 text-sm text-ink-muted">
            Sin características, esta es una pieza simple: un solo precio y un solo
            stock. Perfecto para una pieza única.
          </p>
        )}

        {attributes.map((attr) => (
          <div key={attr.key} className="space-y-3 rounded-lg border border-border-soft p-3.5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Nombre" className="min-w-40 flex-1">
                {(props) => (
                  <Input
                    {...props}
                    value={attr.name}
                    onChange={(e) => updateAttribute(attr.key, { name: e.target.value })}
                    placeholder="Color"
                    maxLength={60}
                  />
                )}
              </Field>

              <Field label="Tipo" className="w-44">
                {(props) => (
                  <Select
                    {...props}
                    value={attr.type}
                    onChange={(e) =>
                      updateAttribute(attr.key, { type: e.target.value as AttributeType })
                    }
                  >
                    {(Object.keys(TYPE_LABELS) as AttributeType[]).map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeAttribute(attr.key)}
                aria-label={`Quitar la característica ${attr.name || 'sin nombre'}`}
                className="text-ink-subtle hover:text-danger"
              >
                <Trash2 />
              </Button>
            </div>

            <div className="space-y-2">
              {attr.values.map((value) => (
                <div key={value.key} className="flex items-center gap-2">
                  {attr.type === 'color' && (
                    <input
                      type="color"
                      value={value.color_hex ?? '#EFE6DA'}
                      onChange={(e) =>
                        updateValue(attr.key, value.key, { color_hex: e.target.value })
                      }
                      className="size-11 shrink-0 cursor-pointer rounded-lg border border-border-soft bg-surface p-1"
                      aria-label={`Color de ${value.value || 'la opción'}`}
                    />
                  )}
                  <Input
                    value={value.value}
                    onChange={(e) =>
                      updateValue(attr.key, value.key, { value: e.target.value })
                    }
                    placeholder={attr.type === 'measure' ? '1,50 x 2,00' : 'Crudo'}
                    maxLength={80}
                    aria-label="Opción"
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeValue(attr.key, value.key)}
                    aria-label="Quitar opción"
                    className="shrink-0 text-ink-subtle hover:text-danger"
                  >
                    <X />
                  </Button>
                </div>
              ))}

              <Button size="sm" variant="ghost" onClick={() => addValue(attr.key)}>
                <Plus />
                Agregar opción
              </Button>
            </div>
          </div>
        ))}
      </section>

      {/* COMBINACIONES ----------------------------------------------------- */}
      {hasAttributes && (
        <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Overline>Combinaciones</Overline>
              <p className="mt-1 text-sm text-ink-muted">
                Genera todas y borra las que no fabricas.
              </p>
            </div>
            <Button size="sm" variant="soft" onClick={generateCombinations}>
              <Sparkles />
              Generar combinaciones
            </Button>
          </div>

          {variants.length === 0 ? (
            <p className="rounded-lg bg-surface-muted px-3.5 py-3 text-sm text-ink-muted">
              Todavía no generaste combinaciones.
            </p>
          ) : (
            <ul className="space-y-2">
              {variants.map((variant) => {
                const label = labelFor(variant.options) || 'Combinación'
                const effective = variant.price_override.trim()
                  ? Number(variant.price_override)
                  : basePrice

                return (
                  <li
                    key={variant.key}
                    className={cn(
                      'rounded-lg border p-3',
                      variant.is_active ? 'border-border-soft' : 'border-dashed opacity-60',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{label}</span>
                        {variant.id && variant.stock != null && (
                          <Badge
                            tone={variant.stock > 0 ? 'neutral' : 'warning'}
                            size="sm"
                          >
                            stock {variant.stock}
                            {variant.reserved ? ` · ${variant.reserved} reservado` : ''}
                          </Badge>
                        )}
                        {!variant.id && (
                          <Badge tone="primary" size="sm">
                            nueva
                          </Badge>
                        )}
                      </div>

                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removeVariant(variant.key)}
                        aria-label={`Quitar ${label}`}
                        className="text-ink-subtle hover:text-danger"
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        value={variant.sku}
                        onChange={(e) =>
                          updateVariant(variant.key, { sku: e.target.value })
                        }
                        placeholder="SKU interno (opcional)"
                        maxLength={60}
                        aria-label={`SKU de ${label}`}
                        className="h-10 text-sm"
                      />
                      <Input
                        value={variant.price_override}
                        onChange={(e) =>
                          updateVariant(variant.key, { price_override: e.target.value })
                        }
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder={`Precio propio (${formatPrice(basePrice)})`}
                        aria-label={`Precio de ${label}`}
                        className="tabular h-10 text-sm"
                      />
                      <label className="flex items-center gap-2 text-sm text-ink-muted">
                        <input
                          type="checkbox"
                          checked={variant.is_active}
                          onChange={(e) =>
                            updateVariant(variant.key, { is_active: e.target.checked })
                          }
                          className="size-4 accent-[var(--color-primary)]"
                        />
                        A la venta
                      </label>
                    </div>

                    {variant.price_override.trim() && (
                      <p className="tabular mt-1 text-xs text-ink-subtle">
                        Se vende a {formatPrice(effective)} en vez de{' '}
                        {formatPrice(basePrice)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <p className="text-xs text-ink-subtle">
            El stock de cada combinación se carga en{' '}
            <a href="/admin/stock" className="underline">
              Stock
            </a>
            , para que cada movimiento quede registrado.
          </p>
        </section>
      )}

      <FormError>{error}</FormError>

      <div className="sticky bottom-16 z-10 rounded-xl border border-border-soft bg-background/95 p-3 backdrop-blur-sm md:bottom-4">
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : saved ? <Check /> : null}
          {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar características'}
        </Button>
      </div>
    </div>
  )
}
