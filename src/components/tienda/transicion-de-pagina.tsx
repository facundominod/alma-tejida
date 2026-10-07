'use client'

import { usePathname } from 'next/navigation'
import * as React from 'react'

/**
 * Entrada suave al cambiar de página.
 *
 * Sin esto, pasar de una pantalla a otra es un corte seco: el contenido viejo
 * desaparece y el nuevo aparece de golpe, en el mismo frame. A ojo eso no se
 * lee como "rápido", se lee como "brusco" —y cuando encima hay un viaje al
 * servidor en el medio, como "trabado"—.
 *
 * Es una animación de opacidad y desplazamiento de seis píxeles, 220 ms. Las
 * dos las resuelve el compositor: no obliga al navegador a recalcular el
 * layout ni a repintar, así que cuesta lo mismo en un teléfono de gama baja
 * que en uno caro. Eso importa más que la animación en sí: una transición que
 * hace trabajar al dispositivo convierte "brusco" en "lento", que es peor.
 *
 * La `key` es la ruta, no la URL completa: filtrar el catálogo cambia los
 * parámetros pero no la página, y ahí volver a animar todo sería ruido.
 *
 * Con `prefers-reduced-motion` no anima (ver globals.css).
 */
export function TransicionDePagina({ children }: { children: React.ReactNode }) {
  const ruta = usePathname()

  return (
    <div key={ruta} className="at-entrada">
      {children}
    </div>
  )
}
