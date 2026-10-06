#!/usr/bin/env node
/**
 * Mide el JavaScript que un navegador descarga de verdad en cada página.
 *
 * No lee el reporte del build: pide la página al servidor de producción, junta
 * todos los <script src> y suma su tamaño COMPRIMIDO, que es lo que viaja por
 * la red. Es el número que importa en un celular con señal mediocre.
 *
 *   npm run build && npm run start
 *   node scripts/medir-bundle.mjs
 *
 * Los topes salen de docs/05-DESIGN-SYSTEM.md y NO son un deseo: son la
 * medición real más un margen chico. El piso del stack elegido (React DOM +
 * router de Next + runtime de Server Actions) ya son ~151 KB comprimidos, así
 * que pedir menos que eso sería pedir otro framework, no otro código.
 *
 * Si se pasa, el script falla: sirve para detectar que una dependencia nueva
 * se coló en el bundle del cliente, que es lo único que podemos controlar.
 */
import { gzipSync } from 'node:zlib'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

// Tope por página, en KB comprimidos: la medición más ~5%. Lo justo para que
// un cambio de versión de Next no rompa el build, y poco para que una
// librería nueva sí lo rompa.
//
// Medido 2026-10-06 sobre el build de WEBPACK, que es el que se despliega
// (ver netlify.toml). Turbopack daba unos 14 KB menos en algunas páginas,
// pero ese paquete no llega a nadie: medirlo sería medir algo que no existe
// en producción.
const PRESUPUESTO = {
  '/': 231,         // medido 219,7
  '/tienda': 209,   // medido 198,8
  '/contacto': 231, // medido 219,7
  '/carrito': 236,  // medido 224,0
}

async function medir(ruta) {
  const html = await fetch(BASE + ruta).then((r) => r.text())

  // Los scripts que el navegador va a pedir
  const fuentes = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(([, src]) => src)
  const unicos = [...new Set(fuentes)]

  let total = 0
  const piezas = []

  for (const src of unicos) {
    const url = src.startsWith('http') ? src : BASE + src
    const buffer = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()))
    const comprimido = gzipSync(buffer).length
    total += comprimido
    piezas.push({ src: src.split('/').pop(), kb: comprimido / 1024 })
  }

  // El HTML también viaja, y en una página con mucho contenido pesa
  const htmlComprimido = gzipSync(Buffer.from(html)).length

  return { total, htmlComprimido, piezas, archivos: unicos.length }
}

const resultados = []

for (const [ruta, presupuesto] of Object.entries(PRESUPUESTO)) {
  const { total, htmlComprimido, piezas, archivos } = await medir(ruta)
  const kb = total / 1024
  const ok = kb <= presupuesto

  resultados.push({ ruta, kb, presupuesto, ok })

  console.log(`\n${ruta}`)
  console.log(`  JavaScript  ${kb.toFixed(1)} KB comprimido en ${archivos} archivos`)
  console.log(`  HTML        ${(htmlComprimido / 1024).toFixed(1)} KB comprimido`)
  console.log(`  Presupuesto ${presupuesto} KB   ${ok ? '✓' : '✗ SE PASA'}`)

  const top = piezas.sort((a, b) => b.kb - a.kb).slice(0, 3)
  console.log('  Los más pesados:')
  for (const p of top) console.log(`    ${p.kb.toFixed(1).padStart(6)} KB  ${p.src}`)
}

console.log('\n' + '─'.repeat(52))
const excedidos = resultados.filter((r) => !r.ok)

if (excedidos.length > 0) {
  console.error('\n✗ Se pasaron del presupuesto:')
  for (const r of excedidos) {
    console.error(`  ${r.ruta}: ${r.kb.toFixed(1)} KB (tope ${r.presupuesto} KB)`)
  }
  process.exit(1)
}

console.log('✓ Todas las páginas dentro del presupuesto.\n')
