'use client'

import * as React from 'react'
import { Clock } from 'lucide-react'
import { calcularRestante, type Restante } from '@/lib/cuenta-regresiva'
import { cn } from '@/lib/utils'

/**
 * Cuánto falta para que termine una promoción.
 *
 * POR QUÉ NO SE CALCULA EN EL SERVIDOR
 * Porque la portada y /ofertas se generan una vez y se sirven desde caché. Un
 * "quedan 3 horas" calculado al generar la página seguiría diciendo lo mismo
 * mañana. El reloj tiene que ser del navegador o no es un reloj.
 *
 * Y POR QUÉ NO MUESTRA NADA HASTA MONTARSE
 * Porque el servidor no sabe qué hora es donde está la persona. Si pintara un
 * número, React encontraría otro al hidratar y avisaría de la diferencia. El
 * hueco dura un cuadro y evita todo eso.
 *
 * EL INTERVALO SIGUE A LA URGENCIA
 * A cinco días se recalcula una vez por hora; en el último minuto, una vez por
 * segundo. Un `setInterval` de un segundo corriendo todo el día para redibujar
 * el mismo "faltan 5 días" es trabajo que se paga en batería.
 */
export function CuentaRegresiva({
  termina,
  className,
}: {
  termina: string | null
  className?: string
}) {
  const [restante, setRestante] = React.useState<Restante | null>(null)

  React.useEffect(() => {
    if (!termina) return

    let timer: number | undefined

    const tick = () => {
      const siguiente = calcularRestante(termina)
      setRestante(siguiente)

      // Se reprograma en cada vuelta en lugar de usar un intervalo fijo: así
      // el ritmo se ajusta solo cuando la promoción entra en su última hora.
      if (siguiente && !siguiente.terminada) {
        timer = window.setTimeout(tick, siguiente.refrescoMs)
      }
    }

    tick()
    return () => window.clearTimeout(timer)
  }, [termina])

  // Terminada no se muestra: la promoción ya no corre y el precio tampoco.
  if (!restante || restante.terminada) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        restante.urgente ? 'at-latido bg-sale/15 text-sale' : 'bg-surface-muted text-ink-muted',
        className,
      )}
      role="timer"
    >
      <Clock className="size-3.5" aria-hidden="true" />
      <span className="tabular">{restante.texto}</span>
    </span>
  )
}
