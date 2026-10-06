'use client'

import * as React from 'react'

/**
 * Mantiene un elemento montado mientras se anima su salida.
 *
 * Es el reemplazo de `AnimatePresence` para los componentes que viven en el
 * layout —header, menú lateral, carrito— y que por lo tanto se cargan en
 * TODAS las páginas. Motion pesa unos 44 KB comprimidos; esto pesa cincuenta
 * líneas, y las animaciones que necesitamos (desplazar, fundir, escalar) las
 * hace CSS de forma nativa y en el compositor, igual de suave.
 *
 * Motion se sigue usando donde su valor es alto y el costo queda acotado a una
 * sola ruta: la galería de la ficha de producto.
 *
 * Devuelve:
 *   montado → si hay que renderizar el elemento
 *   visible → si ya tiene que estar en su posición final (para las clases)
 *
 * Con `prefers-reduced-motion` la salida es inmediata: no tiene sentido
 * esperar a una animación que no va a ocurrir.
 */

type Fase = 'cerrado' | 'entrando' | 'abierto' | 'saliendo'

export function usePresence(abierto: boolean, duracionMs = 300) {
  const [fase, setFase] = React.useState<Fase>(abierto ? 'abierto' : 'cerrado')

  // Se ajusta DURANTE EL RENDER, que es el patrón que React recomienda para
  // reaccionar a un cambio de props. Hacerlo en un efecto provocaría un
  // render extra y un parpadeo.
  const [previo, setPrevio] = React.useState(abierto)
  if (abierto !== previo) {
    setPrevio(abierto)
    setFase(abierto ? 'entrando' : 'saliendo')
  }

  React.useEffect(() => {
    if (fase === 'entrando') {
      // Un frame en la posición inicial para que el navegador la registre;
      // sin esta espera la transición no arranca y el panel aparece de golpe.
      //
      // Hay que cancelar LOS DOS. Cancelar sólo el de afuera parecía
      // suficiente y no lo era: si el de afuera ya corrió, la limpieza no
      // cancela nada y el de adentro sigue en cola. Cerrar dentro de esos dos
      // frames —apretar Escape apenas se abre el menú— dejaba el estado en
      // 'saliendo' y el frame pendiente lo devolvía a 'abierto': el panel se
      // quedaba abierto para siempre, sin forma de cerrarlo.
      //
      // Lo encontraron las pruebas de celular; en escritorio ese menú no
      // existe y no se veía.
      let interior = 0
      const exterior = requestAnimationFrame(() => {
        interior = requestAnimationFrame(() => setFase('abierto'))
      })
      return () => {
        cancelAnimationFrame(exterior)
        cancelAnimationFrame(interior)
      }
    }

    if (fase === 'saliendo') {
      const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const id = window.setTimeout(() => setFase('cerrado'), reducido ? 0 : duracionMs)
      return () => window.clearTimeout(id)
    }
  }, [fase, duracionMs])

  return {
    montado: fase !== 'cerrado',
    visible: fase === 'abierto',
    fase,
  }
}
