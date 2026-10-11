import { dibujoPara } from '@/components/tienda/dibujos-de-tejido'
import { formatPrice } from '@/lib/utils'
import type {
  ProductAttribute,
  ProductAttributeValue,
  VariantView,
} from '@/types/database'

type ConValores = ProductAttribute & { values: ProductAttributeValue[] }

/**
 * La lista de precios, dibujada y legible.
 *
 * Qué resuelve: un respaldo se cotiza por dos cosas al mismo tiempo —cuánto
 * mide y qué dibujo lleva— y el selector de variantes, que es excelente para
 * comprar, es pésimo para COMPARAR. Quien está decidiendo necesita ver los
 * siete anchos y los dos precios al lado, como en la libreta donde estaban
 * anotados.
 *
 * De dónde salen los números: de las variantes reales de esta pieza, las
 * mismas que se editan en el panel. No hay una tabla de precios aparte que
 * mantener sincronizada. Si mañana sube el ancho de 1,60, sube acá sin que
 * nadie toque código. Si falta una combinación, la celda queda vacía en lugar
 * de inventar un número.
 *
 * Se arma sola a partir de las características, pero sólo aparece si la pieza
 * tiene las dos que necesita —un ancho y un diseño—. Para cualquier otra
 * pieza, no se dibuja nada.
 */
export function GuiaDePrecios({
  attributes,
  variants,
  combinations,
  sinEncabezado = false,
}: {
  attributes: ConValores[]
  variants: VariantView[]
  /** variant_id -> { attribute_id: value_id } */
  combinations: Record<string, Record<string, string>>
  /**
   * El título lo pone el bloque plegable que la envuelve. Sin esto, la ficha
   * mostraría el mismo título dos veces: una en la solapa y otra adentro.
   */
  sinEncabezado?: boolean
}) {
  const ancho = attributes.find((a) => a.name.toLowerCase().startsWith('ancho'))
  const diseno = attributes.find((a) => /dise/i.test(a.name))

  if (!ancho || !diseno || ancho.values.length === 0 || diseno.values.length === 0) {
    return null
  }

  // Si hay una tercera característica —la madera, por ejemplo— la tabla
  // muestra los precios de su PRIMERA opción, que es la que viene por
  // defecto. Mezclar las dos en la misma celda daría dos precios por casillero
  // y la tabla dejaría de leerse. El recargo se explica abajo, en palabras.
  const terceras = attributes.filter((a) => a.id !== ancho.id && a.id !== diseno.id)
  const porDefecto = new Map(terceras.map((a) => [a.id, a.values[0]?.id]))

  /** Precio de un cruce ancho × diseño, con las demás opciones por defecto. */
  const precioDe = (anchoId: string, disenoId: string) => {
    for (const variante of variants) {
      const opciones = combinations[variante.variant_id]
      if (!opciones) continue
      if (opciones[ancho.id] !== anchoId) continue
      if (opciones[diseno.id] !== disenoId) continue

      const coincideElResto = terceras.every(
        (a) => porDefecto.get(a.id) === undefined || opciones[a.id] === porDefecto.get(a.id),
      )
      if (!coincideElResto) continue

      return variante.final_price ?? variante.list_price
    }
    return null
  }

  return (
    <section className="mx-auto mt-14 max-w-3xl" aria-labelledby="precios">
      {!sinEncabezado && (
        <h2 id="precios" className="mb-1 font-display text-2xl">
        Precios
      </h2>
      )}
      <p className="mb-6 text-sm text-ink-muted">
        Según el ancho y el dibujo del tejido.
      </p>

      {/* Los dibujos primero: sin ver la diferencia, la tabla son numeros. */}
      <ul className="mb-8 grid grid-cols-3 gap-3 sm:gap-5">
        {diseno.values.map((valor) => {
          const Dibujo = dibujoPara(valor.value)
          return (
            <li key={valor.id} className="text-center">
              <div className="aspect-square overflow-hidden rounded-xl border border-border-soft bg-surface p-3 text-clay-400">
                {Dibujo ? <Dibujo /> : null}
              </div>
              <p className="pt-2 text-sm font-medium text-ink">{valor.value}</p>
            </li>
          )
        })}
      </ul>

      <div className="overflow-hidden rounded-xl border border-border-soft">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Precio de cada ancho segun el dibujo del tejido
          </caption>
          <thead>
            <tr className="border-b border-border-soft bg-surface text-left text-xs uppercase tracking-[0.1em] text-ink-subtle">
              <th scope="col" className="px-4 py-3 font-medium">
                {ancho.name}
              </th>
              {diseno.values.map((valor) => (
                <th key={valor.id} scope="col" className="px-4 py-3 text-right font-medium">
                  {valor.value}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {ancho.values.map((valorAncho) => (
              <tr key={valorAncho.id}>
                <th scope="row" className="tabular px-4 py-3 text-left font-medium text-ink">
                  {valorAncho.value}
                </th>
                {diseno.values.map((valorDiseno) => {
                  const precio = precioDe(valorAncho.id, valorDiseno.id)
                  return (
                    <td
                      key={valorDiseno.id}
                      className="tabular px-4 py-3 text-right text-ink-muted"
                    >
                      {precio == null ? (
                        // Sin variante cargada no se inventa un precio: se
                        // dice que no esta.
                        <span className="text-ink-subtle">a consultar</span>
                      ) : (
                        formatPrice(precio)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {terceras.length > 0 && (
        <p className="mt-3 text-sm text-ink-subtle">
          Los precios de arriba son con{' '}
          {terceras
            .map((a) => `${a.name.toLowerCase()} ${a.values[0]?.value ?? ''}`.trim())
            .join(' y ')}
          . Las otras opciones se eligen al comprar y ajustan el precio.
        </p>
      )}
    </section>
  )
}
