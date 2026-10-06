// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { useRotacion } from '../src/lib/ui/use-rotacion'

/**
 * El giro de las fotos del catálogo y de las frases de la portada.
 *
 * Lo que importa probar acá no es que avance —eso se ve mirando la pantalla—
 * sino las tres veces que NO tiene que avanzar: con una sola foto, con la
 * preferencia de menos movimiento, y con la pestaña en segundo plano. Las tres
 * son invisibles hasta que alguien se queja.
 */

function Sonda({ cantidad, retrasoMs = 0 }: { cantidad: number; retrasoMs?: number }) {
  const { indice, ref } = useRotacion(cantidad, { intervaloMs: 1000, retrasoMs })
  return (
    <div ref={ref} data-testid="caja">
      {indice}
    </div>
  )
}

const leer = () => screen.getByTestId('caja').textContent

/** Ni jsdom ni happy-dom traen IntersectionObserver. */
function observadorSiempreVisible() {
  class Falso {
    constructor(private cb: IntersectionObserverCallback) {
      // Se avisa "está en pantalla" en el acto, que es el caso normal.
      queueMicrotask(() =>
        this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never),
      )
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return []
    }
    root = null
    rootMargin = ''
    thresholds = []
  }
  vi.stubGlobal('IntersectionObserver', Falso)
}

function preferenciaDeMovimiento(reducido: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((consulta: string) => ({
      matches: consulta.includes('prefers-reduced-motion') ? reducido : false,
      media: consulta,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  )
}

describe('useRotacion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    observadorSiempreVisible()
    preferenciaDeMovimiento(false)
  })

  afterEach(() => {
    // A mano: la limpieza automatica de Testing Library solo corre con
    // `globals: true` en vitest, y este proyecto no los activa. Sin esto, la
    // segunda prueba encuentra dos cajas y falla por un motivo que no tiene
    // nada que ver con lo que esta probando.
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function avanzar(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it('avanza una posición por intervalo y vuelve al principio', async () => {
    render(<Sonda cantidad={3} />)
    await avanzar(0)
    expect(leer()).toBe('0')

    await avanzar(1000)
    expect(leer()).toBe('1')

    await avanzar(1000)
    expect(leer()).toBe('2')

    // Despues de la ultima vuelve a la primera, no se queda clavado.
    await avanzar(1000)
    expect(leer()).toBe('0')
  })

  it('con una sola foto no gira nunca', async () => {
    render(<Sonda cantidad={1} />)
    await avanzar(10_000)
    expect(leer()).toBe('0')
  })

  it('respeta el retraso: no arranca antes de su turno', async () => {
    render(<Sonda cantidad={3} retrasoMs={2000} />)
    await avanzar(0)

    // Durante la espera no pasa nada, aunque el intervalo sea de 1000.
    await avanzar(1900)
    expect(leer()).toBe('0')

    await avanzar(1200)
    expect(leer()).toBe('1')
  })

  /**
   * LA QUE IMPORTA.
   *
   * Quien marcó "menos movimiento" en su sistema no pidió una animación más
   * suave: pidió que no la haya. Una imagen que cambia sola es exactamente lo
   * que esa preferencia existe para evitar.
   */
  it('con prefers-reduced-motion se queda quieto', async () => {
    preferenciaDeMovimiento(true)
    render(<Sonda cantidad={4} />)
    await avanzar(20_000)
    expect(leer()).toBe('0')
  })

  it('con la pestaña escondida no avanza, y al volver sigue de donde estaba', async () => {
    const oculto = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    render(<Sonda cantidad={3} />)
    await avanzar(5000)
    expect(leer()).toBe('0')

    oculto.mockReturnValue(false)
    await avanzar(1000)
    // Avanza UNA, no las cinco que se "perdio": nadie vuelve a una pantalla
    // que parpadea para ponerse al dia.
    expect(leer()).toBe('1')

    oculto.mockRestore()
  })
})
