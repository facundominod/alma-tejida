import { Price } from '@/components/ui/primitives'
import { calcularPreciosDePago, COPY_PAGO } from '@/lib/medios-de-pago'
import { cn, formatPrice } from '@/lib/utils'

/**
 * El precio de una pieza con sus dos formas de pago.
 *
 * QUÉ SE MUESTRA GRANDE Y POR QUÉ
 * El precio de lista -el de tarjeta- va grande, porque es como la mayoría va a
 * pagar y es el número con el que se compara. Debajo, el de transferencia.
 *
 * Es deliberado no mostrar el de contado como "el precio" aunque sea más
 * barato: anunciar un número que después no se puede pagar con tarjeta es la
 * forma más rápida de que alguien llegue al final del pedido sintiendo que le
 * cambiaron el precio.
 *
 * DOS TAMAÑOS
 * En la tarjeta del catálogo hay lugar para dos líneas y no más: cuatro piezas
 * por fila, cada línea extra empuja el resto fuera de la pantalla. En la ficha
 * hay lugar para contar las cuotas y el ahorro, que es donde se decide.
 */
export function PrecioConPago({
  precioLista,
  precioFinal,
  porcentajeContado,
  cuotas,
  desde = false,
  variante = 'tarjeta',
  className,
}: {
  /** El precio antes de cualquier oferta. Se tacha si hay descuento. */
  precioLista: number | string | null
  /** El que se cobra con tarjeta, oferta y promociones ya aplicadas. */
  precioFinal: number | string | null
  porcentajeContado: number | null | undefined
  cuotas: number | null | undefined
  desde?: boolean
  variante?: 'tarjeta' | 'ficha'
  className?: string
}) {
  const p = calcularPreciosDePago({
    precioTarjeta: precioFinal,
    porcentajeContado,
    cuotas,
  })

  const lista = precioLista == null ? null : Number(precioLista)
  const hayOferta = lista != null && lista > p.tarjeta

  if (variante === 'tarjeta') {
    return (
      <div className={cn('space-y-0.5', className)}>
        <Price final={p.tarjeta} list={hayOferta ? lista : null} from={desde} size="md" />
        {p.hayDescuento && (
          <p className="text-[0.8125rem] leading-snug text-sage-600">
            <span className="tabular font-medium">{formatPrice(p.contado)}</span> con
            transferencia
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Price final={p.tarjeta} list={hayOferta ? lista : null} from={desde} size="lg" />

      <p className="text-sm text-ink-muted">
        {p.cuotas > 1 ? (
          <>
            Hasta <span className="font-medium text-ink">{COPY_PAGO.cuotasSinInteres(p)}</span>{' '}
            con tarjeta
          </>
        ) : (
          'Un pago con tarjeta'
        )}
      </p>

      {p.hayDescuento && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-sage-100 px-3.5 py-2.5 text-sage-600">
          <span className="tabular text-xl font-semibold">{formatPrice(p.contado)}</span>
          <span className="text-sm">por transferencia o efectivo</span>
          <span className="w-full text-[0.8125rem] opacity-90">
            {COPY_PAGO.ahorroLargo(p)} · {p.porcentaje}% menos
          </span>
        </div>
      )}
    </div>
  )
}
