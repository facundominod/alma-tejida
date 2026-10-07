import { Skeleton } from '@/components/ui/primitives'

/**
 * Espera de TODO el panel.
 *
 * Las trece pantallas del panel leen la sesión y consultan la base en cada
 * visita: ninguna se puede prerenderizar. Hasta ahora no había ninguna señal
 * de carga, así que tocar "Productos" o "Pedidos" dejaba la pantalla anterior
 * quieta durante uno o dos segundos. Eso no se lee como "está cargando", se
 * lee como "no anduvo", y lleva a tocar otra vez.
 *
 * Es un esqueleto y no un ovillo girando a propósito: las pantallas del panel
 * son listas y tarjetas, y ver aparecer la FORMA de lo que viene hace que la
 * espera se sienta más corta que ver un símbolo abstracto. También evita el
 * salto: cuando llegan los datos, ya hay algo del mismo tamaño en su lugar.
 */
export default function PanelCargando() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando">
      {/* Encabezado */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
      </div>

      {/* Fila de números */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Contenido */}
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
