// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest'
import * as React from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CampoDePrecio } from '../src/components/admin/campo-de-precio'

/**
 * El campo donde se escribe un precio.
 *
 * ESTO ES LO QUE ESTABA ROTO Y POR QUÉ ESTA PRUEBA EXISTE
 * Los campos eran `<input type="number">`. Medido en un navegador de verdad:
 *
 *   "150,000"  →  el campo quedaba VACÍO y el formulario no se enviaba
 *   "45.760"   →  "Introduce un valor válido", no se enviaba
 *   "150.000"  →  se guardaba 150
 *
 * Las tres son formas normales de escribir un precio en Argentina, y por eso
 * "no me deja guardar precios". Lo que se prueba acá es que las tres entran, y
 * sobre todo que lo que VIAJA al servidor es el número correcto: el campo
 * oculto es el que lee el formulario.
 */

function Campo({ inicial = null }: { inicial?: number | null }) {
  const [valor, setValor] = React.useState<number | null>(inicial)
  return (
    <>
      <CampoDePrecio name="precio" valor={valor} alCambiar={setValor} aria-label="Precio" />
      <output data-testid="leido">{valor ?? 'nulo'}</output>
    </>
  )
}

const campo = () => screen.getByLabelText('Precio') as HTMLInputElement
const oculto = () => document.querySelector('input[name="precio"]') as HTMLInputElement
const leido = () => screen.getByTestId('leido').textContent

describe('CampoDePrecio', () => {
  afterEach(cleanup)

  it('entiende un precio escrito con puntos de miles', () => {
    render(<Campo />)
    fireEvent.change(campo(), { target: { value: '150.000' } })

    expect(leido()).toBe('150000')
    expect(oculto().value).toBe('150000')
  })

  it('entiende el que antes trababa el formulario', () => {
    render(<Campo />)
    // Con `type="number"` esto dejaba el campo vacío y el formulario no se
    // enviaba. Es, literalmente, el "no me deja guardar precios".
    fireEvent.change(campo(), { target: { value: '150,000' } })

    expect(leido()).toBe('150000')
  })

  it('entiende el que antes se guardaba mil veces más chico', () => {
    render(<Campo />)
    fireEvent.change(campo(), { target: { value: '45.760' } })

    expect(leido()).toBe('45760')
    expect(leido()).not.toBe('45')
  })

  it('acepta el signo de peso pegado', () => {
    render(<Campo />)
    fireEvent.change(campo(), { target: { value: '$ 215.000' } })

    expect(leido()).toBe('215000')
  })

  /**
   * LA PRUEBA QUE IMPORTA.
   *
   * El caso "150.00" es ambiguo y se resuelve con una heurística. Mostrar el
   * número ya interpretado al salir del campo es lo que convierte una
   * adivinanza en algo verificable: si entendió otra cosa, se ve ahí y no al
   * cobrar.
   */
  it('al salir del campo muestra cómo entendió lo que se escribió', () => {
    render(<Campo />)
    fireEvent.change(campo(), { target: { value: '215000' } })
    fireEvent.blur(campo())

    expect(campo().value).toBe('215.000')
  })

  it('vacío es nulo y no cero', () => {
    // Cero es un precio; vacío es "no lo escribí". Confundirlos hacía que un
    // campo rechazado se guardara como $0.
    render(<Campo inicial={150_000} />)
    fireEvent.change(campo(), { target: { value: '' } })

    expect(leido()).toBe('nulo')
    expect(oculto().value).toBe('')
  })

  it('arranca mostrando el precio que ya tenía la pieza, formateado', () => {
    render(<Campo inicial={215_000} />)
    expect(campo().value).toBe('215.000')
    expect(oculto().value).toBe('215000')
  })

  it('no pelea con el cursor mientras se escribe', () => {
    // Si reformateara en cada tecla, escribir "1" y después "5" devolvería
    // "15" con el cursor movido. El formato llega recién al salir.
    render(<Campo />)
    fireEvent.change(campo(), { target: { value: '1' } })
    expect(campo().value).toBe('1')
    fireEvent.change(campo(), { target: { value: '15' } })
    expect(campo().value).toBe('15')
    fireEvent.change(campo(), { target: { value: '150' } })
    expect(campo().value).toBe('150')
  })

  it('el campo es de texto, no numérico', () => {
    // Si alguien lo vuelve a `type="number"`, vuelven los tres defectos. Esta
    // aserción es la que lo impide.
    render(<Campo />)
    expect(campo().type).toBe('text')
    expect(campo().inputMode).toBe('decimal')
  })
})
