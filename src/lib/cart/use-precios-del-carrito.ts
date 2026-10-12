'use client'

import * as React from 'react'
import { cotizarCarrito, type LineaCotizada } from '@/lib/actions/order'
import { calcularPreciosDePago, precioSegunMedio } from '@/lib/medios-de-pago'
import type { CartLine } from '@/lib/cart/cart-store'

/**
 * Lo que se cobra por cada línea, preguntándoselo al motor.
 *
 * POR QUÉ NO SE CALCULA ACÁ
 * Las reglas de una oferta dependen de la cantidad y del medio de pago, y
 * viven en la base. Calcularlas en el navegador sería una segunda
 * implementación del precio, y el día que las dos cuentas se separen el
 * carrito muestra un número y el pedido cobra otro.
 *
 * MIENTRAS LLEGA LA RESPUESTA SE MUESTRA EL PRECIO DE SIEMPRE
 * Y no un hueco ni un cartel de "calculando". El precio guardado en el
 * carrito ya es correcto salvo que haya una regla de oferta encima: la
 * respuesta lo corrige, casi siempre sin que se note. Un total que parpadea en
 * blanco cada vez que se cambia una cantidad da la sensación de que la tienda
 * no sabe lo que cobra.
 *
 * SI EL SERVIDOR NO CONTESTA, NO PASA NADA
 * Se queda el precio de siempre. Un carrito sin el descuento nuevo es
 * molesto; un carrito que no carga es una venta perdida.
 */
export function usePreciosDelCarrito(lineas: CartLine[]) {
  const [cotizado, setCotizado] = React.useState<Map<string, LineaCotizada>>(new Map())

  // Lo que de verdad cambia el precio. Sin esto, el efecto se dispararía en
  // cada render porque `lineas` es un arreglo nuevo cada vez.
  const firma = lineas
    .map((l) => `${l.variantId}:${l.quantity}:${l.medioDePago}`)
    .join('|')

  React.useEffect(() => {
    let vigente = true

    // Un respiro antes de preguntar: tocar "+" tres veces seguidas es una
    // consulta, no tres.
    //
    // El carrito vacío también se resuelve acá adentro y no arriba: tocar el
    // estado en el cuerpo del efecto dispara un render en cascada, y además
    // dejaría cotizaciones viejas si el carrito se vacía y se vuelve a llenar
    // con la misma pieza en otra cantidad.
    const espera = window.setTimeout(async () => {
      if (lineas.length === 0) {
        if (vigente) setCotizado(new Map())
        return
      }

      const filas = await cotizarCarrito({
        lineas: lineas.map((l) => ({
          variantId: l.variantId,
          productId: l.productId,
          quantity: l.quantity,
          medioDePago: l.medioDePago,
        })),
      })

      // Si mientras tanto cambió el carrito, esta respuesta ya no sirve.
      if (!vigente) return
      setCotizado(new Map(filas.map((f) => [f.variantId, f])))
    }, 250)

    return () => {
      vigente = false
      window.clearTimeout(espera)
    }
    // `firma` resume lo que importa; `lineas` entra para leerlo adentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  /** El precio unitario de una línea: el del motor si llegó, si no el de siempre. */
  const precioDe = React.useCallback(
    (linea: CartLine): number => {
      const delMotor = cotizado.get(linea.variantId)
      if (delMotor) return delMotor.precioUnitario

      return precioSegunMedio(
        calcularPreciosDePago({
          precioTarjeta: linea.price,
          porcentajeContado: linea.cashDiscountPercent,
          cuotas: linea.cardInstallments,
        }),
        linea.medioDePago,
      )
    },
    [cotizado],
  )

  /** Los descuentos que entraron en esa línea, para poder nombrarlos. */
  const motivosDe = React.useCallback(
    (linea: CartLine) => cotizado.get(linea.variantId)?.aplicadas ?? [],
    [cotizado],
  )

  const total = React.useMemo(
    () => lineas.reduce((suma, linea) => suma + precioDe(linea) * linea.quantity, 0),
    [lineas, precioDe],
  )

  return { precioDe, motivosDe, total }
}
