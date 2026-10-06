'use client'

import { Overline } from '@/components/ui/primitives'
import { useRotacion } from '@/lib/ui/use-rotacion'
import { cn } from '@/lib/utils'

/**
 * La línea de arriba de la portada, turnándose entre varias frases.
 *
 * Decisiones:
 *
 * - **Se cruzan, no se reemplazan.** Las frases van apiladas en la misma celda
 *   de una grilla, así que el bloque mide lo que mide la más larga y no se
 *   mueve nada cuando cambia. Sin eso, el título de abajo daría un salto cada
 *   tres segundos y medio.
 *
 * - **La primera se dibuja en el servidor.** No hay un instante vacío ni un
 *   cambio de altura al hidratar.
 *
 * - **Sólo la visible existe para un lector de pantalla.** Las otras van con
 *   `aria-hidden`, y el contenedor NO es una región viva: anunciar una frase
 *   decorativa cada tres segundos sería insoportable.
 *
 * - **Con `prefers-reduced-motion` se queda en la primera.** Eso lo decide
 *   `useRotacion`, no esto.
 */
export function FrasesQueGiran({
  frases,
  className,
}: {
  frases: readonly string[]
  className?: string
}) {
  // Con una sola frase no hay nada que girar: se dibuja y listo.
  const { indice, ref } = useRotacion(frases.length, { intervaloMs: 3800 })

  if (frases.length === 0) return null
  if (frases.length === 1) return <Overline className={className}>{frases[0]}</Overline>

  return (
    <div ref={ref} className="grid">
      {frases.map((frase, i) => (
        <Overline
          key={frase}
          aria-hidden={i !== indice}
          // Marcas para poder comprobar el giro desde una prueba de navegador.
          // La opacidad no sirve: Playwright considera "visible" a un elemento
          // con opacity 0, porque ocupa lugar igual.
          data-frase=""
          data-activa={i === indice ? 'true' : undefined}
          className={cn(
            // Todas en la misma celda: el alto lo fija la más larga.
            '[grid-area:1/1]',
            'transition-opacity duration-[var(--at-dur-slow)] ease-[var(--ease-out-alma)]',
            'motion-reduce:transition-none',
            i === indice ? 'opacity-100' : 'opacity-0',
            className,
          )}
        >
          {frase}
        </Overline>
      ))}
    </div>
  )
}
