#!/usr/bin/env node
/**
 * Pone una contraseña nueva en una cuenta.
 *
 *   npm run clave -- silvana
 *   npm run clave -- alguien@correo.com
 *
 * Es el repuesto de "olvidé mi contraseña" para las cuentas que se crearon
 * sin correo. Sin correo no hay a dónde mandar un enlace de recuperación, así
 * que la única salida es que alguien con acceso a la base la cambie. Este
 * script es ese alguien, y pide la clave en la terminal para que no quede
 * escrita en el historial de comandos ni pase por ningún chat.
 *
 * Quien lo corre necesita SUPABASE_SERVICE_ROLE_KEY y SUPABASE_DB_URL, o sea
 * la dueña de la tienda. Desde el navegador no hay forma de llegar acá.
 */
import readline from 'node:readline'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const quien = process.argv[2]?.trim()

if (!quien) {
  console.error(`
  Falta a quién.

      npm run clave -- silvana
      npm run clave -- alguien@correo.com
`)
  process.exit(1)
}

const urlDb = process.env.SUPABASE_DB_URL
const urlProyecto = process.env.NEXT_PUBLIC_SUPABASE_URL
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!urlDb || !urlProyecto || !claveServicio) {
  console.error('\n  Faltan datos en .env.local. Corré antes: npm run db:configurar\n')
  process.exit(1)
}

if (!process.stdin.isTTY) {
  console.error('\n  Esto hay que correrlo en una terminal donde puedas escribir.\n')
  process.exit(1)
}

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    process.stdout.write(texto)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
    rl._writeToOutput = () => {}
    let listo = false
    const terminar = (valor) => {
      if (listo) return
      listo = true
      rl.close()
      process.stdout.write('\n')
      resolve(valor)
    }
    rl.question('', terminar)
    rl.on('close', () => terminar(''))
  })
}

/* --- Encontrar la cuenta ------------------------------------------------- */

const db = new pg.Client({ connectionString: urlDb, ssl: { rejectUnauthorized: false } })
await db.connect()

const { rows } = await db.query(
  `select p.id, p.username, p.email, p.full_name, p.role
     from public.profiles p
    where lower(p.username) = lower($1) or lower(p.email) = lower($1)
    limit 1`,
  [quien],
)

await db.end()

if (rows.length === 0) {
  console.error(`\n  No hay ninguna cuenta con "${quien}".\n`)
  process.exit(1)
}

const cuenta = rows[0]
// Un correo inventado no se muestra como si fuera un correo: confundiria.
const correoVisible = cuenta.email?.endsWith('.invalid') ? '(sin correo)' : cuenta.email

console.log(`
  Cuenta     ${cuenta.username ?? '(sin usuario)'}
  Nombre     ${cuenta.full_name ?? '(sin nombre)'}
  Correo     ${correoVisible ?? '(sin correo)'}
  Rol        ${cuenta.role}

  Escribí la contraseña nueva. Al menos 8 caracteres.
  No se va a ver mientras la escribís.
`)

const nueva = await preguntarOculto('  Contraseña nueva: ')

if (nueva.length < 8) {
  console.error('\n  Al menos 8 caracteres. No se cambió nada.\n')
  process.exit(1)
}

const repetida = await preguntarOculto('  Otra vez, para confirmar: ')

if (nueva !== repetida) {
  // Vale la pena pedirla dos veces: no se ve al escribirla, y una cuenta sin
  // correo con una contraseña mal tipeada no la recupera nadie.
  console.error('\n  No son iguales. No se cambió nada.\n')
  process.exit(1)
}

/* --- Cambiarla ----------------------------------------------------------- */

const supabase = createClient(urlProyecto, claveServicio, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error } = await supabase.auth.admin.updateUserById(cuenta.id, { password: nueva })

if (error) {
  console.error(`\n  No se pudo: ${error.message}\n`)
  process.exit(1)
}

console.log(`
  ✓ Listo. ${cuenta.username ?? quien} ya puede entrar con la contraseña nueva.
`)
