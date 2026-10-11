'use client'

import { calcularPreciosDePago, type MedioDePago } from '@/lib/medios-de-pago'
import { cn, formatPrice } from '@/lib/utils'

/**
 * Cómo se paga esta pieza.
 *
 * POR QUÉ POR PIEZA Y NO POR PEDIDO
 * Porque el pedido se cierra conversando por WhatsApp, no con un cobro
 * automático. Si alguien lleva un respaldo y un espejo y quiere transferir uno
 * y poner el otro en cuotas, eso se arregla hablando. Obligar a un solo medio
 * para todo el pedido sería una restricción del software, no del negocio.
 *
 * LO QUE MUESTRA CADA OPCIÓN
 * Cada botón dice lo que CUESTA, no solo cómo se llama. "Transferencia" no
 * significa nada hasta que al lado dice $172.000. El ahorro va en la opción que
 * lo da, no en un cartel aparte, para que la comparación esté donde se elige.
 */
export function SelectorDePago({
  precio,
  porcentajeContado,
  cuotas,
  cantidad = 1,
  valor,
  alElegir,
  etiqueta,
}: {
  /** Precio unitario con tarjeta. */
  precio: number
  porcentajeContado: number
  cuotas: number
  cantidad?: number
  valor: MedioDePago
  alElegir: (medio: MedioDePago) => void
  /** Nombre de la pieza, para los lectores de pantalla. */
  etiqueta: string
}) {
  const p = calcularPreciosDePago({
    precioTarjeta: precio,
    porcentajeContado,
    cuotas,
  })

  // Sin diferencia de precio no hay nada que elegir: tres botones que cobran
  // lo mismo son tres formas de dudar.
  if (!p.hayDescuento) return null

  const opciones: { medio: MedioDePago; nombre: string; detalle: string }[] = [
    {
      medio: 'transferencia',
      nombre: 'Transferencia',
      detalle: `${formatPrice(p.contado * cantidad)} · ahorrás ${formatPrice(p.ahorro * cantidad)}`,
    },
    {
      medio: 'efectivo',
      nombre: 'Efectivo',
      detalle: `${formatPrice(p.contado * cantidad)} · ahorrás ${formatPrice(p.ahorro * cantidad)}`,
    },
    {
      medio: 'tarjeta',
      nombre: 'Tarjeta',
      detalle:
        p.cuotas > 1
          ? `${formatPrice(p.tarjeta * cantidad)} · ${p.cuotas} cuotas sin interés`
          : formatPrice(p.tarjeta * cantidad),
    },
  ]

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Cómo querés pagar {etiqueta}</legend>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((opcion) => {
          const elegido = valor === opcion.medio
          return (
            <button
              key={opcion.medio}
              type="button"
              onClick={() => alElegir(opcion.medio)}
              aria-pressed={elegido}
              className={cn(
                'at-tap rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                elegido
                  ? 'border-sage-500 bg-sage-100 text-sage-600'
                  : 'border-border-soft text-ink-muted hover:border-border hover:text-ink',
              )}
            >
              <span className="block text-[0.8125rem] font-medium leading-tight">
                {opcion.nombre}
              </span>
              <span className="tabular block text-[0.6875rem] leading-tight opacity-90">
                {opcion.detalle}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
