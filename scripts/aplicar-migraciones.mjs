#!/usr/bin/env node
/**
 * Aplica las migraciones contra una base de Supabase de verdad.
 *
 * Existe para que poner la tienda en marcha no dependa de instalar el CLI de
 * Supabase, iniciar sesión y vincular el proyecto. Con la cadena de conexión
 * en `.env.local`, esto crea las 28 tablas, las políticas, las funciones y los
 * buckets de una sola corrida.
 *
 *   npm run db:aplicar
 *
 * Lleva su propio registro en `public._migraciones`: si se corre dos veces,
 * la segunda no hace nada. Eso permite agregar una migración nueva más
 * adelante y correrlo de vuelta sin pensar.
 *
 * Cada archivo va en su propia transacción. Si una falla, esa migración queda
 * entera sin aplicar —no a medias— y el proceso se detiene ahí.
 *
 * LA CONTRASEÑA NUNCA SE IMPRIME. La cadena de conexión la lleva adentro, así
 * que de la URL sólo se muestra el host, y los errores de `pg` se reescriben
 * antes de mostrarse: la librería los trae con la cadena completa.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { config } from 'dotenv'

// `.env.local`, no `.env`: es el archivo que usa Next y el que esta en
// .gitignore. dotenv por defecto lee `.env`, que en este proyecto no existe.
config({ path: '.env.local' })

const DIR = 'supabase/migrations'

const url = process.env.SUPABASE_DB_URL ?? process.env.TEST_DATABASE_URL

if (!url) {
  console.error(`
Falta SUPABASE_DB_URL en .env.local.

Dónde está: panel de Supabase → Project Settings → Database → Connection string
            → pestaña URI → modo "Session pooler"

  SUPABASE_DB_URL=postgresql://postgres.xxxx:TU-CLAVE@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

Usá el Session pooler (puerto 5432), no el Transaction pooler (6543): el
segundo no soporta bien las sentencias que crean funciones.

Esa línea queda sólo en .env.local, que está en .gitignore.
`)
  process.exit(1)
}

/** El host sirve para saber contra qué base se está corriendo. La clave, no. */
function hostDe(cadena) {
  try {
    return new URL(cadena).host
  } catch {
    return '(host ilegible)'
  }
}

/** `pg` mete la cadena de conexión entera en algunos errores. */
function limpiar(texto) {
  return String(texto).split(url).join('[CONEXION]')
}

const client = new pg.Client({
  connectionString: url,
  // Supabase exige TLS. El certificado es de una CA que Node no trae en su
  // almacén por defecto, y verificarlo bien requeriría distribuir el
  // certificado raíz junto al proyecto. Para una corrida manual de migraciones
  // desde la máquina del dueño, cifrar sin verificar la cadena es suficiente.
  ssl: { rejectUnauthorized: false },
  // Una migración grande puede tardar; mejor esperar que cortar a la mitad.
  statement_timeout: 120_000,
})

try {
  await client.connect()
} catch (error) {
  console.error(`No se pudo conectar a ${hostDe(url)}`)
  console.error(limpiar(error.message))
  process.exit(1)
}

console.log(`Conectado a ${hostDe(url)}\n`)

// El registro de migraciones vive en `public`, así que queda expuesto por la
// Data API como cualquier otra tabla. RLS activo y sin una sola política lo
// deja ilegible desde el navegador: sólo lo ve la conexión directa, que es
// quien corre esto. Saber qué migraciones tiene una base es información de
// adentro, no del catálogo.
await client.query(`
  create table if not exists public._migraciones (
    nombre      text primary key,
    aplicada_en timestamptz not null default now()
  );
  alter table public._migraciones enable row level security;
  revoke all on public._migraciones from anon, authenticated;
`)

const yaAplicadas = new Set(
  (await client.query('select nombre from public._migraciones')).rows.map((r) => r.nombre),
)

const archivos = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

let aplicadas = 0

for (const archivo of archivos) {
  if (yaAplicadas.has(archivo)) {
    console.log(`  ·  ${archivo}  (ya estaba)`)
    continue
  }

  const sql = readFileSync(join(DIR, archivo), 'utf8')
  const desde = Date.now()

  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('insert into public._migraciones (nombre) values ($1)', [archivo])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    console.error(`\n  ✗  ${archivo}\n`)
    console.error(limpiar(error.message))
    if (error.position) {
      // La posición es un offset en caracteres sobre el SQL enviado.
      const hasta = Number(error.position)
      const linea = sql.slice(0, hasta).split('\n').length
      console.error(`\n  en la línea ${linea} de ${archivo}`)
    }
    await client.end()
    process.exit(1)
  }

  console.log(`  ✓  ${archivo}  (${Date.now() - desde} ms)`)
  aplicadas++
}

// Comprobación de que quedó algo usable, no sólo de que no hubo error.
const { rows: resumen } = await client.query(`
  select
    (select count(*) from pg_tables where schemaname = 'public')                      as tablas,
    (select count(*) from pg_tables where schemaname = 'public' and rowsecurity)      as con_rls,
    (select count(*) from pg_policies where schemaname = 'public')                    as politicas,
    (select count(*) from storage.buckets)                                            as buckets
`)

const { tablas, con_rls, politicas, buckets } = resumen[0]

console.log(`
─────────────────────────────────────────────
  ${aplicadas === 0 ? 'Sin cambios: la base ya estaba al día.' : `${aplicadas} migraciones aplicadas.`}

  Tablas            ${tablas}
  Con RLS activo    ${con_rls}
  Políticas         ${politicas}
  Buckets           ${buckets}
`)

// Una tabla en `public` sin RLS es una tabla que cualquiera con la anon key
// puede leer entera. No se deja pasar en silencio. `_migraciones` es nuestra y
// no la toca nadie desde el navegador, pero igual va con RLS y sin políticas.
if (Number(con_rls) < Number(tablas)) {
  const { rows: sueltas } = await client.query(`
    select tablename from pg_tables
     where schemaname = 'public' and not rowsecurity
     order by tablename
  `)
  console.error(`⚠  Estas tablas quedaron SIN RLS: ${sueltas.map((r) => r.tablename).join(', ')}`)
  console.error('   Revisalo antes de poner la tienda en producción.\n')
  await client.end()
  process.exit(1)
}

console.log('✓ Base lista.\n')
await client.end()
