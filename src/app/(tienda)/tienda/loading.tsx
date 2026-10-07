import { ThreadLoader } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'

/**
 * Espera del catálogo.
 *
 * El catálogo es dinámico: filtra, busca y pagina contra la base, así que no
 * se puede prerenderizar como la home. Sin este archivo, Next se queda en la
 * página anterior sin ninguna señal mientras llega la respuesta, y en una
 * conexión lenta eso se lee como "el botón no funcionó".
 *
 * Con él, el header y el pie ya están pintados y sólo el centro espera.
 */
export default function CatalogoCargando() {
  return <ThreadLoader label={COPY.loading} className="at-alto-espera justify-center" />
}
