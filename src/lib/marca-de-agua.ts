import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

/**
 * Pone la marca de agua arriba a la izquierda de una foto.
 *
 * Qué resuelve: las fotos de la tienda son el producto. Una pieza tejida se
 * compra por cómo se ve, y una foto buena se copia y reaparece en otro lado
 * sin que nadie se entere de quién la hizo. La marca no impide copiarla
 * —nada lo impide— pero hace que la copia siga diciendo de dónde salió.
 *
 * Tres decisiones:
 *
 * 1. **Sutil, no tapando.** 38 % de opacidad y un quinto del ancho. Tiene que
 *    poder leerse si alguien la busca y desaparecer si alguien mira la pieza.
 *    Una marca que compite con el producto espanta más ventas de las que
 *    protege.
 *
 * 2. **La imagen viene pre-dibujada**, no se arma acá. Lleva texto, el texto
 *    necesita fuentes, y en la función que procesa las fotos puede no
 *    haberlas: saldrían fotos con una marca sin letras y nadie se enteraría
 *    hasta mirar. Superponer dos imágenes no depende de nada.
 *
 * 3. **Si algo falla, la foto sale sin marca.** Una pieza publicada sin marca
 *    es un problema menor; una pieza que no se puede publicar es un problema
 *    de verdad.
 */

/**
 * Proporción del ancho de la foto que ocupa la marca.
 *
 * El sello es casi cuadrado: al 20 % del ancho ocuparía un quinto del ALTO
 * también, y eso ya no es una marca de agua, es una calcomanía. Al 13 % se
 * lee sin pelearle a la pieza.
 */
const PROPORCION = 0.13

/** Margen desde el borde, también proporcional. */
const MARGEN = 0.045

/** Cuánto se ve. Bajo a propósito: tiene que leerse, no imponerse. */
const OPACIDAD = 0.38

/** Debajo de esto la marca sería un borrón ilegible: no se pone. */
const ANCHO_MINIMO = 320

let cache: Buffer | null = null

async function cargarMarca(): Promise<Buffer> {
  if (cache) return cache
  cache = await readFile(join(process.cwd(), 'src/assets/marca-de-agua.png'))
  return cache
}

export async function conMarcaDeAgua(foto: Buffer): Promise<Buffer> {
  try {
    const { width, height } = await sharp(foto).metadata()
    if (!width || !height || width < ANCHO_MINIMO) return foto

    const anchoMarca = Math.round(width * PROPORCION)
    const margen = Math.round(width * MARGEN)

    const marca = await sharp(await cargarMarca())
      .resize({ width: anchoMarca })
      // La opacidad se aplica sobre el canal alfa que ya trae el PNG, así que
      // multiplica lo que había: las zonas transparentes siguen transparentes.
      .composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(255 * OPACIDAD)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer()

    return await sharp(foto)
      .composite([{ input: marca, top: margen, left: margen }])
      .toBuffer()
  } catch {
    // Mejor una foto sin marca que una pieza que no se puede publicar.
    return foto
  }
}
