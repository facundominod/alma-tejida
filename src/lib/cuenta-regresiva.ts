/**
 * Cuánto falta para que termine una promoción.
 *
 * POR QUÉ ES UNA FUNCIÓN PURA Y APARTE
 * Porque lo que hace es decidir qué palabras usar según cuánto queda, y eso
 * tiene más casos de los que parece: el plural de "días", el salto de días a
 * horas, el último día, el minuto en que se terminó. Todos esos casos se
 * prueban acá, sin navegador y sin esperar que pase el tiempo de verdad.
 *
 * LA UNIDAD CAMBIA CON LA URGENCIA
 * A cinco días, los segundos no le importan a nadie y un número que parpadea
 * es sólo ruido. En la última hora pasa lo contrario: el segundero ES la
 * información. Así que se muestra la unidad más grande que todavía dice algo.
 */

export type Restante = {
  /** Lo que se lee: "Termina en 2 días", "Últimas 3 horas", "Último día". */
  texto: string
  /** Cada cuánto conviene volver a calcular, en milisegundos. */
  refrescoMs: number
  /** Si queda menos de un día. Para encender el diseño de urgencia. */
  urgente: boolean
  terminada: boolean
}

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO
const DIA = 24 * HORA

function dosDigitos(n: number): string {
  return String(Math.floor(n)).padStart(2, '0')
}

export function calcularRestante(
  termina: string | Date | null | undefined,
  ahora: Date = new Date(),
): Restante | null {
  // Una promoción sin fecha de fin no es fugaz: no hay nada que contar, y un
  // reloj que no avanza hacia ningún lado es peor que ningún reloj.
  if (!termina) return null

  const fin = termina instanceof Date ? termina : new Date(termina)
  if (Number.isNaN(fin.getTime())) return null

  const falta = fin.getTime() - ahora.getTime()

  if (falta <= 0) {
    return { texto: 'Terminó', refrescoMs: HORA, urgente: false, terminada: true }
  }

  if (falta >= 2 * DIA) {
    const dias = Math.floor(falta / DIA)
    return {
      texto: `Termina en ${dias} días`,
      // No hace falta más seguido: el número no va a cambiar en una hora.
      refrescoMs: HORA,
      urgente: false,
      terminada: false,
    }
  }

  if (falta >= DIA) {
    return { texto: 'Termina mañana', refrescoMs: MINUTO, urgente: false, terminada: false }
  }

  if (falta >= HORA) {
    const horas = Math.floor(falta / HORA)
    return {
      texto: horas === 1 ? 'Queda 1 hora' : `Quedan ${horas} horas`,
      refrescoMs: MINUTO,
      urgente: true,
      terminada: false,
    }
  }

  // Última hora: acá sí, minutos y segundos.
  const minutos = Math.floor((falta % HORA) / MINUTO)
  const segundos = Math.floor((falta % MINUTO) / SEGUNDO)

  return {
    texto: `Queda ${dosDigitos(minutos)}:${dosDigitos(segundos)}`,
    refrescoMs: SEGUNDO,
    urgente: true,
    terminada: false,
  }
}
