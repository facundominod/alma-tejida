#!/usr/bin/env node
/**
 * Guarda la clave `service_role` en .env.local.
 *
 *   npm run db:clave
 *
 * Es la última pieza que falta: sin ella la tienda se ve y se navega, pero no
 * se pueden subir fotos ni entrar pedidos. Esas dos operaciones necesitan
 * saltear RLS del lado del servidor, y para eso está esta clave.
 *
 * Se escribe acá, en la terminal y sin eco, por lo mismo que la contraseña de
 * la base: para que no haya que encontrar un archivo que empieza con punto ni
 * pegarla en ningún otro lado.
 *
 * Antes de guardarla comprueba QUÉ es. Una clave de Supabase es un JWT y dice
 * adentro su rol y su proyecto, así que los dos errores que de otro modo
 * pasarían en silencio se detectan acá:
 *
 *   - pegar la `anon` en lugar de la `service_role`: la tienda compilaría y
 *     recién fallaría al subir la primera foto, con un error de permisos que
 *     no menciona la causa;
 *   - pegar la clave de OTRO proyecto de Supabase.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import readline from 'node:readline'

const ARCHIVO = '.env.local'

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    process.stdout.write(texto)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
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
    rl.on('close', () => terminar(''))
  })
}

if (!process.stdin.isTTY) {
  console.error('\n  Esto hay que correrlo en una terminal donde puedas escribir.\n')
  process.exit(1)
}

const env = readFileSync(ARCHIVO, 'utf8')
const urlProyecto = env
  .split('\n')
  .find((l) => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='))
  ?.slice('NEXT_PUBLIC_SUPABASE_URL='.length)
  .trim()

const ref = urlProyecto ? new URL(urlProyecto).hostname.split('.')[0] : null

console.log(`
  Proyecto   ${ref ?? '(desconocido)'}

  Pegá la clave service_role. Está en:
  Settings → API Keys → service_role   (si ves claves nuevas tipo
  sb_publishable_, buscá la pestaña "Legacy API keys")

  Es la que está marcada como SECRETA. No la anon.

  No se va a ver mientras la pegás.
`)

const clave = (await preguntarOculto('  service_role: ')).trim()

if (!clave) {
  console.error('\n  No pegaste nada. Nada fue modificado.\n')
  process.exit(1)
}

/* --- Comprobar qué es antes de guardarla -------------------------------- */

function cuerpoDelJwt(token) {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    let b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

const datos = cuerpoDelJwt(clave)

if (!datos) {
  console.error(`
  Eso no parece una clave de Supabase.

  Tiene que ser una cadena larga con dos puntos adentro, que empieza con
  "eyJ". Si en tu panel sólo ves claves que empiezan con "sb_secret_",
  avisame y lo adapto.
`)
  process.exit(1)
}

if (datos.role !== 'service_role') {
  console.error(`
  Esa clave dice ser "${datos.role ?? 'de rol desconocido'}", no service_role.

  ${datos.role === 'anon' ? 'Pegaste la anon. Esa ya está configurada; hace falta la otra.' : ''}
  Buscá la que figura como secreta en Settings → API Keys.
`)
  process.exit(1)
}

if (ref && datos.ref !== ref) {
  console.error(`
  Esa clave es del proyecto "${datos.ref}", y esta instalación apunta a
  "${ref}". Son dos proyectos distintos de Supabase.
`)
  process.exit(1)
}

/* --- Guardar ------------------------------------------------------------ */

const lineas = env.split('\n')
const i = lineas.findIndex((l) => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='))
if (i === -1) lineas.push(`SUPABASE_SERVICE_ROLE_KEY=${clave}`)
else lineas[i] = `SUPABASE_SERVICE_ROLE_KEY=${clave}`

writeFileSync(ARCHIVO, lineas.join('\n'), 'utf8')

console.log(`
  ✓ Guardada. Es del proyecto ${datos.ref} y tiene rol service_role.

  Ya se pueden subir fotos y recibir pedidos.

  Acordate: esta clave saltea toda la seguridad de la base. Vive sólo en
  ${ARCHIVO} —que está en .gitignore— y en las variables del hosting.
`)
