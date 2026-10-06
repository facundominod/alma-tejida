#!/usr/bin/env node
/**
 * Revisa que la base esté como tiene que estar.
 *
 *   npm run db:revisar
 *
 * No alcanza con que las migraciones no hayan dado error: hay cosas que se
 * aplican sin protestar y dejan la tienda abierta igual. Una tabla sin RLS,
 * una tabla con RLS pero sin una sola política, un bucket que quedó público.
 * Esto las busca a propósito.
 *
 * Es para correr después de instalar, y de nuevo antes de abrir la tienda al
 * público.
 */
import pg from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.SUPABASE_DB_URL

if (!url) {
  console.error('\nFalta SUPABASE_DB_URL. Corré primero: npm run db:configurar\n')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

const problemas = []

const q = async (sql) => (await client.query(sql)).rows

/* --- Lo que tiene que existir ------------------------------------------- */

const [{ tablas, con_rls }] = await q(`
  select count(*)::int as tablas,
         count(*) filter (where rowsecurity)::int as con_rls
    from pg_tables where schemaname = 'public'
`)

const [{ politicas_public, politicas_storage }] = await q(`
  select count(*) filter (where schemaname = 'public')::int  as politicas_public,
         count(*) filter (where schemaname = 'storage')::int as politicas_storage
    from pg_policies
`)

const [{ funciones }] = await q(`
  select count(*)::int as funciones
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
`)

const buckets = await q('select id, public from storage.buckets order by id')

console.log(`
  Tablas en public        ${tablas}
  Con RLS activo          ${con_rls}
  Políticas en public     ${politicas_public}
  Políticas en storage    ${politicas_storage}
  Funciones               ${funciones}
  Buckets                 ${buckets.map((b) => `${b.id}${b.public ? ' (público)' : ' (privado)'}`).join(', ')}
`)

/* --- Lo que NO tiene que pasar ------------------------------------------ */

const sinRls = await q(`
  select tablename from pg_tables
   where schemaname = 'public' and not rowsecurity
   order by tablename
`)
if (sinRls.length) {
  problemas.push(
    `Tablas sin RLS: ${sinRls.map((r) => r.tablename).join(', ')}.\n` +
      '   Cualquiera con la anon key las lee enteras, y la anon key es pública.',
  )
}

// Una tabla con RLS y sin políticas no es un agujero —no deja entrar a nadie—
// pero sí es una funcionalidad muerta: lo más probable es que falte una
// política que alguien se olvidó de escribir. Las que son así a propósito se
// listan acá para que el aviso signifique algo.
const CERRADAS_A_PROPOSITO = [
  '_migraciones',
  'analytics_events',
  'rate_limit_hits',
  // Sólo la lee `username_disponible()`, que es SECURITY DEFINER. Exponerla
  // sería publicar la lista de nombres que la tienda se reserva.
  'reserved_usernames',
]
const sinPoliticas = await q(`
  select t.tablename
    from pg_tables t
   where t.schemaname = 'public'
     and t.rowsecurity
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename
     )
   order by t.tablename
`)
const inesperadas = sinPoliticas
  .map((r) => r.tablename)
  .filter((t) => !CERRADAS_A_PROPOSITO.includes(t))
if (inesperadas.length) {
  problemas.push(
    `Tablas con RLS pero sin ninguna política: ${inesperadas.join(', ')}.\n` +
      '   Nadie puede leerlas ni escribirlas desde la aplicación. ¿Falta una política?',
  )
}

const publicos = buckets.filter((b) => b.public).map((b) => b.id)
// `catalog` y `brand` son públicos a propósito: son las fotos que queremos que
// Google indexe y que WhatsApp muestre al compartir un producto. `receipts`
// guarda comprobantes de transferencia y nunca puede serlo.
const ESPERADOS_PUBLICOS = ['catalog', 'brand']
const dePlus = publicos.filter((b) => !ESPERADOS_PUBLICOS.includes(b))
if (dePlus.length) {
  problemas.push(
    `Buckets públicos que no deberían serlo: ${dePlus.join(', ')}.\n` +
      '   Cualquiera con el enlace ve esos archivos sin iniciar sesión.',
  )
}

const admins = await q(`
  select count(*)::int as n from public.profiles where role = 'admin'
`)

/* --- Resultado ----------------------------------------------------------- */

if (problemas.length) {
  console.log('─'.repeat(60))
  for (const p of problemas) console.error(`\n  ⚠  ${p}`)
  console.log('')
  await client.end()
  process.exit(1)
}

console.log('  ✓ Sin agujeros: todas las tablas con RLS, ningún bucket de más.\n')

if (admins[0].n === 0) {
  console.log(`  Todavía no hay ningún administrador.
  Registrate en /crear-cuenta y después corré:

      npm run admin -- tu@correo.com
`)
}

await client.end()
