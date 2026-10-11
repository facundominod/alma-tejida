#!/usr/bin/env node
/**
 * Recorta el logo del fondo negro y lo deja con fondo transparente.
 *
 *   npm run logo -- ruta/al/logo.jpg
 *
 * El archivo original es el sello en cobre sobre negro. Un fondo negro
 * recortado "a ojo" con un umbral deja los bordes dentados y un halo oscuro
 * alrededor de cada trazo, que sobre el fondo claro de la tienda se ve sucio.
 *
 * Lo que se hace en cambio: el BRILLO de cada píxel se convierte en su
 * opacidad. Donde el original es negro, queda transparente; donde está el
 * trazo cobre, queda opaco; y los píxeles intermedios —el antialias del
 * original y el ruido del JPEG— quedan semitransparentes, que es exactamente
 * lo que necesita un borde suave.
 *
 * El color se fija al cobre de la marca en lugar de conservar el del archivo:
 * el JPEG ensucia el tono en los bordes, y acá el color es uno solo.
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'

const origen = process.argv[2]
if (!origen) {
  console.error('\n  Falta el archivo.\n\n      npm run logo -- ruta/al/logo.jpg\n')
  process.exit(1)
}

const SALIDA_LOGO = 'src/assets/logo.png'
const SALIDA_MARCA = 'src/assets/marca-de-agua.png'

/** El cobre de la marca. Es `--color-clay-600` de la paleta. */
const COBRE = { r: 0x9c, g: 0x63, b: 0x50 }

/**
 * Debajo de este brillo se considera fondo.
 *
 * El negro del original no es negro puro —el JPEG lo deja en 8 o 10— así que
 * un umbral en cero dejaría un velo gris en todo el cuadro.
 */
const PISO = 24

/** Arriba de este brillo el trazo es pleno. */
const TECHO = 110

const entrada = sharp(origen).ensureAlpha()
const { width, height } = await entrada.metadata()
if (!width || !height) {
  console.error('\n  No se pudo leer la imagen.\n')
  process.exit(1)
}

const { data } = await entrada.raw().toBuffer({ resolveWithObject: true })

const salida = Buffer.alloc(width * height * 4)
let opacos = 0

for (let i = 0; i < width * height; i += 1) {
  const r = data[i * 4]
  const g = data[i * 4 + 1]
  const b = data[i * 4 + 2]

  // Luminancia percibida: el ojo ve el verde mucho mas que el azul.
  const brillo = 0.2126 * r + 0.7152 * g + 0.0722 * b

  let alfa = (brillo - PISO) / (TECHO - PISO)
  alfa = Math.max(0, Math.min(1, alfa))
  if (alfa > 0.5) opacos += 1

  salida[i * 4] = COBRE.r
  salida[i * 4 + 1] = COBRE.g
  salida[i * 4 + 2] = COBRE.b
  salida[i * 4 + 3] = Math.round(alfa * 255)
}

if (opacos < width * height * 0.01) {
  console.error('\n  Quedo casi todo transparente: el original no parece ser claro sobre oscuro.\n')
  process.exit(1)
}

const png = await sharp(salida, { raw: { width, height, channels: 4 } })
  // `trim` recorta el marco transparente que quede alrededor del sello.
  .trim({ threshold: 1 })
  .png({ compressionLevel: 9 })
  .toBuffer()

writeFileSync(SALIDA_LOGO, png)

const meta = await sharp(png).metadata()

/* --- La marca de agua sale del mismo archivo ----------------------------- */

// En blanco y con sombra: sobre una foto, el cobre se pierde contra la lana.
const marca = await sharp(png)
  .resize({ width: 600 })
  .composite([
    {
      input: Buffer.from([255, 255, 255, 255]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'in',
    },
  ])
  .png({ compressionLevel: 9 })
  .toBuffer()

writeFileSync(SALIDA_MARCA, marca)
const metaMarca = await sharp(marca).metadata()

console.log(`
  ✓ ${SALIDA_LOGO}
    ${meta.width} × ${meta.height} px · ${Math.round(png.length / 1024)} KB · fondo transparente

  ✓ ${SALIDA_MARCA}
    ${metaMarca.width} × ${metaMarca.height} px · ${Math.round(marca.length / 1024)} KB · en blanco

    Los dos se versionan: en produccion solo se superponen, no se dibujan.
`)
