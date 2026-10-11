'use client'

import * as React from 'react'

/**
 * El pedazo de pantalla que la persona está viendo de verdad.
 *
 * El problema: un elemento `position: fixed` se ancla a la ventana de
 * MAQUETADO, que no cambia al hacer zoom. Cuando alguien separa los dedos
 * para ver un detalle del tejido, la ventana VISIBLE se achica y se mueve
 * dentro de la de maquetado — pero el visor de fotos sigue dibujado sobre la
 * grande. El resultado es que el borde de arriba, con el botón de cerrar,
 * queda fuera de lo que se ve y hay que scrollear para encontrarlo.
 *
 * `visualViewport` informa esa ventana real: su tamaño y cuánto se corrió.
 * Con eso el visor se coloca donde la persona está mirando.
 *
 * Se lee con `useSyncExternalStore`, que es la forma que React tiene de
 * suscribirse a algo de afuera. Hacerlo con un efecto y `setState` provoca un
 * render en cascada por cada píxel de zoom, y con los dedos sobre la pantalla
 * eso son decenas por segundo.
 *
 * Devuelve null cuando no hay zoom: ahí el `fixed inset-0` de siempre ya es
 * correcto y más barato.
 */

type Caja = { ancho: number; alto: number; x: number; y: number }

/** Sin zoom no hay nada que corregir. Umbral flojo por el redondeo. */
const SIN_ZOOM = 1.01

function suscribir(avisar: () => void) {
  const vv = window.visualViewport
  if (!vv) return () => {}

  vv.addEventListener('resize', avisar)
  vv.addEventListener('scroll', avisar)
  return () => {
    vv.removeEventListener('resize', avisar)
    vv.removeEventListener('scroll', avisar)
  }
}

/**
 * `useSyncExternalStore` compara la instantánea con `Object.is`, así que
 * devolver un objeto nuevo en cada lectura sería un bucle infinito. Se
 * memoriza el último y sólo se crea otro cuando algún número cambió.
 */
let ultima: Caja | null = null

function leer(): Caja | null {
  const vv = typeof window === 'undefined' ? null : window.visualViewport
  if (!vv || vv.scale <= SIN_ZOOM) {
    ultima = null
    return null
  }

  if (
    ultima &&
    ultima.ancho === vv.width &&
    ultima.alto === vv.height &&
    ultima.x === vv.offsetLeft &&
    ultima.y === vv.offsetTop
  ) {
    return ultima
  }

  ultima = { ancho: vv.width, alto: vv.height, x: vv.offsetLeft, y: vv.offsetTop }
  return ultima
}

/** En el servidor no hay ventana, y tampoco hay zoom que corregir. */
const enElServidor = () => null

export function useVentanaVisible(): React.CSSProperties | null {
  const caja = React.useSyncExternalStore(suscribir, leer, enElServidor)

  if (!caja) return null

  return {
    position: 'fixed',
    top: 0,
    left: 0,
    width: caja.ancho,
    height: caja.alto,
    // `offsetLeft/Top` es cuánto se corrió la ventana visible dentro de la de
    // maquetado: se compensa con una traslación para quedar justo encima.
    transform: `translate(${caja.x}px, ${caja.y}px)`,
    transformOrigin: 'top left',
  }
}
