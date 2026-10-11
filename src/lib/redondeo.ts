/**
 * Dejar los precios terminados en 99.
 *
 * POR QUÉ 99 Y NO UN NÚMERO REDONDO
 * Es la convención de precios de casi cualquier comercio: $45.799 se lee como
 * "cuarenta y cinco mil y algo" y $45.800 como "casi cuarenta y seis mil",
 * aunque haya un peso de diferencia. No es un truco nuevo ni hace falta
 * defenderlo; lo que hace falta es poder aplicarlo a todo el catálogo sin
 * entrar pieza por pieza.
 *
 * LA REGLA
 * Se redondea a la centena más cercana y se le resta uno: 45.760 → 45.799.
 * Hacia la centena MÁS CERCANA y no siempre hacia arriba, para que el precio
 * nuevo quede lo más cerca posible del que se decidió.
 *
 * EL PISO, QUE ES LO QUE EVITA UN DESASTRE
 * Un precio de $1 redondeado a 99 pasa a $99: multiplicado por noventa y
 * nueve. Y hoy mismo hay doce piezas cargadas con precio $1 como valor
 * provisorio. Una tanda sin piso las habría "arreglado" todas de golpe.
 *
 * Así que por debajo del piso no se toca nada, y las que quedan afuera se
 * CUENTAN y se informan. Una operación masiva que saltea cosas en silencio se
 * lee como "ya está todo hecho" cuando no lo está.
 */

/**
 * Por debajo de esto, terminar en 99 no significa nada: el redondeo movería el
 * precio un porcentaje enorme. También es la red que protege a las piezas con
 * precio provisorio.
 */
export const PISO_PARA_REDONDEAR = 1_000

export type Redondeo = {
  /** El precio terminado en 99. */
  precio: number
  /** Cuánto se movió respecto del original. Puede ser negativo. */
  diferencia: number
}

/**
 * Devuelve el precio terminado en 99, o nulo si no corresponde tocarlo:
 * porque está por debajo del piso, porque no es un número, o porque ya
 * termina en 99 y no hay nada que hacer.
 */
export function redondearA99(valor: number | string | null | undefined): Redondeo | null {
  const n = typeof valor === 'string' ? Number(valor) : valor

  if (n == null || !Number.isFinite(n)) return null
  if (n < PISO_PARA_REDONDEAR) return null

  const precio = Math.round(n / 100) * 100 - 1

  // Ya terminaba en 99: no es un cambio, es la misma fila escrita de nuevo.
  if (precio === n) return null

  // Defensa por si el piso cambiara alguna vez: un precio nunca puede quedar
  // en cero o en negativo por un redondeo.
  if (precio <= 0) return null

  return { precio, diferencia: precio - n }
}
