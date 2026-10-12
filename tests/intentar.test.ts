import { describe, expect, it } from 'vitest'
import { intentar } from '@/lib/actions/intentar'

/**
 * El envoltorio de las acciones del panel.
 *
 * POR QUE EXISTE ESTA PRUEBA
 * Porque el defecto que tapa no se ve: una acción que LANZA en vez de devolver
 * un error dejaba el botón en "Guardando..." para siempre, sin un solo
 * mensaje. Estaba en los doce formularios del panel, y desde el otro lado se
 * veía como "no me deja guardar".
 */
describe('intentar', () => {
  it('deja pasar el resultado cuando todo sale bien', async () => {
    const r = await intentar(async () => ({ ok: true as const, id: 'abc' }))
    expect(r).toEqual({ ok: true, id: 'abc' })
  })

  it('deja pasar el error cuando la acción lo devuelve', async () => {
    const r = await intentar(async () => ({ ok: false as const, error: 'Falta el nombre.' }))
    expect(r).toEqual({ ok: false, error: 'Falta el nombre.' })
  })

  /** LA PRUEBA QUE IMPORTA: una acción que lanza ya no cuelga el botón. */
  it('convierte una excepción en un error que se puede mostrar', async () => {
    const r = await intentar(async () => {
      throw new Error('algo se rompió')
    })

    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('algo se rompió')
  })

  it('la sesión vencida tiene su propio mensaje, accionable', async () => {
    // Es la causa más común -el panel se usa a lo largo del día- y la única
    // que la persona puede resolver sola.
    const r = await intentar(async () => {
      throw new Error('FORBIDDEN')
    })

    expect((r as { error: string }).error).toContain('sesión')
    expect((r as { error: string }).error).toContain('entrar')
    expect((r as { error: string }).error).not.toContain('FORBIDDEN')
  })

  it('aguanta que se lance algo que no es un Error', async () => {
    const r = await intentar(async () => {
      throw 'texto suelto'
    })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('texto suelto')
  })

  it('nunca devuelve un error vacío', async () => {
    for (const lanzado of [new Error(''), '', null, undefined]) {
      const r = await intentar(async () => {
        throw lanzado
      })
      expect((r as { error: string }).error.length).toBeGreaterThan(0)
    }
  })
})
