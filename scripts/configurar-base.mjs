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
import dns from 'node:dns/promises'
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
/**
 * Escribe UNA variable en .env.local sin pisar el resto.
 *
 * Relee el archivo justo antes de escribir, a propósito. Este script se queda
 * esperando que alguien pegue algo, y esa espera puede durar minutos: si en el
 * medio el archivo cambia —otra terminal, un editor abierto, alguien ayudando
 * desde el otro lado— guardar la copia leída al arrancar borra ese cambio sin
 * avisar.
 *
 * Pasó: mientras este script esperaba una contraseña, se agregó la anon key
 * desde afuera, y al terminar la dejó en blanco.
 */
function guardarVariable(nombre, valor) {
  const actual = readFileSync(ARCHIVO, 'utf8')
  const lineas = actual.split('\n')
  const i = lineas.findIndex((l) => l.startsWith(`${nombre}=`))
  if (i === -1) lineas.push(`${nombre}=${valor}`)
  else lineas[i] = `${nombre}=${valor}`
  writeFileSync(ARCHIVO, lineas.join('\n'), 'utf8')
}

/** Lo mismo pero mostrando lo que se escribe: un host no es un secreto. */
function preguntar(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    let respondido = false
    const terminar = (valor) => {
      if (respondido) return
      respondido = true
      rl.close()
      resolve(valor)
    }
    rl.question(texto, terminar)
    rl.on('close', () => terminar(''))
  })
}

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
const REGIONES = ['sa-east-1', 'us-east-1', 'us-west-1', 'eu-central-1', 'ap-southeast-1']

// Supabase usa dos prefijos según cuándo se creó el proyecto: los viejos están
// en `aws-0-`, los nuevos en `aws-1-`. No hay forma de saberlo desde afuera,
// así que se prueban los dos. Los que no existen se descartan por DNS en un
// instante, sin esperar a que venza ningún tiempo de espera.
const CAMINOS = [
  { nombre: 'conexión directa', usuario: 'postgres', host: `db.${ref}.supabase.co` },
  ...REGIONES.flatMap((region) =>
    ['aws-0', 'aws-1'].map((prefijo) => ({
      nombre: `pooler ${prefijo}-${region}`,
      usuario: `postgres.${ref}`,
      host: `${prefijo}-${region}.pooler.supabase.com`,
    })),
  ),
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
  // Si el nombre no existe, no vale la pena abrir una conexión y esperar doce
  // segundos: con once candidatos eso serían más de dos minutos mirando una
  // pantalla quieta.
  try {
    await dns.lookup(camino.host)
  } catch {
    continue
  }

  const intento = `postgresql://${camino.usuario}:${claveEscapada}@${camino.host}:5432/postgres`
  process.stdout.write(`  ${camino.nombre.padEnd(22)} `)

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

    // El orden importa: cuando el pooler no conoce el proyecto contesta
    // "(ENOTFOUND) tenant/user ...", que lleva adentro la palabra ENOTFOUND
    // sin ser un problema de DNS. Mirar el nombre del host primero diría "no
    // existe" sobre un host que existe perfectamente.
    if (/timeout/i.test(motivo)) console.log('·  no responde (sin IPv6, probablemente)')
    else if (/tenant/i.test(motivo)) console.log('·  otra región')
    else if (/ENOTFOUND|EAI_AGAIN/i.test(motivo)) console.log('·  no existe')
    else console.log(`·  ${motivo.split(intento).join('[CONEXION]')}`)
  }
}

// Ninguno de los candidatos sirvió. En vez de mandar a abrir un archivo, se
// pregunta el único dato que falta. Supabase lo muestra en:
// Settings → Database → Connection string → URI → Session pooler
if (!cadena) {
  console.log(`
  No adiviné por dónde se entra a tu base.

  Abrí en Supabase:  Settings → Database → Connection string
  Elegí la pestaña URI y el modo "Session pooler".

  Vas a ver algo así:

    postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
                                              ↑─────── esto ───────↑
`)

  const host = (await preguntar('  Pegá ese pedazo: ')).trim()

  if (!host) {
    console.error(`
  Sin eso no puedo seguir. ${ARCHIVO} quedó como estaba.
`)
    process.exit(1)
  }

  // Por las dudas peguen la cadena entera: se le saca el host.
  const limpio = host.includes('@') ? host.split('@').pop().split(':')[0] : host.split(':')[0]
  // El pooler usa `postgres.<ref>` como usuario; la conexión directa, `postgres`.
  const usuario = limpio.startsWith('db.') ? 'postgres' : `postgres.${ref}`
  const intento = `postgresql://${usuario}:${claveEscapada}@${limpio}:5432/postgres`

  process.stdout.write(`
  ${limpio} ... `)
  const client = new pg.Client({
    connectionString: intento,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })
  try {
    await client.connect()
    await client.query('select 1')
    await client.end()
    console.log('✓ entra.')
    cadena = intento
  } catch (error) {
    console.log('✗ no entra.')
    console.error(`
  ${String(error.message).split(intento).join('[CONEXION]')}
`)
    console.error(`  ${ARCHIVO} quedó como estaba.
`)
    process.exit(1)
  }
}

// Recién ahora se escribe, con la conexión ya comprobada.
guardarVariable('SUPABASE_DB_URL', cadena)
console.log(`  Guardado en ${ARCHIVO}.\n`)

console.log('  Creando la base...\n')

const migraciones = spawnSync(process.execPath, ['scripts/aplicar-migraciones.mjs'], {
  stdio: 'inherit',
})

process.exit(migraciones.status ?? 1)
