import { cn } from '@/lib/utils'

/**
 * El ovillo que gira.
 *
 * Reemplaza al spinner genérico que venía con los iconos. Un círculo girando
 * no dice nada; un ovillo de lana desenrollándose dice qué clase de lugar es
 * éste, y lo dice en el único momento en que alguien está obligado a mirar la
 * pantalla sin hacer nada.
 *
 * Dos tamaños, dos dibujos distintos a propósito:
 *
 * - `Ovillo` va adentro de los botones, a 16 px. Ahí sólo entra el ovillo:
 *   agregarle agujas a ese tamaño lo convierte en una mancha.
 * - `OvilloConAgujas` va en las esperas de página completa, donde hay lugar
 *   para el dibujo entero.
 *
 * El color sale de la paleta de la casa —sage para la lana, wood para las
 * agujas—. Un verde saturado sería el único color estridente de toda la
 * tienda.
 *
 * Las dos respetan `prefers-reduced-motion`: ver globals.css.
 */

/** Las vueltas de lana. Se dibujan igual en los dos tamaños. */
function Vueltas() {
  return (
    <g stroke="var(--color-sage-600)" strokeWidth="1.5" fill="none" opacity="0.75">
      <ellipse cx="32" cy="32" rx="7" ry="15" transform="rotate(-28 32 32)" />
      <ellipse cx="32" cy="32" rx="14" ry="7" transform="rotate(-28 32 32)" />
      <ellipse cx="32" cy="32" rx="11" ry="13" transform="rotate(22 32 32)" />
    </g>
  )
}

/** Ovillo solo, para botones y textos. Hereda el tamaño por clase. */
export function Ovillo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('at-ovillo size-4 shrink-0', className)}
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="16" fill="var(--color-sage-100)" />
      <Vueltas />
      <circle
        cx="32"
        cy="32"
        r="16"
        fill="none"
        stroke="var(--color-sage-500)"
        strokeWidth="2"
      />
    </svg>
  )
}

/**
 * Ovillo con dos agujas cruzadas y la hebra saliendo.
 *
 * Las agujas no giran: son la herramienta, están quietas mientras el ovillo
 * se desenrolla. Si giraran las dos cosas, el dibujo se leería como un
 * remolino y no como alguien tejiendo.
 */
export function OvilloConAgujas({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-14 shrink-0', className)} aria-hidden="true">
      {/* Agujas: debajo del ovillo, con las puntas asomando arriba. */}
      <g
        stroke="var(--color-wood-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="var(--color-wood-500)"
      >
        <line x1="13" y1="55" x2="45" y2="17" />
        <line x1="51" y1="55" x2="19" y2="17" />
        <circle cx="13" cy="55" r="2.5" stroke="none" />
        <circle cx="51" cy="55" r="2.5" stroke="none" />
      </g>

      {/* Ovillo, girando sobre su centro. */}
      <g className="at-ovillo">
        <circle cx="32" cy="34" r="15" fill="var(--color-sage-100)" />
        <g transform="translate(0 2)">
          <Vueltas />
        </g>
        <circle
          cx="32"
          cy="34"
          r="15"
          fill="none"
          stroke="var(--color-sage-500)"
          strokeWidth="2"
        />
      </g>

      {/* La hebra que se va. Se dibuja sola, una y otra vez. */}
      <path
        className="at-hebra"
        d="M32 49 C 36 56, 44 54, 47 60"
        fill="none"
        stroke="var(--color-sage-500)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
