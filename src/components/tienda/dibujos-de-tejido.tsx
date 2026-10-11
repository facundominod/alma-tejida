import { cn } from '@/lib/utils'

/**
 * Los tres dibujos del tejido, dibujados.
 *
 * "Líneas", "Cuadrillé" y "Nido" no le dicen nada a quien nunca vio uno, y la
 * diferencia entre los tres es exactamente lo que cambia el precio. Describir
 * con palabras un dibujo es la peor forma de explicarlo: se muestra.
 *
 * Son SVG y no fotos a propósito. Una foto de un respaldo real muestra el
 * tejido Y la madera Y la pared Y la luz de ese día; acá hace falta aislar el
 * patrón para poder compararlos de un vistazo. Además pesan unos bytes y se
 * ven nítidos en cualquier pantalla.
 *
 * El trazo usa `currentColor`, así que heredan el color del contexto y
 * funcionan igual sobre fondo claro que sobre uno con textura.
 */

type Props = { className?: string }

const CAJA = 'h-full w-full'

/** Hilos verticales con nudos: el tejido más simple. */
export function DibujoLineas({ className }: Props) {
  return (
    <svg viewBox="0 0 80 80" className={cn(CAJA, className)} aria-hidden="true" fill="none">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {[12, 24, 36, 48, 60, 68].map((x) => (
          <line key={x} x1={x} y1="8" x2={x} y2="72" />
        ))}
        {/* Los nuditos que quedan al anudar cada hilo al bastidor. */}
        {[12, 24, 36, 48, 60, 68].map((x) => (
          <circle key={`n${x}`} cx={x} cy="12" r="2" fill="currentColor" stroke="none" />
        ))}
      </g>
    </svg>
  )
}

/** Cuadrados: hilos verticales y horizontales cruzados. */
export function DibujoCuadrille({ className }: Props) {
  return (
    <svg viewBox="0 0 80 80" className={cn(CAJA, className)} aria-hidden="true" fill="none">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {[12, 26, 40, 54, 68].map((x) => (
          <line key={`v${x}`} x1={x} y1="8" x2={x} y2="72" />
        ))}
        {[16, 30, 44, 58, 70].map((y) => (
          <line key={`h${y}`} x1="8" y1={y} x2="72" y2={y} />
        ))}
      </g>
    </svg>
  )
}

/**
 * Rombos encadenados: el macramé en nido de abeja.
 *
 * Cada rombo nace de dos nudos que se abren y se vuelven a juntar. Se dibuja
 * la trama completa, no un rombo suelto, porque lo que distingue al nido es
 * justamente que los rombos se encadenan entre sí.
 */
export function DibujoNido({ className }: Props) {
  const rombos: string[] = []
  const paso = 16

  for (let fila = 0; fila < 4; fila += 1) {
    const y = 10 + fila * paso
    // Las filas impares van corridas medio rombo: así se encadenan.
    const corrimiento = fila % 2 === 0 ? 0 : paso / 2
    for (let col = 0; col < 5; col += 1) {
      const x = 8 + col * paso + corrimiento
      if (x > 74) continue
      rombos.push(
        `M${x} ${y} L${x + paso / 2} ${y + paso / 2} L${x} ${y + paso} L${x - paso / 2} ${y + paso / 2} Z`,
      )
    }
  }

  return (
    <svg viewBox="0 0 80 80" className={cn(CAJA, className)} aria-hidden="true" fill="none">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        {rombos.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  )
}

/** Devuelve el dibujo que corresponde al nombre guardado en la base. */
export function dibujoPara(nombre: string) {
  const limpio = nombre.toLowerCase()
  if (limpio.includes('nido')) return DibujoNido
  if (limpio.includes('cuadrill')) return DibujoCuadrille
  if (limpio.includes('línea') || limpio.includes('linea')) return DibujoLineas
  return null
}
