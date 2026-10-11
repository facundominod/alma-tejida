/**
 * Para cuándo estaría una pieza si se encarga hoy.
 *
 * "A pedido · ~15 días" obliga a la persona a abrir el calendario y contar.
 * "Si lo encargás hoy, lo tenés cerca del 26 de octubre" responde la pregunta
 * que realmente se está haciendo, que es si llega para el cumpleaños.
 *
 * Tres cosas que importan:
 *
 * 1. **No cuenta domingos.** El taller no teje los domingos, y prometer una
 *    fecha contando días corridos es prometer de más. Se cuentan días
 *    hábiles de lunes a sábado.
 *
 * 2. **Da un rango, no un día exacto.** Una pieza hecha a mano no sale el
 *    martes a las tres. El rango va del día calculado a cuatro días después,
 *    y se dice "cerca de". Prometer una fecha exacta es la forma más rápida
 *    de quedar mal con alguien que te compró con ilusión.
 *
 * 3. **Se calcula en el servidor y se muestra tal cual.** Si se calculara en
 *    el navegador, la fecha dependería del reloj del teléfono —y además la
 *    página cacheada mostraría la fecha del día en que se generó—.
 *
 * 4. **EL CATÁLOGO Y LA FICHA DICEN LO MISMO.** Antes no: la tarjeta decía
 *    "A pedido · ~10 días" y la ficha, con los domingos salteados y el rango
 *    de cuatro días, terminaba prometiendo entre 11 y 16 días. Dos números
 *    distintos para el mismo encargo, y el segundo aparecía recién al entrar.
 *
 *    Ahora los dos salen de acá. `rangoEnDias()` da el rango en días
 *    calendario SIN mirar el reloj —por eso puede usarse en la tarjeta, que es
 *    un componente de cliente, sin que el servidor y el navegador calculen
 *    distinto al cruzar la medianoche—, y `calcularEntrega()` pone las fechas
 *    en la ficha. Las fechas caen siempre dentro del rango: hay una prueba que
 *    lo fija.
 */

const DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/**
 * Los días que se le suman al final para dar un rango y no una fecha exacta.
 * Una pieza hecha a mano no sale el martes a las tres.
 */
const MARGEN_DE_DIAS = 4

/** Suma días de taller: salta los domingos. */
function sumarDiasDeTaller(desde: Date, dias: number): Date {
  const fecha = new Date(desde)
  let restantes = dias

  while (restantes > 0) {
    fecha.setDate(fecha.getDate() + 1)
    if (fecha.getDay() !== 0) restantes -= 1
  }

  return fecha
}

function enPalabras(fecha: Date): string {
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`
}

export type Entrega = {
  /** "lunes 27 de octubre" */
  desde: string
  /** "viernes 31 de octubre" */
  hasta: string
  /** Lo que se muestra: "entre el lunes 27 y el viernes 31 de octubre" */
  texto: string
  /** Días de taller que se usaron para el cálculo. */
  dias: number
}

export function calcularEntrega(diasDeTaller: number, hoy = new Date()): Entrega | null {
  if (!Number.isFinite(diasDeTaller) || diasDeTaller <= 0) return null

  const desde = sumarDiasDeTaller(hoy, diasDeTaller)
  const hasta = sumarDiasDeTaller(desde, MARGEN_DE_DIAS)

  const mismoMes = desde.getMonth() === hasta.getMonth()

  return {
    desde: enPalabras(desde),
    hasta: enPalabras(hasta),
    // Si los dos caen en el mismo mes, no hace falta repetirlo.
    texto: mismoMes
      ? `entre el ${DIAS[desde.getDay()]} ${desde.getDate()} y el ${enPalabras(hasta)}`
      : `entre el ${enPalabras(desde)} y el ${enPalabras(hasta)}`,
    dias: diasDeTaller,
  }
}

/**
 * Cuántos días calendario puede tardar, sin mirar el reloj.
 *
 * Saltear los domingos hace que el plazo en días corridos dependa del día en
 * que se encarga, pero esa variación es de UN día nada más —medido sobre los
 * siete días de arranque posibles—. Así que el rango se puede dar como función
 * pura del plazo, y eso es lo que permite mostrarlo en la tarjeta del catálogo
 * sin que el servidor y el navegador calculen distinto.
 *
 * El mínimo es el primer día posible; el máximo, el último día del rango de
 * entrega. Entre esos dos números cae siempre la fecha que muestra la ficha.
 */
export function rangoEnDias(diasDeTaller: number): { min: number; max: number } | null {
  if (!Number.isFinite(diasDeTaller) || diasDeTaller <= 0) return null

  const dias = Math.round(diasDeTaller)

  // Se prueban los SIETE días de arranque posibles con la misma función que
  // usa la ficha, y se toman el mínimo y el máximo.
  //
  // Primero intenté una fórmula cerrada —"cada seis días se saltea un
  // domingo"— y daba mal: los domingos salteados dependen del total (plazo más
  // margen), no del plazo solo, así que un encargo de 3 días arrancado un
  // sábado se iba un día por encima del tope anunciado. Lo descubrió la prueba
  // que compara los dos números.
  //
  // Contar con la función de verdad no puede desviarse: si cambia la regla de
  // los domingos o el margen, el rango la sigue sola.
  //
  // La fecha de referencia es fija y arbitraria —el 4/10/2026 fue domingo—, así
  // que esto NO mira el reloj y se puede usar en un componente de cliente.
  let min = Infinity
  let max = 0

  for (let diaDeArranque = 0; diaDeArranque < 7; diaDeArranque += 1) {
    const arranque = new Date(2026, 9, 4 + diaDeArranque)
    const inicio = sumarDiasDeTaller(arranque, dias)
    const fin = sumarDiasDeTaller(inicio, MARGEN_DE_DIAS)

    const enDias = (fecha: Date) =>
      Math.round((fecha.getTime() - arranque.getTime()) / 86_400_000)

    min = Math.min(min, enDias(inicio))
    max = Math.max(max, enDias(fin))
  }

  return { min, max }
}

/**
 * La etiqueta corta del catálogo: "11 a 17 días".
 *
 * Es el MISMO plazo que después detalla la ficha con fechas. Si acá dijera
 * "~10 días" —como decía antes— la ficha lo contradiría en la pantalla
 * siguiente, que es exactamente el tipo de detalle que hace dudar del resto.
 */
export function etiquetaDeEntrega(diasDeTaller: number | null | undefined): string | null {
  if (diasDeTaller == null) return null

  const rango = rangoEnDias(diasDeTaller)
  if (!rango) return null

  return `${rango.min} a ${rango.max} días`
}
