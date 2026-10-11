'use client'

import * as React from 'react'
import { Input } from '@/components/ui/field'
import { formatearParaEditar, parsearPrecio } from '@/lib/parsear-precio'
import { cn } from '@/lib/utils'

/**
 * Un campo para escribir plata.
 *
 * POR QUÉ NO ES UN `<input type="number">`
 * Porque el navegador lee el número con SU configuración y no con la nuestra.
 * Escribir "150,000" dejaba el campo vacío y el formulario no se enviaba;
 * "45.760" daba "Introduce un valor válido"; y "150.000" se guardaba como 150.
 * Es decir: escribir un precio como lo escribe cualquiera acá o trababa el
 * guardado o guardaba mil veces menos, en silencio.
 *
 * Así que es un campo de texto con `inputMode="decimal"` —el teclado del
 * teléfono igual muestra números— y la interpretación la hace
 * `parsearPrecio()`, que sí sabe que la coma es el decimal.
 *
 * SE REFORMATEA AL SALIR, Y ESO NO ES COSMÉTICA
 * Hay un caso ambiguo: "150.00" puede ser ciento cincuenta con decimales o
 * quince mil mal escrito. Mostrar el número ya interpretado apenas se sale del
 * campo es lo que convierte una adivinanza en algo verificable: si entendió
 * otra cosa, se ve ahí y no al cobrar.
 *
 * EL VALOR QUE VIAJA ES UN NÚMERO LIMPIO
 * En un `<input hidden>` aparte. El formulario lee ese, no el texto: así nadie
 * más tiene que acordarse de parsear.
 */
export function CampoDePrecio({
  name,
  valor,
  alCambiar,
  id,
  required,
  className,
  ...props
}: {
  name?: string
  /** El valor en pesos. Nulo cuando está vacío. */
  valor: number | null
  alCambiar: (valor: number | null) => void
  id?: string
  required?: boolean
  className?: string
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'name'>) {
  // Lo que se ve mientras se escribe. Separado del valor para no reformatear
  // en cada tecla: hacerlo movería el cursor a cada rato.
  const [texto, setTexto] = React.useState(() => formatearParaEditar(valor))

  // Si el valor cambia desde afuera —una tanda, un reset— el texto lo sigue.
  const ultimoValor = React.useRef(valor)
  React.useEffect(() => {
    if (valor !== ultimoValor.current) {
      ultimoValor.current = valor
      setTexto(formatearParaEditar(valor))
    }
  }, [valor])

  return (
    <>
      <Input
        {...props}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required={required}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          const n = parsearPrecio(e.target.value)
          ultimoValor.current = n
          alCambiar(n)
        }}
        onBlur={() => {
          const n = parsearPrecio(texto)
          ultimoValor.current = n
          setTexto(formatearParaEditar(n))
          alCambiar(n)
        }}
        placeholder="150.000"
        className={cn('tabular', className)}
      />

      {/* Lo que lee el formulario: el número sin puntos ni símbolos. */}
      {name && <input type="hidden" name={name} value={valor ?? ''} />}
    </>
  )
}
