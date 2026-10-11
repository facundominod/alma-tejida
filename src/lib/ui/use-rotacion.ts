'use client'

import * as React from 'react'

/**
 * Va avanzando un índice cada tantos milisegundos.
 *
 * Lo usan las fotos de las tarjetas del catálogo y las frases de la portada.
 * Es la misma mecánica: mostrar una de varias cosas, por turnos, sin que
 * moleste.
 *
 * Tres decisiones que importan más que el bucle:
 *
 * 1. **Se detiene fuera de pantalla.** Con veinte tarjetas en el catálogo,
 *    veinte temporizadores corriendo a la vez calientan el teléfono por algo
 *    que nadie está mirando.
 *
 * 2. **Se detiene con la pestaña en segundo plano.** El navegador ya frena
 *    los temporizadores, pero no siempre, y volver con catorce avances
 *    pendientes hace parpadear todo de golpe.
 *
 * 3. **No arranca con `prefers-reduced-motion`.** Para quien marcó esa
 *    preferencia, una imagen que cambia sola no es un detalle de diseño: es
 *    lo que le pidió al sistema que no pasara.
 *
 * 4. **Se puede adelantar a mano, y entonces el reloj vuelve a cero.** Sin
 *    eso, pasar el dedo para ver la foto siguiente podía quedar a 200 ms del
 *    cambio automático: dos avances encimados y la sensación de que la tarjeta
 *    hace lo que quiere. Quien toca manda, y el automático espera su turno
 *    completo desde ese momento.
 */
export function useRotacion(
  cantidad: number,
  {
    intervaloMs = 3600,
    /** Desfase inicial, para que no cambien todas a la vez. */
    retrasoMs = 0,
    activo = true,
  }: { intervaloMs?: number; retrasoMs?: number; activo?: boolean } = {},
) {
  const [indice, setIndice] = React.useState(0)
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)
  // Cambia en cada avance manual, y eso reinicia el temporizador.
  const [reinicios, setReinicios] = React.useState(0)

  // Sólo gira lo que está en pantalla.
  React.useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observador = new IntersectionObserver(
      ([entrada]) => setVisible(entrada.isIntersecting),
      { rootMargin: '64px' },
    )
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  React.useEffect(() => {
    if (!activo || cantidad < 2 || !visible) return

    const reducido =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducido) return

    let intervalo: number | undefined

    const arrancar = () => {
      intervalo = window.setInterval(() => {
        // Con la pestaña escondida no se avanza: al volver, nadie se encuentra
        // con que se perdió media docena de fotos.
        if (document.hidden) return
        setIndice((i) => (i + 1) % cantidad)
      }, intervaloMs)
    }

    // El desfase inicial es para que veinte tarjetas no cambien al unísono.
    // Después de un toque ya no corresponde: quien tocó espera el intervalo
    // completo y nada más.
    const espera = window.setTimeout(arrancar, reinicios === 0 ? retrasoMs : 0)

    return () => {
      window.clearTimeout(espera)
      if (intervalo !== undefined) window.clearInterval(intervalo)
    }
  }, [activo, cantidad, visible, intervaloMs, retrasoMs, reinicios])

  // Si cambia la cantidad (filtros del catálogo), el índice puede quedar fuera
  // de rango. Se corrige durante el render, no en un efecto: en un efecto se
  // vería un frame con la imagen equivocada.
  const seguro = cantidad > 0 ? indice % cantidad : 0

  /** Avanza o retrocede a mano y reinicia el reloj del automático. */
  const avanzar = React.useCallback(
    (paso: number) => {
      if (cantidad < 2) return
      setIndice((i) => (i + paso + cantidad) % cantidad)
      setReinicios((r) => r + 1)
    },
    [cantidad],
  )

  /** Va a una foto concreta y reinicia el reloj. */
  const irA = React.useCallback(
    (destino: number) => {
      if (cantidad < 1) return
      setIndice(((destino % cantidad) + cantidad) % cantidad)
      setReinicios((r) => r + 1)
    },
    [cantidad],
  )

  return { indice: seguro, ref, setIndice, avanzar, irA }
}
