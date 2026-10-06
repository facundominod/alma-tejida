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

// De https://abcdef.supabase.co se saca abcdef, que identifica al proyecto.
const ref = new URL(urlProyecto).hostname.split('.')[0]

/**
 * Por dónde se puede llegar a la base, en orden de preferencia.
 *
 * `db.<ref>.supabase.co` es la conexión directa, y en los proyectos nuevos del
 * plan gratuito **sólo resuelve por IPv6**. Muchas conexiones hogareñas no
 * tienen IPv6, y ahí no da un error claro: se queda esperando hasta que vence
 * el tiempo. Por eso no alcanza con elegir un host: hay que probarlos.
 *
 * El pooler va por IPv4 y funciona en cualquier lado. Se usa el modo *session*
 * (5432) y no el *transaction* (6543): el segundo no soporta bien las
 * sentencias que crean funciones, y buena parte de esta base son funciones.
 *
 * El usuario cambia según el camino: `postgres` en la directa,
 * `postgres.<ref>` en el pooler.
 */
const CAMINOS = [
  { nombre: 'conexión directa', usuario: 'postgres', host: `db.${ref}.supabase.co` },
  { nombre: 'pooler us-east-1', usuario: `postgres.${ref}`, host: 'aws-0-us-east-1.pooler.supabase.com' },
  { nombre: 'pooler sa-east-1', usuario: `postgres.${ref}`, host: 'aws-0-sa-east-1.pooler.supabase.com' },
  { nombre: 'pooler us-west-1', usuario: `postgres.${ref}`, host: 'aws-0-us-west-1.pooler.supabase.com' },
  { nombre: 'pooler eu-central-1', usuario: `postgres.${ref}`, host: 'aws-0-eu-central-1.pooler.supabase.com' },
]

console.log(`
  Proyecto   ${ref}

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
const claveEscapada = encodeURIComponent(clave)

console.log('')

let cadena = null

for (const camino of CAMINOS) {
  const intento = `postgresql://${camino.usuario}:${claveEscapada}@${camino.host}:5432/postgres`
  process.stdout.write(`  ${camino.nombre.padEnd(20)} `)

  const client = new pg.Client({
    connectionString: intento,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  })

  try {
    await client.connect()
    const { rows } = await client.query('select version() as v')
    await client.end()
    console.log(`✓  ${rows[0].v.split(' ').slice(0, 2).join(' ')}`)
    cadena = intento
    break
  } catch (error) {
    const motivo = String(error.message)

    // Una contraseña equivocada no se arregla probando otro host: el servidor
    // contestó, y contestó que no. Se corta acá para no hacerle esperar cuatro
    // tiempos de espera a alguien que sólo copió mal la clave.
    if (/password authentication failed/i.test(motivo)) {
      console.log('✗  la contraseña no es la correcta')
      console.error('\n  Esa no es la contraseña de la base.')
      console.error('  Generá una nueva en Settings → Database → Reset database password')
      console.error('  y volvé a correr esto.\n')
      console.error(`  ${ARCHIVO} quedó como estaba.\n`)
      process.exit(1)
    }

    if (/timeout/i.test(motivo)) console.log('·  no responde (sin IPv6, probablemente)')
    else if (/ENOTFOUND/i.test(motivo)) console.log('·  no existe')
    else if (/Tenant or user not found/i.test(motivo)) console.log('·  otra región')
    else console.log(`·  ${motivo.split(intento).join('[CONEXION]')}`)
  }
}

if (!cadena) {
  console.error(`
  No se pudo llegar a la base por ningún camino.

  Si tu proyecto está en otra región, abrí
  Settings → Database → Connection string → URI → Session pooler
  y fijate qué host dice. Pasámelo y lo agrego.

  ${ARCHIVO} quedó como estaba.
`)
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
