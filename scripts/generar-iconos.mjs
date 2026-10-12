#!/usr/bin/env node
/**
 * Genera los iconos de la tienda a partir del logo.
 *
 *   npm run iconos
 *
 * POR QUE NO ALCANZA CON EL FAVICON
 * El favicon son 16 px y lo usa la pestaña del navegador. Cuando alguien hace
 * "Agregar a la pantalla de inicio" en un teléfono, Android y iPhone buscan
 * OTROS archivos, más grandes. Si no los encuentran, inventan uno: Android
 * recorta la captura de la página y iPhone pone una miniatura borrosa. La
 * tienda termina en el teléfono de una clienta con un ícono que no es la marca.
 *
 * EL FONDO NO ES DECORACIÓN
 * El logo tiene fondo transparente. En la pantalla de inicio de un iPhone, lo
 * transparente se rellena de NEGRO. Por eso cada ícono se compone sobre el
 * crudo de la casa.
 *
 * EL MARGEN TAMPOCO
 * Android recorta los íconos en círculo o en cuadrado redondeado según el
 * teléfono ("adaptive icons"), y se puede comer hasta un 20 % de cada borde.
 * El logo va al 72 % del lienzo para que ningún recorte le toque el sello.
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ORIGEN = 'src/assets/logo.png'
const DESTINO = 'src/app'

/** El crudo de la casa: --color-linen-50. */
const FONDO = { r: 0xfb, g: 0xf8, b: 0xf4, alpha: 1 }

/**
 * Cuánto del lienzo ocupa el logo.
 *
 * Al 72 % se veía perdido en el escritorio, donde el ícono se muestra entero y
 * sin recortar: quedaba un sello chiquito flotando en un cuadrado crema.
 *
 * Al 88 % llena el ícono y sigue dejando margen para el recorte en círculo de
 * Android, que se come hasta un 10 % de cada borde en los teléfonos que más
 * recortan. El logo además ya trae su propio aire dentro del archivo.
 */
const PROPORCION = 0.88

const ICONOS = [
  // iPhone, al agregar a la pantalla de inicio.
  { archivo: 'apple-icon.png', lado: 180 },
  // Android y la pestaña del navegador en pantallas grandes.
  { archivo: 'icon.png', lado: 512 },
]

mkdirSync(DESTINO, { recursive: true })

for (const { archivo, lado } of ICONOS) {
  const dentro = Math.round(lado * PROPORCION)

  const logo = await sharp(ORIGEN)
    .resize(dentro, dentro, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  await sharp({
    create: { width: lado, height: lado, channels: 4, background: FONDO },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(join(DESTINO, archivo))

  console.log(`  ✓ ${archivo}  ${lado}×${lado}`)
}

console.log('\n  Next los sirve solo: no hay que declararlos en ningún lado.\n')
