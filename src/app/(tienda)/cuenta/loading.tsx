import { ThreadLoader } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'

/**
 * Espera de toda la sección de cuenta.
 *
 * Estas rutas leen la sesión en cada visita, así que no se pueden
 * prerenderizar: cada navegación es un viaje al servidor y de ahí a la base.
 * Sin este archivo, tocar "Mis pedidos" no hacía NADA visible durante ese
 * viaje —la pantalla anterior quedaba igual—, y eso no se lee como "está
 * cargando": se lee como "se tildó".
 *
 * Al estar en /cuenta, cubre también a pedidos, datos, preguntas y reseñas.
 */
export default function CuentaCargando() {
  return <ThreadLoader label={COPY.loading} className="at-alto-espera justify-center" />
}
