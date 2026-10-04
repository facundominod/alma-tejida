'use client'

import { AnimatePresence, motion } from 'motion/react'
import * as React from 'react'
import { Check, MessageCircle, ShoppingBag } from 'lucide-react'
import { QuantityStepper } from '@/components/tienda/cart-sheet'
import { Button } from '@/components/ui/button'
import { Badge, Price } from '@/components/ui/primitives'
import { trackEvent } from '@/lib/analytics/track'
import { useCart } from '@/lib/cart/cart-store'
import { coverUrl, storageUrl } from '@/lib/images'
import { availabilityView } from '@/lib/labels'
import { cn, whatsappLink } from '@/lib/utils'
import type {
  CatalogProduct,
  ProductAttribute,
  ProductAttributeValue,
  ProductMedia,
  VariantView,
} from '@/types/database'

type AttributeWithValues = ProductAttribute & { values: ProductAttributeValue[] }

/**
 * El bloque de compra.
 *
 * Resuelve la variante a partir de la combinación elegida, muestra el precio y
 * la disponibilidad de ESA combinación, y desactiva las opciones que no
 * existen o están agotadas antes de que alguien las toque.
 *
 * Cambiar de color no mueve el layout: precio y disponibilidad ocupan siempre
 * el mismo alto. Un salto de layout al elegir una opción es exactamente lo que
 * el presupuesto de CLS prohibe.
 */
