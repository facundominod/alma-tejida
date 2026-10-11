import { formatPrice } from '@/lib/utils'

/**
 * Los dos precios de una pieza, según cómo se pague.
 *
 * POR QUÉ ESTO EXISTE
 * El precio aparece en la tarjeta, en la ficha, en el carrito, en el resumen
 * antes de confirmar y en el mensaje de WhatsApp. Son cinco lugares. Si cada
 * uno hiciera su propia multiplicación, bastaría un redondeo distinto en uno
 * para que el mensaje que le llega a Silvana no coincida con lo que la clienta
 * vio en pantalla. Y el que no coincide siempre se descubre cobrando.
 *
 * Así que la cuenta se hace UNA vez, acá.
 *
 * EL PRECIO DE LISTA ES EL DE TARJETA
 * Es el que se muestra grande, porque es como la mayoría va a pagar: hasta N
 * cuotas sin interés. El descuento por transferencia o efectivo se calcula
 * SOBRE EL PRECIO QUE SE VA A COBRAR -no sobre el precio base-, así que si la
 * pieza ya está en oferta, el contado descuenta sobre la oferta. Es lo que
 * espera cualquiera que vea los dos números juntos.
 *
 * EL PRECIO DE CONTADO SE REDONDEA A LA CENTENA
 * Esto no es cosmética, resuelve un problema concreto. Lo que se guarda es el
 * PORCENTAJE (ver la migración 0018), y un porcentaje con dos decimales no
 * puede reproducir cualquier precio exacto: si Silvana decide "este respaldo lo
 * doy a $180.000 por transferencia", el porcentaje que sale es 16,28 % y la
 * cuenta de vuelta da $179.998. Correcto, pero parece un error.
 *
 * Redondeando a la centena -que es como se cobra de verdad; nadie transfiere
 * $179.998- el número redondo vuelve exacto. Medido sobre el rango de precios
 * de la tienda, cualquier precio múltiplo de 100 se reproduce clavado.
 *
 * Por debajo de $10.000 se redondea al peso: a la centena, una pieza de $40
 * con descuento terminaría en cero.
 *
 * Y EL PORCENTAJE QUE SE MUESTRA SALE DE LOS PRECIOS, NO AL REVÉS
 * Después de redondear, el descuento real puede ser 19,98 % y no el 20 % que
 * está guardado. Mostrar "20 %" sería mentir por dos pesos. Así que el cartel
 * se calcula desde los dos precios que la clienta tiene delante: lo que dice
 * siempre cierra con lo que se cobra.
 */

export type MedioDePago = 'transferencia' | 'efectivo' | 'tarjeta'

export type PreciosDePago = {
  /** Lo que se cobra con tarjeta. Es el precio que se muestra grande. */
  tarjeta: number
  /** Lo que se cobra por transferencia o efectivo. */
  contado: number
  /** Cuánto se ahorra pagando al contado. Cero si no hay descuento. */
  ahorro: number
  /** El descuento REAL, en %, salido de los dos precios. Para el cartel. */
  porcentaje: number
  /** Cuotas sin interés incluidas en el precio de tarjeta. */
  cuotas: number
  /** Valor de cada cuota. */
  valorCuota: number
  /** Si hay diferencia real entre pagar con tarjeta y al contado. */
  hayDescuento: boolean
}

