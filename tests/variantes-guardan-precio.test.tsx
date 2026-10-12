// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

/**
 * Lo que de verdad sale del formulario de variantes al apretar Guardar.
 *
 * POR QUE ESTA PRUEBA
 * En la base quedó registrado que el guardado llegaba -las 42 combinaciones
 * se tocaban- pero sin cambiar un solo precio: `price_history` no anotó
 * ninguna variante, y ese disparador anota cualquier precio que cambie de
 * valor. O sea que el servidor recibía los precios VIEJOS. Entre lo que se
 * escribe en el campo y lo que viaja había algo comiéndose el número.
 *
 * Asi que acá se monta el formulario de verdad, se escribe en los campos como
 * se escribe en el panel, se aprieta Guardar y se mira el payload.
 */

type Payload = { variants: Array<{ price_override: unknown }> }
const guardar = vi.fn(async (_payload: Payload) => ({ ok: true as const }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/admin/catalog', () => ({
  saveProductStructure: (payload: Payload) => guardar(payload),
  simularOferta: vi.fn(),
  guardarReglas: vi.fn(),
}))

const { VariantBuilder } = await import('../src/components/admin/variant-builder')

const ATRIBUTO = {
  key: 'a1',
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Medida',
  type: 'measure' as const,
  values: [
    { key: 'v1', id: '22222222-2222-4222-8222-222222222222', value: '1,20' },
    { key: 'v2', id: '33333333-3333-4333-8333-333333333333', value: '2,00' },
  ],
}

const VARIANTES = [
  { key: 'c1', id: '44444444-4444-4444-8444-444444444444', options: { a1: 'v1' }, sku: '', price_override: '150.000', is_active: true },
  { key: 'c2', id: '55555555-5555-4555-8555-555555555555', options: { a1: 'v2' }, sku: '', price_override: '320.000', is_active: true },
]

function montar() {
  render(
    <VariantBuilder
      productId="66666666-6666-4666-8666-666666666666"
      basePrice={150000}
      initialAttributes={[ATRIBUTO]}
      initialVariants={VARIANTES}
    />,
  )
}

/** Escribir en un campo como se escribe en el panel: tipear y salir. */
function escribir(etiqueta: RegExp, texto: string) {
  const campo = screen.getByLabelText(etiqueta) as HTMLInputElement
  fireEvent.change(campo, { target: { value: texto } })
  fireEvent.blur(campo)
  return campo
}

beforeEach(() => guardar.mockClear())
afterEach(cleanup)

describe('el precio que se escribe es el que viaja', () => {
  it('un precio nuevo en una combinación llega al servidor', async () => {
    montar()
    escribir(/precio de 1,20/i, '215.000')
    fireEvent.click(screen.getByRole('button', { name: /guardar características/i }))

    await vi.waitFor(() => expect(guardar).toHaveBeenCalled())
    const enviado = guardar.mock.calls[0][0]
    expect(enviado.variants[0].price_override).toBe(215000)
    // Y la otra no se toca.
    expect(enviado.variants[1].price_override).toBe(320000)
  })

  it('cambiar las dos manda las dos', async () => {
    montar()
    escribir(/precio de 1,20/i, '215.000')
    escribir(/precio de 2,00/i, '400.000')
    fireEvent.click(screen.getByRole('button', { name: /guardar características/i }))

    await vi.waitFor(() => expect(guardar).toHaveBeenCalled())
    const enviado = guardar.mock.calls[0][0]
    expect(enviado.variants.map((v) => v.price_override)).toEqual([215000, 400000])
  })

  it('escrito con coma decimal también', async () => {
    montar()
    escribir(/precio de 1,20/i, '215000,50')
    fireEvent.click(screen.getByRole('button', { name: /guardar características/i }))

    await vi.waitFor(() => expect(guardar).toHaveBeenCalled())
    const enviado = guardar.mock.calls[0][0]
    expect(enviado.variants[0].price_override).toBe(215000.5)
  })
})
