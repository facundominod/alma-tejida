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
 * 2. **Dice los días hábiles que se cargaron, sin inventar un margen.**
 *    Antes le sumaba cuatro días "por las dudas", y una pieza cargada con 5
 *    días terminaba anunciada como "5 a 11 días". Ese margen no lo pidió
 *    nadie: el plazo que carga Silvana ES el plazo, y si ella necesita aire
 *    lo pone en el número. Un rango inventado encima de su número le saca el
 *    control de lo que promete.
 *
 * 3. **Se calcula en el servidor y se muestra tal cual.** Si se calculara en
 *    el navegador, la fecha dependería del reloj del teléfono —y además la
 *    página cacheada mostraría la fecha del día en que se generó—.
 *
 * 4. **EL CATÁLOGO Y LA FICHA DICEN LO MISMO.** La tarjeta anuncia los días
 *    hábiles y la ficha los convierte en una fecha. Son el mismo número dicho
 *    de dos maneras, no dos promesas distintas.
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
  fecha: string
  /** Lo que se muestra: "alrededor del lunes 27 de octubre" */
  texto: string
  /** Días hábiles que se usaron para el cálculo. */
  dias: number
}

export function calcularEntrega(diasDeTaller: number, hoy = new Date()): Entrega | null {
  if (!Number.isFinite(diasDeTaller) || diasDeTaller <= 0) return null

  const dia = sumarDiasDeTaller(hoy, diasDeTaller)

  return {
    fecha: enPalabras(dia),
    // "alrededor del" y no "el": es una pieza hecha a mano, no un envío de
    // depósito. La holgura va en la palabra, no en un rango que estira el
    // número que cargó Silvana.
    texto: `alrededor del ${enPalabras(dia)}`,
    dias: diasDeTaller,
  }
}

/**
 * La etiqueta corta del catálogo: "5 días hábiles".
 *
 * Es el MISMO número que después la ficha convierte en fecha. Antes acá salía
 * un rango —"5 a 11 días"— porque el cálculo le sumaba cuatro días de margen
 * y la variación del día de arranque. Nadie pidió ese margen, y estiraba a más
 * del doble un plazo que Silvana había puesto en cinco.
 */
export function etiquetaDeEntrega(diasHabiles: number | null | undefined): string | null {
  if (diasHabiles == null) return null
  if (!Number.isFinite(diasHabiles) || diasHabiles <= 0) return null

  const dias = Math.round(diasHabiles)
  return dias === 1 ? '1 día hábil' : `${dias} días hábiles`
}
