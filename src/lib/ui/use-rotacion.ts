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

    const espera = window.setTimeout(arrancar, retrasoMs)

    return () => {
      window.clearTimeout(espera)
      if (intervalo !== undefined) window.clearInterval(intervalo)
    }
  }, [activo, cantidad, visible, intervaloMs, retrasoMs])

  // Si cambia la cantidad (filtros del catálogo), el índice puede quedar fuera
  // de rango. Se corrige durante el render, no en un efecto: en un efecto se
  // vería un frame con la imagen equivocada.
  const seguro = cantidad > 0 ? indice % cantidad : 0

  return { indice: seguro, ref, setIndice }
}
