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
      <div className={cn('space-y-1', className)}>
        <Price final={p.tarjeta} list={hayOferta ? lista : null} from={desde} size="md" />

        {/* LAS CUOTAS, TAMBIÉN EN LA TARJETA DEL CATÁLOGO.
            Estaban sólo en la ficha, que es la pantalla siguiente. En una
            pieza de seis cifras, "3 cuotas sin interés" es lo que decide si
            alguien entra a mirarla o pasa de largo: tiene que estar donde se
            pasa de largo. */}
        {p.cuotas > 1 && (
          <p className="text-[0.75rem] leading-snug text-ink-muted">
            <span className="tabular font-medium text-ink">
              {p.cuotas}×{' '}{formatPrice(p.valorCuota)}
            </span>{' '}
            sin interés
          </p>
        )}

        {p.hayDescuento && (
          /* Resaltado y no una línea gris más: es el precio más bajo y el que
             conviene que se lea primero.

             `flex-wrap` y no `inline-flex` a secas: en un teléfono de 320 px
             el recuadro se iba 2 px fuera de la tarjeta y la página entera se
             podía correr de costado. Envolviendo, el texto baja de renglón. */
          <p className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 rounded-md bg-sage-100 px-1.5 py-0.5 text-[0.8125rem] leading-snug text-sage-600">
            <span className="tabular font-semibold">{formatPrice(p.contado)}</span>
            <span>con transferencia</span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Price final={p.tarjeta} list={hayOferta ? lista : null} from={desde} size="lg" />

      {/* LAS CUOTAS, CON PESO PROPIO.
          Era una línea gris chiquita debajo del precio. En una pieza de seis
          cifras, poder pagarla en tres veces sin recargo es la mitad del
          argumento de venta: merece leerse sin buscarla. */}
      {p.cuotas > 1 ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-[0.9375rem] text-ink-muted">
          <span className="rounded-md bg-clay-100 px-2 py-0.5 font-semibold text-clay-700">
            {p.cuotas} cuotas sin interés
          </span>
          <span>
            de <span className="tabular font-medium text-ink">{formatPrice(p.valorCuota)}</span>{' '}
            con tarjeta
          </span>
        </p>
      ) : (
        <p className="text-sm text-ink-muted">Un pago con tarjeta</p>
      )}

      {p.hayDescuento && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-sage-500/30 bg-sage-100 px-4 py-3 text-sage-600 ring-1 ring-inset ring-white/40">
          <span className="tabular text-2xl font-semibold">{formatPrice(p.contado)}</span>
          <span className="text-sm font-medium">por transferencia o efectivo</span>
          <span className="w-full pt-0.5 text-[0.8125rem] font-medium">
            {COPY_PAGO.ahorroLargo(p)}
            <span className="at-descuento ml-1.5 inline-block rounded bg-sage-600 px-1.5 py-0.5 text-[0.75rem] font-semibold text-white">
              {p.porcentaje}% menos
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
