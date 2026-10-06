#!/usr/bin/env node
/**
 * Convierte en administrador a una cuenta ya registrada.
 *
 *   npm run admin -- tu@correo.com
 *
 * El punto 156 dice que el rol admin NO puede obtenerse desde el registro
 * público. Esto no lo contradice: para correrlo hace falta la cadena de
 * conexión de la base, que vive en `.env.local` y la tiene sólo quien es dueño
 * del proyecto. Desde el navegador no hay forma de llegar acá.
 *
 * La cuenta tiene que existir primero: la persona se registra en
 * /crear-cuenta con su correo y SU contraseña —que nadie más ve, ni siquiera
 * este script— y recién después se la promueve.
 */
import pg from 'pg'
import { config } from 'dotenv'

// `.env.local`, no `.env`: es el archivo que usa Next y el que esta en
// .gitignore. dotenv por defecto lee `.env`, que en este proyecto no existe.
config({ path: '.env.local' })

const correo = process.argv[2]?.trim().toLowerCase()

if (!correo || !correo.includes('@')) {
  console.error(`
Falta el correo.

  npm run admin -- tu@correo.com

Tiene que ser el correo de una cuenta YA registrada en la tienda
(/crear-cuenta). Este script no crea cuentas ni toca contraseñas.
`)
  process.exit(1)
}

const url = process.env.SUPABASE_DB_URL ?? process.env.TEST_DATABASE_URL

if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env.local. Ver scripts/aplicar-migraciones.mjs.')
  process.exit(1)
}

const limpiar = (texto) => String(texto).split(url).join('[CONEXION]')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()

  const { rows: usuarios } = await client.query(
    'select id, email_confirmed_at from auth.users where lower(email) = $1',
    [correo],
  )

  if (usuarios.length === 0) {
    console.error(`\nNo hay ninguna cuenta con ${correo}.`)
    console.error('Registrate primero en /crear-cuenta y volvé a correr esto.\n')
    process.exit(1)
  }

  const usuario = usuarios[0]

  // Avisar, no bloquear: Supabase permite entrar sin confirmar si el proyecto
  // tiene la confirmación desactivada, y en ese caso esto funciona igual.
  if (!usuario.email_confirmed_at) {
    console.warn(`\n⚠  ${correo} todavía no confirmó el correo.`)
    console.warn('   Si tu proyecto exige confirmación, no vas a poder entrar hasta hacerlo.\n')
  }

  const { rows, rowCount } = await client.query(
    `update public.profiles
        set role = 'admin'
      where id = $1
      returning id, role`,
    [usuario.id],
  )

  if (rowCount === 0) {
    // El perfil lo crea un trigger al registrarse. Si no está, algo falló en
    // la migración 0010 y conviene saberlo ahora y no cuando falte un dato.
    console.error('\nLa cuenta existe pero no tiene perfil en public.profiles.')
    console.error('Eso lo crea un trigger al registrarse: revisá que 0010_triggers.sql se haya aplicado.\n')
    process.exit(1)
  }

  console.log(`\n✓ ${correo} ya es administrador.`)
  console.log('  Recargá la página y /admin te deja entrar.\n')

  const { rows: admins } = await client.query(
    `select u.email
       from public.profiles p
       join auth.users u on u.id = p.id
      where p.role = 'admin'
      order by u.email`,
  )
  console.log(`  Administradores (${admins.length}): ${admins.map((a) => a.email).join(', ')}\n`)

  void rows
} catch (error) {
  console.error(limpiar(error.message))
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
