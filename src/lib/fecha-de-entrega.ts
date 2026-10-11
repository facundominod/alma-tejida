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
  const hasta = sumarDiasDeTaller(desde, 4)

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
