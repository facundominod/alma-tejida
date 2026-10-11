import { describe, expect, it } from 'vitest'
import { calcularRestante } from '@/lib/cuenta-regresiva'

const AHORA = new Date('2026-10-11T12:00:00Z')
const en = (ms: number) => new Date(AHORA.getTime() + ms)

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO
const DIA = 24 * HORA

describe('calcularRestante', () => {
  it('sin fecha de fin no hay nada que contar', () => {
    expect(calcularRestante(null, AHORA)).toBeNull()
    expect(calcularRestante(undefined, AHORA)).toBeNull()
  })

  it('una fecha ilegible no rompe la pantalla', () => {
    expect(calcularRestante('mañana a la tarde', AHORA)).toBeNull()
  })

  it('cuenta los días cuando faltan varios', () => {
    expect(calcularRestante(en(5 * DIA), AHORA)!.texto).toBe('Termina en 5 días')
  })

  it('dice "mañana" en lugar de "en 1 días"', () => {
    // El plural de uno es la forma más fácil de que un cartel se lea raro.
    const r = calcularRestante(en(DIA + HORA), AHORA)!
    expect(r.texto).toBe('Termina mañana')
    expect(r.texto).not.toContain('1 días')
  })

  it('pasa a horas dentro del último día', () => {
    expect(calcularRestante(en(5 * HORA), AHORA)!.texto).toBe('Quedan 5 horas')
    expect(calcularRestante(en(HORA + MINUTO), AHORA)!.texto).toBe('Queda 1 hora')
  })

  it('en la última hora muestra minutos y segundos', () => {
    expect(calcularRestante(en(9 * MINUTO + 5 * SEGUNDO), AHORA)!.texto).toBe('Queda 09:05')
  })

  it('una promoción vencida lo dice y no cuenta hacia atrás', () => {
    const r = calcularRestante(en(-HORA), AHORA)!
    expect(r.terminada).toBe(true)
    expect(r.texto).toBe('Terminó')
    expect(r.texto).not.toContain('-')
  })

  it('el momento exacto del final ya está terminado', () => {
    expect(calcularRestante(AHORA, AHORA)!.terminada).toBe(true)
  })

  /**
   * LA PRUEBA QUE IMPORTA: el refresco tiene que seguir a la urgencia. Si se
   * refrescara cada segundo a cinco días, la pantalla trabajaría todo el día
   * para redibujar el mismo número; si se refrescara cada hora en el último
   * minuto, el reloj se quedaría clavado justo cuando se lo está mirando.
   */
  it('refresca más seguido a medida que se acerca el final', () => {
    const lejos = calcularRestante(en(5 * DIA), AHORA)!
    const cerca = calcularRestante(en(3 * HORA), AHORA)!
    const encima = calcularRestante(en(30 * SEGUNDO), AHORA)!

    expect(lejos.refrescoMs).toBeGreaterThan(cerca.refrescoMs)
    expect(cerca.refrescoMs).toBeGreaterThan(encima.refrescoMs)
    expect(encima.refrescoMs).toBe(SEGUNDO)
  })

  it('marca urgente solo dentro del último día', () => {
    expect(calcularRestante(en(2 * DIA), AHORA)!.urgente).toBe(false)
    expect(calcularRestante(en(DIA + MINUTO), AHORA)!.urgente).toBe(false)
    expect(calcularRestante(en(10 * HORA), AHORA)!.urgente).toBe(true)
    expect(calcularRestante(en(MINUTO), AHORA)!.urgente).toBe(true)
  })

  it('acepta texto ISO, que es como viene de la base', () => {
    expect(calcularRestante('2026-10-16T12:00:00Z', AHORA)!.texto).toBe('Termina en 5 días')
  })

  it('nunca devuelve un texto vacío', () => {
    for (const ms of [-DIA, -1, 0, 1, SEGUNDO, MINUTO, HORA, DIA, 3 * DIA, 400 * DIA]) {
      const r = calcularRestante(en(ms), AHORA)
      expect(r!.texto.length).toBeGreaterThan(0)
    }
  })
})

/**
 * El corte de una promoción "hasta el 15" tiene que incluir el 15.
 *
 * Esta prueba no mira la función de arriba sino la regla que la acompaña: un
 * campo de fecha entrega la medianoche, y la medianoche del 15 es el final del
 * 14. El error aparecía recién cuando alguien veía el precio viejo.
 */
describe('una promoción hasta el 15 dura todo el 15', () => {
  // La misma regla que aplica el servidor al guardar (finDelDia).
  const corte = (fecha: string) => (fecha.includes('T') ? fecha : `${fecha}T23:59:59`)

  it('sigue vigente a media tarde del último día', () => {
    const r = calcularRestante(corte('2026-10-15'), new Date('2026-10-15T15:00:00'))!
    expect(r.terminada).toBe(false)
  })

  it('se termina cuando termina ese día', () => {
    const r = calcularRestante(corte('2026-10-15'), new Date('2026-10-16T00:30:00'))!
    expect(r.terminada).toBe(true)
  })

  it('con hora elegida se respeta esa hora', () => {
    expect(corte('2026-10-15T18:30')).toBe('2026-10-15T18:30')

    const antes = calcularRestante('2026-10-15T18:30', new Date('2026-10-15T17:00:00'))!
    const despues = calcularRestante('2026-10-15T18:30', new Date('2026-10-15T19:00:00'))!

    expect(antes.terminada).toBe(false)
    expect(despues.terminada).toBe(true)
  })
})