export function BuyBox({
  product,
  variants,
  attributes,
  combinations,
  media,
  whatsappNumber,
  onSelectionChange,
}: {
  product: CatalogProduct
  variants: VariantView[]
  attributes: AttributeWithValues[]
  combinations: Record<string, Record<string, string>>
  media: ProductMedia[]
  whatsappNumber: string | null
  onSelectionChange?: (valueId: string | null) => void
}) {
  const cart = useCart()

  // Un producto simple tiene una sola variante sin opciones: no hay nada
  // que elegir y la interfaz no menciona la palabra "variante".
  const hasOptions = attributes.length > 0 && variants.length > 1

  const [selection, setSelection] = React.useState<Record<string, string>>(() =>
    hasOptions ? preselect(attributes, variants, combinations) : {},
  )
  const [requestedQuantity, setQuantity] = React.useState(1)
  const [justAdded, setJustAdded] = React.useState(false)

  const selectedVariant = React.useMemo(() => {
    if (!hasOptions) return variants[0] ?? null
    return (
      variants.find((variant) => {
        const combo = combinations[variant.variant_id]
        if (!combo) return false
        return attributes.every((attr) => combo[attr.id] === selection[attr.id])
      }) ?? null
    )
  }, [hasOptions, variants, combinations, attributes, selection])

  const colorAttribute = attributes.find((attribute) => attribute.type === 'color')

  /**
   * Elegir una opción avisa al padre, para que la galería ponga adelante las
   * fotos de ese color (punto 105). Se hace en el manejador del evento, no en
   * un efecto: el cambio nace de una acción de la persona, y es ahí donde
   * corresponde reaccionar.
   */
  function selectOption(attributeId: string, valueId: string) {
    const next = { ...selection, [attributeId]: valueId }
    setSelection(next)

    if (onSelectionChange && colorAttribute) {
      onSelectionChange(next[colorAttribute.id] ?? null)
    }
  }

  const availability = availabilityView({
    mode: product.availability_mode,
    display: product.stock_display,
    available: selectedVariant?.available ?? 0,
    threshold: selectedVariant?.low_stock_threshold ?? product.low_stock_threshold,
    leadTimeDays: product.lead_time_days,
  })

  const maxQuantity =
    product.availability_mode === 'made_to_order'
      ? 99
      : Math.max(selectedVariant?.available ?? 0, 1)

  // La cantidad se acota DURANTE EL RENDER, no con un efecto. Al cambiar a
  // una variante con menos stock, el número baja solo en el mismo render: sin
  // parpadeo y sin un render extra.
  const quantity = Math.min(requestedQuantity, Math.min(maxQuantity, 99))

  const canBuy = Boolean(selectedVariant) && availability.canBuy

  function handleAdd() {
    if (!selectedVariant || !canBuy) return

    // La foto de la variante si existe; si no, la portada del producto
    const variantImage = media.find((m) => m.variant_id === selectedVariant.variant_id)
    const image = variantImage
      ? storageUrl(variantImage.thumb_path ?? variantImage.storage_path)
      : coverUrl(product)

    cart.add(
      {
        variantId: selectedVariant.variant_id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        variantLabel: selectedVariant.variant_label,
        image,
        price: Number(selectedVariant.final_price ?? 0),
        listPrice:
          selectedVariant.list_price && selectedVariant.discount_amount
            ? Number(selectedVariant.list_price)
            : null,
        maxAvailable: selectedVariant.available,
        madeToOrder: product.availability_mode === 'made_to_order',
      },
      quantity,
    )

    void trackEvent('add_to_cart', {
      productId: product.id,
      variantId: selectedVariant.variant_id,
      metadata: { quantity },
    })

    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1800)
  }

  const whatsapp = whatsappLink(
    whatsappNumber,
    `Hola! Estoy consultando por ${product.name}` +
      (selectedVariant?.variant_label ? ` (${selectedVariant.variant_label})` : '') +
      '.',
  )

  return (
    <div className="space-y-6">
      {/* PRECIO — alto fijo: cambiar de variante no mueve nada */}
      <div className="min-h-[52px] space-y-1">
        <Price
          final={selectedVariant?.final_price ?? product.final_price}
          list={
            selectedVariant?.discount_amount
              ? selectedVariant.list_price
              : product.discount_percent
                ? product.list_price
                : null
          }
          size="lg"
        />
        {selectedVariant?.promotion_title && (
          <Badge tone="sale" size="sm">
            {selectedVariant.promotion_title}
          </Badge>
        )}
      </div>

      {/* OPCIONES */}
      {hasOptions && (
        <div className="space-y-5">
          {attributes.map((attribute) => (
            <AttributeSelector
              key={attribute.id}
              attribute={attribute}
              selection={selection}
              attributes={attributes}
              variants={variants}
              combinations={combinations}
              onSelect={(valueId) => selectOption(attribute.id, valueId)}
            />
          ))}
        </div>
      )}

      {/* DISPONIBILIDAD — alto fijo */}
      <div className="min-h-[24px]">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-sm font-medium',
            availability.tone === 'success' && 'text-success',
            availability.tone === 'warning' && 'text-warning',
            availability.tone === 'danger' && 'text-danger',
            availability.tone === 'neutral' && 'text-ink-muted',
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              availability.tone === 'success' && 'bg-success',
              availability.tone === 'warning' && 'bg-warning',
              availability.tone === 'danger' && 'bg-danger',
              availability.tone === 'neutral' && 'bg-linen-400',
            )}
            aria-hidden="true"
          />
          {selectedVariant ? availability.label : 'Elegí una combinación'}
        </span>
      </div>

      {/* ACCIONES */}
      <div className="space-y-3">
        {canBuy && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted">Cantidad</span>
            <QuantityStepper
              value={quantity}
              max={Math.min(maxQuantity, 99)}
              onChange={setQuantity}
              label={product.name}
              size="md"
            />
          </div>
        )}

        <Button size="lg" block onClick={handleAdd} disabled={!canBuy}>
          <AnimatePresence mode="wait" initial={false}>
            {justAdded ? (
              <motion.span
                key="added"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="inline-flex items-center gap-2"
              >
                <Check className="size-5" />
                Agregado
              </motion.span>
            ) : (
              <motion.span
                key="add"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="inline-flex items-center gap-2"
              >
                <ShoppingBag className="size-5" />
                {canBuy ? 'Agregar al carrito' : 'Sin stock'}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>

        {whatsapp && (
          <Button
            asChild
            variant="whatsapp"
            size="lg"
            block
            onClick={() => void trackEvent('whatsapp_click', { productId: product.id })}
          >
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              Consultar por WhatsApp
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Selector de un atributo.
 *
 * Una opción se desactiva cuando ninguna variante activa la incluye junto con
 * el resto de lo ya elegido. Es mejor no poder elegir "Rosa / 1,50x2,00" que
 * elegirlo y descubrir después que no existe.
 */
function AttributeSelector({
  attribute,
  attributes,
  selection,
  variants,
  combinations,
  onSelect,
}: {
  attribute: AttributeWithValues
  attributes: AttributeWithValues[]
  selection: Record<string, string>
  variants: VariantView[]
  combinations: Record<string, Record<string, string>>
  onSelect: (valueId: string) => void
}) {
  const otherAttributes = attributes.filter((a) => a.id !== attribute.id)

  function statusFor(valueId: string): 'ok' | 'sold-out' | 'unavailable' {
    const matching = variants.filter((variant) => {
      const combo = combinations[variant.variant_id]
      if (!combo || combo[attribute.id] !== valueId) return false
      return otherAttributes.every(
        (other) => !selection[other.id] || combo[other.id] === selection[other.id],
      )
    })

    if (matching.length === 0) return 'unavailable'
    return matching.some((v) => v.available > 0) ? 'ok' : 'sold-out'
  }

  const selectedValue = attribute.values.find((v) => v.id === selection[attribute.id])
  const isColor = attribute.type === 'color'

  return (
    <fieldset>
      <legend className="mb-2 text-sm">
        <span className="font-medium text-ink">{attribute.name}</span>
        {selectedValue && (
          <span className="text-ink-muted">: {selectedValue.value}</span>
        )}
      </legend>

      <div className="flex flex-wrap gap-2">
        {attribute.values.map((value) => {
          const status = statusFor(value.id)
          const active = selection[attribute.id] === value.id

          if (isColor && value.color_hex) {
            return (
              <button
                key={value.id}
                type="button"
                onClick={() => status !== 'unavailable' && onSelect(value.id)}
                disabled={status === 'unavailable'}
                aria-pressed={active}
                aria-label={`${value.value}${status === 'sold-out' ? ' (sin stock)' : ''}`}
                title={value.value}
                className={cn(
                  'relative grid size-11 place-items-center rounded-full border-2 transition-colors',
                  active ? 'border-clay-500' : 'border-border-soft hover:border-border-strong',
                  status !== 'ok' && 'opacity-40',
                  status === 'unavailable' && 'cursor-not-allowed',
                )}
              >
                <span
                  className="size-7 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: value.color_hex }}
                />
                {status === 'sold-out' && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="h-px w-9 rotate-45 bg-ink-muted" />
                  </span>
                )}
              </button>
            )
          }

          return (
            <button
              key={value.id}
              type="button"
              onClick={() => status !== 'unavailable' && onSelect(value.id)}
              disabled={status === 'unavailable'}
              aria-pressed={active}
              className={cn(
                'min-h-11 rounded-lg border px-4 py-2 text-sm transition-colors',
                active
                  ? 'border-clay-500 bg-primary-soft font-medium text-clay-700'
                  : 'border-border-soft bg-surface text-ink hover:border-border-strong',
                status === 'sold-out' && 'text-ink-subtle line-through',
                status === 'unavailable' && 'cursor-not-allowed opacity-40',
              )}
            >
              {value.value}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Preselecciona la primera combinación que realmente se puede comprar. */
function preselect(
  attributes: AttributeWithValues[],
  variants: VariantView[],
  combinations: Record<string, Record<string, string>>,
): Record<string, string> {
  const firstAvailable =
    variants.find((v) => v.available > 0) ?? variants[0]

  if (firstAvailable && combinations[firstAvailable.variant_id]) {
    return { ...combinations[firstAvailable.variant_id] }
  }

  // Sin combinaciones cargadas: el primer valor de cada atributo
  return Object.fromEntries(
    attributes
      .filter((a) => a.values.length > 0)
      .map((a) => [a.id, a.values[0].id]),
  )
}
