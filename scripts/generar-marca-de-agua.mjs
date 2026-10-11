#!/usr/bin/env node
/**
 * Dibuja la marca de agua UNA vez y la deja guardada como imagen.
 *
 *   npm run marca
 *
 * Por qué pre-generada y no dibujada al vuelo: la marca lleva texto, y el
 * texto necesita fuentes. En esta máquina están; en la función de Netlify que
 * procesa las fotos puede que no, y eso se descubriría recién cuando alguien
 * suba una foto y le salga sin letras. Generándola acá y versionando el PNG,
 * en producción sólo hay que superponer una imagen sobre otra, que es una
 * operación sin dependencias.
 *
 * Se regenera a mano si cambia la marca. No corre en el build.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const SALIDA = 'src/assets/marca-de-agua.png'

/** Generosa: después se achica a lo que haga falta, nunca se agranda. */
const ANCHO = 900
const ALTO = 300

/**
 * Blanca con una sombra oscura detrás.
 *
 * Una marca blanca sola desaparece sobre una manta cruda; una oscura sola
 * desaparece sobre una pieza negra. La sombra difusa debajo le da borde contra
 * los fondos claros sin ensuciar los oscuros, así se lee sobre cualquier
 * fotografía sin tener que decidir por foto.
 */
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  <defs>
    <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>

  <g filter="url(#sombra)" fill="none" stroke="#ffffff" stroke-width="4">
    <!-- El sello: corona de laurel y la puntada del medio -->
    <g transform="translate(20 30) scale(1.2)">
      <circle cx="100" cy="100" r="92"/>
      <circle cx="100" cy="100" r="84" stroke-width="2"/>
      <path d="M40 150 C 60 130, 70 110, 72 86" stroke-linecap="round"/>
      <path d="M160 150 C 140 130, 130 110, 128 86" stroke-linecap="round"/>
      ${[0, 1, 2, 3]
        .map((i) => {
          const izq = `<ellipse cx="${54 + i * 6}" cy="${138 - i * 15}" rx="9" ry="4" stroke-width="3" transform="rotate(${-38 + i * 4} ${54 + i * 6} ${138 - i * 15})"/>`
          const der = `<ellipse cx="${146 - i * 6}" cy="${138 - i * 15}" rx="9" ry="4" stroke-width="3" transform="rotate(${38 - i * 4} ${146 - i * 6} ${138 - i * 15})"/>`
          return izq + der
        })
        .join('')}
      <path d="M76 100 C 86 88, 96 112, 106 100 S 124 88, 130 100" stroke-linecap="round"/>
    </g>
  </g>

  <g filter="url(#sombra)" fill="#ffffff">
    <text x="300" y="150" font-family="Georgia, 'Times New Roman', serif"
          font-size="112" letter-spacing="-2">alma</text>
    <text x="306" y="216" font-family="Helvetica, Arial, sans-serif"
          font-size="46" font-weight="600" letter-spacing="26">TEJIDA</text>
  </g>
</svg>
`

mkdirSync('src/assets', { recursive: true })

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()

// Si el canal alfa quedo todo en cero, el texto no se dibujo: mejor fallar acá
// que subir fotos con una marca invisible durante una semana.
const { channels } = await sharp(png).stats()
if (!channels[3] || channels[3].max === 0) {
  console.error('\n  La marca salio vacia: no hay fuentes para dibujar el texto.\n')
  process.exit(1)
}

writeFileSync(SALIDA, png)

const { width, height } = await sharp(png).metadata()
console.log(`
  ✓ ${SALIDA}
    ${width} × ${height} px · ${Math.round(png.length / 1024)} KB

    Se versiona a proposito: en produccion solo se superpone, no se dibuja.
`)
