#!/usr/bin/env node
/**
 * Carga la reseña de entrada de cada categoría.
 *
 *   node scripts/cargar-resenas.mjs
 *
 * Es el texto que se lee al entrar a /categoria/<slug>, arriba de las piezas.
 * Son datos, no código: de acá en adelante manda la base, y Silvana las edita
 * desde /admin/categorias. Este script sólo las pone la primera vez.
 *
 * NO PISA lo que ya esté escrito. Si una categoría ya tiene reseña, se la
 * saltea y lo dice: volver a correr esto después de que alguien la editó a mano
 * no puede borrar ese trabajo.
 */
import pg from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const RESENAS = {
  respaldos:
    'Hilo kraft y algodón anudados a mano sobre un bastidor de madera de 4 × 3,5 o 6 × 4 cm, que es lo que mantiene la pieza derecha y firme contra la pared. El alto es de 1,20 m y el ancho se hace a medida, de 0,80 a 2,00 m: el respaldo entra justo en tu cama y no al revés. Antes de elegir, quedate un rato con los tres dibujos. Líneas cae recto y liviano, Cuadrillé arma una grilla pareja, y Nido encadena rombos que juntan sombra y van cambiando con la luz del día.',
  espejos:
    'Un espejo devuelve la luz que ya tenés en casa; el marco decide con qué textura te la devuelve. Estos se arman nudo a nudo en hilo kraft, rústico y con carácter, o en kraft con yute, que le agrega una fibra más orgánica, de campo. El diámetro, el largo de los flecos y la caída los definimos antes de empezar, porque cada espejo se hace para una pared en particular. Acercate al borde y mirá: no hay dos nudos ajustados igual, y por eso ninguno sale dos veces idéntico.',
  tapices:
    'Hay paredes que no piden un cuadro, piden algo que se pueda tocar. Los tapices de pared se encordan en hilo kraft, algodón, yute y polipropileno —este último liviano y tranquilo con la humedad, así que anda bien en una galería o un baño—, combinados según el relieve que busque cada pieza. Los hacemos del alto y el ancho que necesites, y conviene quedarse mirando: el nudo levanta la trama unos milímetros, y esa sombra propia se va corriendo sola de la mañana a la tarde.',
}

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('\nFalta SUPABASE_DB_URL en .env.local.\n')
  process.exit(1)
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

try {
  for (const [slug, resena] of Object.entries(RESENAS)) {
    const actual = await db.query(
      `select id, name, intro from public.categories
        where slug = $1 and deleted_at is null`,
      [slug],
    )

    if (actual.rows.length === 0) {
      console.log(`  ·  "${slug}" no existe todavía. Se saltea.`)
      continue
    }

    const fila = actual.rows[0]

    if (fila.intro && fila.intro.trim()) {
      console.log(`  ·  ${fila.name} ya tiene reseña. No se toca.`)
      continue
    }

    await db.query(`update public.categories set intro = $2 where id = $1`, [
      fila.id,
      resena,
    ])
    console.log(`  ✓  ${fila.name}`)
  }

  console.log('\n  Se editan en /admin/categorias.\n')
} finally {
  await db.end()
}
