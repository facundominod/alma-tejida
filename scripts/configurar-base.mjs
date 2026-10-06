#!/usr/bin/env node
/**
 * Pide la contraseña de la base y deja la tienda conectada.
 *
 *   npm run db:configurar
 *
 * Existe porque el paso anterior era "abrí .env.local y pegá la cadena de
 * conexión", y `.env.local` empieza con punto: en Windows no aparece en la
 * carpeta, y la cadena de conexión hay que armarla a mano reemplazando un
 * tramo en el medio. Dos formas de equivocarse para una sola línea.
 *
 * Acá la contraseña se escribe una vez, en la terminal, sin eco. No viaja por
 * ningún chat, no queda en el historial de comandos y no se imprime nunca.
 *
 * Lo que hace, en orden:
 *   1. pregunta la contraseña
 *   2. arma la cadena de conexión y comprueba que entra
 *   3. la guarda en .env.local
 *   4. aplica las migraciones
 *
 * Si el paso 2 falla, no escribe nada: una contraseña mal copiada no deja el
 * archivo a medio configurar.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import readline from 'node:readline'
import pg from 'pg'

const ARCHIVO = '.env.local'

/** Lee sin mostrar lo que se escribe. */
function preguntarOculto(texto) {
  return new Promise((resolve) => {
    process.stdout.write(texto)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
    // Silencia el eco DESPUÉS de haber escrito la pregunta.
    rl._writeToOutput = () => {}

    let respondido = false
    const terminar = (valor) => {
      if (respondido) return
      respondido = true
      rl.close()
      process.stdout.write('\n')
      resolve(valor)
    }

    rl.question('', terminar)
    // Sin esto, si la entrada se cierra sin que nadie escriba, la promesa queda
    // colgada y Node muere con un error de await sin resolver, que no le
    // explica nada a quien lo está corriendo.
    rl.on('close', () => terminar(''))
  })
}

function leerVariable(contenido, nombre) {
  const linea = contenido.split('\n').find((l) => l.startsWith(`${nombre}=`))
  return linea?.slice(nombre.length + 1).trim() ?? ''
}

// Hace falta una terminal de verdad: la contraseña se escribe a mano y el eco
// se apaga sobre el TTY. Corrido sin terminal —desde una tarea automática, o
// desde un botón que no abre consola— no hay dónde escribirla.
if (!process.stdin.isTTY) {
  console.error(`
  Esto hay que correrlo en una terminal donde puedas escribir.

  Abrí la terminal, parate en la carpeta del proyecto y escribí:

      npm run db:configurar
`)
  process.exit(1)
}

const env = readFileSync(ARCHIVO, 'utf8')
const urlProyecto = leerVariable(env, 'NEXT_PUBLIC_SUPABASE_URL')

if (!urlProyecto) {
  console.error(`\nFalta NEXT_PUBLIC_SUPABASE_URL en ${ARCHIVO}.\n`)
  process.exit(1)
}

// De https://abcdef.supabase.co se saca abcdef, que es el nombre del host de
// la base: db.abcdef.supabase.co
const ref = new URL(urlProyecto).hostname.split('.')[0]
const host = `db.${ref}.supabase.co`

console.log(`
  Proyecto   ${ref}
  Base       ${host}

  Es la contraseña que generaste al crear el proyecto (la de "Database
  password"), NO la de tu cuenta de Supabase.

  Si la perdiste: Settings → Database → Reset database password.

  No se va a ver mientras la escribís. Pegala y apretá Enter.
`)

const clave = await preguntarOculto('  Contraseña de la base: ')

if (!clave) {
  console.error('\n  No escribiste nada. Nada fue modificado.\n')
  process.exit(1)
}

// La contraseña va DENTRO de una URL, así que hay que escaparla. Supabase
// genera claves alfanuméricas, pero si la cambiaste por una con @ / : ? #, sin
// escapar la cadena se parte en el lugar equivocado y el error que da no tiene
// nada que ver con la causa.
const cadena = `postgresql://postgres:${encodeURIComponent(clave)}@${host}:5432/postgres`

process.stdout.write('\n  Probando la conexión... ')

const client = new pg.Client({
  connectionString: cadena,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

try {
  await client.connect()
  const { rows } = await client.query('select current_database() as base, version() as v')
  await client.end()
  console.log('entra.')
  console.log(`  ${rows[0].base} · ${rows[0].v.split(' ').slice(0, 2).join(' ')}\n`)
} catch (error) {
  const motivo = String(error.message)
  console.log('no entra.\n')
  if (/password authentication failed/i.test(motivo)) {
    console.error('  La contraseña no es la correcta.')
    console.error('  Probá de nuevo, o generá una nueva en Settings → Database →')
    console.error('  Reset database password.\n')
  } else {
    console.error(`  ${motivo.split(cadena).join('[CONEXION]')}\n`)
  }
  console.error(`  ${ARCHIVO} quedó como estaba.\n`)
  process.exit(1)
}

// Recién ahora se escribe, con la conexión ya comprobada.
const lineas = env.split('\n')
const i = lineas.findIndex((l) => l.startsWith('SUPABASE_DB_URL='))
if (i === -1) {
  lineas.push(`SUPABASE_DB_URL=${cadena}`)
} else {
  lineas[i] = `SUPABASE_DB_URL=${cadena}`
}
writeFileSync(ARCHIVO, lineas.join('\n'), 'utf8')
console.log(`  Guardado en ${ARCHIVO}.\n`)

console.log('  Creando la base...\n')

const migraciones = spawnSync(process.execPath, ['scripts/aplicar-migraciones.mjs'], {
  stdio: 'inherit',
})

process.exit(migraciones.status ?? 1)
