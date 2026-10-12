import { z } from 'zod'

/**
 * Los validadores del panel que no son acciones.
 *
 * POR QUE VIVEN FUERA DE `catalog.ts`
 * Ese archivo lleva `'use server'`, y un archivo asi solo puede exportar
 * funciones asincronicas: exportar un esquema desde ahi rompe la compilacion.
 * Y sin exportarlo no se puede probar, que es justo lo que hizo falta cuando
 * el esquema y el formulario se desfasaron sin que nadie se enterara.
 */

/**
 * Un precio que puede llegar como numero o como texto.
 *
 * Sale siempre como texto o null, que es lo que espera la funcion de la base:
 * `nullif(valor, '')::numeric`.
 *
 * `.optional()` va afuera del union y no como un `z.undefined()` adentro: con
 * el undefined adentro, una clave que NO VIENE sigue fallando -el resultado
 * de un transform cuenta como obligatorio- y el formulario de variantes no
 * manda `low_stock_threshold`. O sea que arreglar el precio rompia el
 * guardado entero. Lo agarro la prueba de abajo.
 */
const precioFlexible = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n.toString() : null
  })

export const structureSchema = z.object({
  productId: z.string().uuid(),
  attributes: z.array(
    z.object({
      key: z.string().min(1),
      id: z.string().uuid().nullish(),
      name: z.string().trim().min(1).max(60),
      type: z.enum(['select', 'text', 'number', 'measure', 'color']),
      values: z.array(
        z.object({
          key: z.string().min(1),
          id: z.string().uuid().nullish(),
          value: z.string().trim().min(1).max(80),
          color_hex: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .nullish(),
        }),
      ),
    }),
  ),
  variants: z.array(
    z.object({
      id: z.string().uuid().nullish(),
      options: z.record(z.string(), z.string()),
      sku: z.string().trim().max(60).nullish(),
      // Numero o texto, los dos.
      //
      // EL ERROR QUE ESTO ARREGLA, QUE SE VEIA COMO "GUARDO Y NO ME ACTUALIZA"
      // El formulario interpreta "215.000" con parsearPrecio() y manda un
      // NUMERO -215000-, porque mandar el texto crudo hacia que la base
      // leyera 215. Pero aca se exigia texto. Un numero no pasaba la
      // validacion, y cuando la validacion falla no se guarda NADA: ni los
      // precios, ni el SKU, ni las combinaciones.
      //
      // Solo mordia cuando habia un precio escrito: con el campo vacio llega
      // null, que si pasaba. Por eso las piezas simples se guardaban bien y
      // el respaldo a medida -donde cada una de las 42 combinaciones lleva su
      // precio- no se guardaba nunca.
      //
      // La funcion de la base recibe el numero como texto y lo pasa a
      // numeric, asi que los dos lados quedan contentos.
      price_override: precioFlexible,
      low_stock_threshold: precioFlexible,
      is_active: z.boolean().optional(),
    }),
  ),
})
