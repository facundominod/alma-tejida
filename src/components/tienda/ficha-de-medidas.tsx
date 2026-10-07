import type { ProductAttribute, ProductAttributeValue } from '@/types/database'

type ConValores = ProductAttribute & { values: ProductAttributeValue[] }

/**
 * Las medidas de la pieza, escritas.
 *
 * Hasta ahora las características sólo servían para ELEGIR: aparecían como
 * botones arriba del precio y en ningún otro lado. Para una manta eso alcanza
 * —se elige un color y listo—, pero una pieza hecha a medida es otra cosa:
 * quien está por encargar un respaldo necesita LEER el alto, el ancho y el
 * espesor, compararlos con su cama, y volver a mirarlos después. Un botón no
 * se lee, se aprieta.
 *
 * Por eso esta ficha muestra sólo las características de tipo **Medida**. El
 * color y el tipo de lana se siguen eligiendo arriba y no se repiten acá:
 * una tabla que mezcla "1,40 m" con "Crudo" no es una ficha de medidas, es la
 * misma lista dos veces.
 *
 * Es un `<dl>` y no una tabla a propósito: son pares nombre–valor, no filas y
 * columnas, y un lector de pantalla los anuncia emparejados.
 */
export function FichaDeMedidas({ attributes }: { attributes: ConValores[] }) {
  const medidas = attributes
    .filter((a) => a.type === 'measure' && a.values.length > 0)
    .sort((a, b) => a.position - b.position)

  if (medidas.length === 0) return null

  return (
    <section className="mx-auto mt-12 max-w-3xl" aria-labelledby="medidas">
      <h2 id="medidas" className="mb-4 font-display text-2xl">
        Medidas
      </h2>

      <dl className="divide-y divide-border-soft border-y border-border-soft">
        {medidas.map((medida) => (
          <div
            key={medida.id}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
          >
            <dt className="font-medium text-ink">{medida.name}</dt>
            <dd className="tabular text-right text-ink-muted">
              {medida.values
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((v) => v.value)
                .join(' · ')}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-sm text-ink-subtle">
        Cada pieza se teje a medida. Si necesitás una distinta, escribinos y la
        hacemos.
      </p>
    </section>
  )
}