/** Nulo, negativo o no numérico se tratan como cero: nunca se propaga un NaN. */
function numero(valor: number | string | null | undefined): number {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function calcularPreciosDePago({
  precioTarjeta,
  porcentajeContado,
  cuotas = 1,
}: {
  precioTarjeta: number | string | null | undefined
  porcentajeContado: number | string | null | undefined
  cuotas?: number | string | null | undefined
}): PreciosDePago {
  const tarjeta = Math.round(numero(precioTarjeta))

  // Un porcentaje de 100 o más dejaría la pieza en cero o en negativo. La base
  // ya lo impide, pero este cálculo también lo corre con datos de un
  // formulario a medio llenar.
  const crudo = numero(porcentajeContado)
  const porcentaje = crudo >= 100 ? 0 : crudo

  // Sin descuento, el precio de contado es IDÉNTICO al de tarjeta. Sin este
  // atajo, una pieza de $99.999 sin descuento pasaría por el redondeo y
  // "costaría" $100.000 al contado: un recargo inventado.
  const unidad = tarjeta >= 10_000 ? 100 : 1
  const contado =
    porcentaje <= 0
      ? tarjeta
      : // Nunca por encima del precio de tarjeta: el redondeo empuja hacia
        // arriba y un contado más caro que la tarjeta no tiene sentido.
        Math.min(Math.round((tarjeta * (1 - porcentaje / 100)) / unidad) * unidad, tarjeta)

  const ahorro = tarjeta - contado

  const nCuotas = Math.max(1, Math.round(numero(cuotas) || 1))

  return {
    tarjeta,
    contado,
    ahorro,
    // Del ahorro real, no del porcentaje guardado: ver la nota de arriba.
    porcentaje: tarjeta > 0 ? Math.round((ahorro / tarjeta) * 100) : 0,
    cuotas: nCuotas,
    // Hacia arriba: mostrar una cuota de menos de lo que se cobra haría que la
    // suma de las cuotas no llegue al total, y eso se lee como un error.
    valorCuota: Math.ceil(tarjeta / nCuotas),
    // Se compara el AHORRO, no el porcentaje. Un 1 % sobre una pieza barata
    // puede redondear a cero pesos, y anunciar un ahorro de $0 es peor que
    // no anunciar nada.
    hayDescuento: ahorro > 0,
  }
}

/**
 * El camino inverso, para el panel: Silvana escribe el precio de contado que
 * quiere cobrar y el porcentaje sale de ahí.
 *
 * Existe porque así es como se piensa un precio de verdad. Nadie decide "17,6 %
 * de descuento"; decide "este respaldo lo doy a 180 lucas por transferencia".
 * El formulario deja escribir cualquiera de los dos y convierte, pero lo que se
 * guarda es siempre el porcentaje: ver la migración 0018.
 */
export function porcentajeDesdePrecio({
  precioTarjeta,
  precioContado,
}: {
  precioTarjeta: number | string | null | undefined
  precioContado: number | string | null | undefined
}): number | null {
  const tarjeta = Math.round(numero(precioTarjeta))
  const contado = Math.round(numero(precioContado))

  if (tarjeta <= 0) return null
  // Un precio de contado mayor al de tarjeta no es un descuento. Devolver un
  // porcentaje negativo haría que la tienda anuncie un recargo sin querer.
  if (contado > tarjeta) return null
  if (contado <= 0) return null

  const porcentaje = ((tarjeta - contado) / tarjeta) * 100
  return Math.round(porcentaje * 100) / 100
}

/**
 * Lo que lee la clienta. Vive acá y no en el componente porque el mismo texto
 * va a la tarjeta, a la ficha y al mensaje de WhatsApp.
 */
export const COPY_PAGO = {
  tarjeta: 'con tarjeta',
  contado: 'por transferencia o efectivo',

  cuotasSinInteres: (p: PreciosDePago) =>
    p.cuotas > 1
      ? `${p.cuotas} cuotas sin interés de ${formatPrice(p.valorCuota)}`
      : 'un pago',

  ahorroCorto: (p: PreciosDePago) => `${formatPrice(p.contado)} con transferencia`,

  ahorroLargo: (p: PreciosDePago) =>
    `Ahorrás ${formatPrice(p.ahorro)} pagando por transferencia o efectivo`,

  /** Para el resumen antes de confirmar, donde ya eligió cómo paga. */
  elegido: (medio: MedioDePago) =>
    medio === 'tarjeta' ? 'Tarjeta' : medio === 'efectivo' ? 'Efectivo' : 'Transferencia',
} as const

/** El precio que corresponde al medio elegido. */
export function precioSegunMedio(p: PreciosDePago, medio: MedioDePago): number {
  return medio === 'tarjeta' ? p.tarjeta : p.contado
}
