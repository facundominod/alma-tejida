/**
 * Leer un precio escrito a mano, como se escribe en Argentina.
 *
 * EL PROBLEMA QUE RESUELVE, QUE ERA GRAVE
 * Los campos de precio del panel eran `<input type="number">`. Eso parece lo
 * correcto y es justo lo que no hay que usar para plata, porque el navegador
 * interpreta el número con el formato de SU configuración, no con el nuestro:
 *
 *   escribir "150,000"  →  el campo queda vacío y el formulario no se envía
 *   escribir "45.760"   →  "Introduce un valor válido" y no se envía
 *   escribir "150.000"  →  se guarda 150. Mil veces menos. Sin avisar.
 *
 * O sea: escribir un precio como lo escribe cualquiera acá o trababa el
 * formulario o guardaba un número equivocado en silencio. Lo segundo es peor.
 *
 * LA REGLA
 * La coma es el decimal y el punto el separador de miles, que es como se
 * escribe en castellano rioplatense. Se aceptan además el símbolo de peso, los
 * espacios y los espacios duros que deja al pegar desde una planilla.
 *
 * EL CASO AMBIGUO, RESUELTO A PROPÓSITO
 * "150.00" puede ser ciento cincuenta con dos decimales —si alguien tipeó a la
 * inglesa— o quince mil mal escrito. Se decide por la CANTIDAD de dígitos
 * después del último punto: exactamente tres significa miles ("150.000" son
 * ciento cincuenta mil, que es lo que se quiso escribir en una tienda donde
 * nada cuesta menos de mil pesos); uno o dos significan decimales.
 *
 * Es una heurística, no una ley, y por eso el campo muestra SIEMPRE el número
 * ya formateado apenas se sale de él: si interpretó otra cosa, se ve en el
 * momento y no al cobrar.
 */

/** Lo que no es número, coma ni punto. */
const BASURA = /[^\d.,-]/g

export function parsearPrecio(texto: string | number | null | undefined): number | null {
  if (texto == null) return null
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null

  // El espacio duro llega al pegar desde una planilla y no lo saca un trim().
  const limpio = texto.replace(/ /g, ' ').trim().replace(BASURA, '')
  if (limpio === '' || limpio === '-') return null

  const tieneComa = limpio.includes(',')
  const ultimoPunto = limpio.lastIndexOf('.')

  let normalizado: string

  if (tieneComa) {
    const comas = (limpio.match(/,/g) ?? []).length
    const ultimaComa = limpio.lastIndexOf(',')
    const trasLaComa = limpio.length - ultimaComa - 1

    // "150,000" NO es ciento cincuenta con tres decimales: un precio con tres
    // decimales no existe. Es separador de miles a la inglesa, que es lo que
    // sale de un teclado de teléfono o de copiar y pegar. Lo mismo con
    // "1,500,000", donde hay más de una coma.
    //
    // En cambio "1.500,50" y "150.000,00" llevan dos decimales, que sí es un
    // precio: ahí la coma es el decimal, como se escribe acá.
    const comaEsDeMiles =
      comas > 1 || (trasLaComa === 3 && !limpio.includes('.'))

    normalizado = comaEsDeMiles
      ? limpio.replace(/,/g, '')
      : limpio.replace(/\./g, '').replace(',', '.')
  } else if (ultimoPunto === -1) {
    normalizado = limpio
  } else {
    const decimales = limpio.length - ultimoPunto - 1
    normalizado =
      decimales === 3
        ? // "150.000" y "1.234.000": miles.
          limpio.replace(/\./g, '')
        : // "150.5" y "150.50": decimales a la inglesa.
          limpio.replace(/\.(?=.*\.)/g, '')
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

/**
 * El mismo número, escrito como se lee: "150.000".
 *
 * Se usa al salir del campo, para que quien escribió vea en el acto cómo se
 * entendió lo que puso.
 */
export function formatearParaEditar(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return ''

  // Sin decimales cuando son cero: nadie escribe "150.000,00" en un precio.
  const decimales = Number.isInteger(valor) ? 0 : 2
  return valor.toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: 2,
  })
}
