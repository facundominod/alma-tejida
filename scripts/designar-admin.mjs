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

const quien = process.argv[2]?.trim().toLowerCase()

/**
 * Confirma el correo además de dar el rol.
 *
 * Existe porque Supabase no deja entrar a una cuenta sin confirmar, y ese
 * correo se pierde más seguido de lo que uno quisiera: cae en spam, la
 * dirección tiene un error de tipeo, o la casilla ya no existe. Para la dueña
 * de la tienda eso significa quedarse afuera de su propio panel.
 *
 * No es automático a propósito: confirmar una cuenta es afirmar "este correo
 * es de esta persona", y eso no se hace de paso. Hay que pedirlo, y sólo
 * puede pedirlo quien tiene la clave de la base.
 */
const confirmar = process.argv.includes('--confirmar')

if (!quien || quien.startsWith('--')) {
  console.error(`
Falta a quién.

  npm run admin -- silvana
  npm run admin -- tu@correo.com

Y si la cuenta nunca confirmó el correo —Supabase no la deja entrar—:

  npm run admin -- silvana --confirmar

Tiene que ser una cuenta YA registrada en /crear-cuenta. Este script no crea
cuentas ni toca contraseñas.
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

  // Por nombre de usuario o por correo: quien entra con un nombre no tiene por
  // qué acordarse de con qué dirección se registró.
  const { rows: usuarios } = await client.query(
    `select u.id, u.email, u.email_confirmed_at, p.username
       from auth.users u
       join public.profiles p on p.id = u.id
      where lower(p.username) = $1 or lower(u.email) = $1
      limit 1`,
    [quien],
  )

  if (usuarios.length === 0) {
    console.error(`\nNo hay ninguna cuenta con "${quien}".`)
    console.error('Registrate primero en /crear-cuenta y volvé a correr esto.\n')
    process.exit(1)
  }

  const usuario = usuarios[0]

  if (!usuario.email_confirmed_at) {
    if (confirmar) {
      await client.query(
        'update auth.users set email_confirmed_at = now() where id = $1 and email_confirmed_at is null',
        [usuario.id],
      )
      console.log(`\n✓ Correo confirmado a mano (${usuario.email}).`)
    } else {
      console.warn('\n⚠  Esta cuenta NUNCA confirmó el correo, y Supabase no la deja entrar.')
      console.warn('   El rol de administrador no alcanza: el login rebota antes de mirarlo.')
      console.warn('')
      console.warn(`   O buscás el mail de confirmación en ${usuario.email},`)
      console.warn('   o lo confirmás desde acá:')
      console.warn('')
      console.warn(`       npm run admin -- ${quien} --confirmar`)
      console.warn('')
    }
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

  console.log(`\n✓ ${usuario.username ?? usuario.email} ya es administrador.`)
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
