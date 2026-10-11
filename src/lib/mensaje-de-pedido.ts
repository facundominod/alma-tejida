import { calcularPreciosDePago, precioSegunMedio, COPY_PAGO } from '@/lib/medios-de-pago'
import { formatPrice } from '@/lib/utils'
import type { PublicOrder } from '@/types/database'

/**
 * El mensaje de WhatsApp con el pedido entero.
 *
 * POR QUÉ VA TODO EL DETALLE Y NO SOLO EL NÚMERO
 * Porque del otro lado hay una persona con el teléfono en la mano, no un panel
 * abierto. Si el mensaje dice sólo "pedido A-1043", Silvana tiene que buscarlo
 * antes de poder contestar; con el detalle adentro puede responder desde el
 * mismo chat, y la clienta ve que lo que mandó es lo que pidió.
 *
 * LOS PRECIOS SALEN DEL PEDIDO GUARDADO
 * No se recalculan acá. `unit_price` y `cash_discount_percent` quedaron
 * congelados al hacer el pedido (migración 0019), así que este mensaje dice lo
 * mismo hoy que dentro de un mes, aunque los precios de la tienda hayan
 * cambiado en el medio.
 *
 * SIN SALTOS DE LÍNEA RAROS
 * WhatsApp respeta los saltos simples. Se usa `\n` y nada más: el markdown de
 * WhatsApp es `*negrita*` y no `**negrita**`, y poner el equivocado se ve como
 * asteriscos sueltos en el chat.
 */
/**
 * El precio de una línea del pedido según cómo eligió pagarla.
 *
 * Las cuotas no se guardan por línea: son de la tienda y pueden cambiar. Acá
 * importa el medio elegido, no el detalle de la financiación.
 */
function precioDeItem(item: PublicOrder['items'][number]): number {
  const p = calcularPreciosDePago({
    precioTarjeta: item.unit_price,
    porcentajeContado: item.cash_discount_percent,
    cuotas: 1,
  })
  return precioSegunMedio(p, item.payment_method ?? 'transferencia')
}

/**
 * Los DOS totales de un pedido, y por qué son dos.
 *
 * `order.total` es el total de lista: el que se cobra con tarjeta, y el que
 * quedó guardado en la base. El descuento por transferencia o efectivo es un
 * descuento AL PAGAR, y se aplica cuando se paga.
 *
 * Mostrar uno solo obliga a elegir entre dos mentiras: el de lista hace que
 * parezca que el descuento no existe, y el de contado hace que parezca que el
 * pedido vale menos de lo que dice la base. Con los dos a la vista y cada uno
 * con su nombre no hay nada que aclarar después.
 */
export function totalesDelPedido(order: PublicOrder): {
  lista: number
  segunPago: number
  ahorro: number
  hayDiferencia: boolean
} {
  const piezas = order.items.reduce((sum, item) => sum + precioDeItem(item) * item.quantity, 0)
  const segunPago = Math.round(piezas + Number(order.delivery_cost ?? 0))
  const lista = Math.round(Number(order.total ?? 0))

  return {
    lista,
    segunPago,
    ahorro: Math.max(lista - segunPago, 0),
    hayDiferencia: segunPago < lista,
  }
}

export function mensajeDePedido(order: PublicOrder, nombreDeLaTienda: string): string {
  const lineas: string[] = []

  lineas.push(`Hola ${nombreDeLaTienda}! Te paso mi pedido *${order.order_number}*.`)
  lineas.push('')

  for (const item of order.items) {
    const medio = item.payment_method ?? 'transferencia'
    const unitario = precioDeItem(item)

    const cantidad = item.quantity > 1 ? `${item.quantity} × ` : ''
    const variante = item.variant_label ? ` (${item.variant_label})` : ''

    lineas.push(`• ${cantidad}${item.product_name}${variante}`)
    lineas.push(`  ${COPY_PAGO.elegido(medio)} — ${formatPrice(unitario * item.quantity)}`)
  }

  lineas.push('')

  if (order.delivery_method) {
    lineas.push(`Entrega: ${order.delivery_method}`)
  }
  if (order.customer_note) {
    lineas.push(`Nota: ${order.customer_note}`)
  }

  const totales = totalesDelPedido(order)

  if (totales.hayDiferencia) {
    lineas.push(`Total de lista: ${formatPrice(totales.lista)}`)
    lineas.push(
      `*A pagar con las formas que elegí: ${formatPrice(totales.segunPago)}* ` +
        `(${formatPrice(totales.ahorro)} menos)`,
    )
  } else {
    lineas.push(`*Total: ${formatPrice(totales.lista)}*`)
  }

  return lineas.join('\n')
}
