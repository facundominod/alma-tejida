/**
 * Banco de pruebas de base de datos para Alma Tejida.
 *
 * Levanta un PostgreSQL real (PGlite, el mismo motor compilado a WASM) en
 * memoria, reproduce el entorno de Supabase — esquemas `auth` y `storage`,
 * roles `anon`/`authenticated`/`service_role`, `auth.uid()` — y aplica las
 * migraciones del proyecto en orden.
 *
 * Por que no Docker: las pruebas de RLS, stock y concurrencia tienen que
 * correr en cada commit, tambien en CI. Sin contenedores arrancan en
 * milisegundos y no dependen de que haya un demonio instalado.
 */
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Lo que Supabase ya tiene puesto antes de que corra nuestra primera
 * migracion. Replicarlo con precision es lo que hace que estas pruebas
 * signifiquen algo.
 */
const SUPABASE_BOOTSTRAP = /* sql */ `
  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;

  -- Los tres roles de Supabase. service_role tiene BYPASSRLS: es exactamente
  -- por eso que su clave no puede llegar jamas al navegador.
  create role anon          nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role  nologin noinherit bypassrls;

  grant usage on schema public, extensions to anon, authenticated, service_role;

  alter default privileges in schema public
    grant all on tables    to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;

  -- auth.users, tal como la expone Supabase Auth
  create table auth.users (
    id                  uuid primary key default gen_random_uuid(),
    email               text unique,
    encrypted_password  text,
    email_confirmed_at  timestamptz,
    raw_user_meta_data  jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now()
  );

  -- auth.uid() lee el claim 'sub' del JWT, igual que en Supabase.
  create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(
      coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub',
      ''
    )::uuid
  $fn$;

  create or replace function auth.jwt() returns jsonb
  language sql stable as $fn$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $fn$;

  create or replace function auth.role() returns text
  language sql stable as $fn$
    select coalesce(
      coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role',
      'anon'
    )
  $fn$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt(), auth.role()
    to anon, authenticated, service_role;
  grant select on auth.users to service_role;

  -- storage, lo minimo para que las policies del bucket se puedan crear y probar
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now()
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text not null,
    owner uuid,
    metadata jsonb,
    created_at timestamptz not null default now()
  );

  alter table storage.objects enable row level security;

  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
`

export type Db = PGlite & {
  /** Corre como cliente autenticado con ese id de usuario. */
  asUser(userId: string): Promise<void>
  /** Corre como visitante sin sesion. */
  asAnon(): Promise<void>
  /** Corre como postgres (el equivalente a service_role: saltea RLS). */
  asService(): Promise<void>
  /** Devuelve solo las filas. */
  rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  /** Devuelve la primera fila, o null. */
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  /** Crea un usuario en auth.users y devuelve su id. */
  createUser(email: string, opts?: { admin?: boolean; verified?: boolean; name?: string }): Promise<string>
}

export function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/** Levanta una base limpia con todas las migraciones aplicadas. */
export async function createTestDb(): Promise<Db> {
  const pg = new PGlite({
    extensions: { pg_trgm, unaccent, pgcrypto },
  }) as Db

  await pg.exec(SUPABASE_BOOTSTRAP)

  for (const file of listMigrations()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await pg.exec(sql)
    } catch (error) {
      throw new Error(
        `La migracion ${file} fallo:\n${(error as Error).message}`,
        { cause: error },
      )
    }
  }

  pg.asUser = async (userId: string) => {
    await pg.exec('reset role')
    await pg.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await pg.exec('set role authenticated')
  }

  pg.asAnon = async () => {
    await pg.exec('reset role')
    await pg.query(`select set_config('request.jwt.claims', $1, false)`, ['{}'])
    await pg.exec('set role anon')
  }

  pg.asService = async () => {
    await pg.exec('reset role')
    await pg.query(`select set_config('request.jwt.claims', $1, false)`, ['{}'])
  }

  pg.rows = async <T>(sql: string, params: unknown[] = []) => {
    const result = await pg.query<T>(sql, params)
    return result.rows
  }

  pg.one = async <T>(sql: string, params: unknown[] = []) => {
    const result = await pg.query<T>(sql, params)
    return (result.rows[0] as T) ?? null
  }

  pg.createUser = async (email, opts = {}) => {
    await pg.asService()
    const inserted = await pg.one<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, $3) returning id`,
      [
        email,
        opts.verified === false ? null : new Date().toISOString(),
        JSON.stringify({ full_name: opts.name ?? email.split('@')[0] }),
      ],
    )
    const id = inserted!.id

    if (opts.admin) {
      // El rol admin se asigna SOLO por SQL controlado, nunca desde la app.
      await pg.query(`update public.profiles set role = 'admin' where id = $1`, [id])
    }

    return id
  }

  return pg
}

/** Datos minimos para probar catalogo, precios, stock y pedidos. */
export async function seedBasics(pg: Db) {
  // El stock solo se mueve por adjust_stock(), que exige ser admin. Asi que
  // el seed necesita un admin de verdad: no hay atajo, ni siquiera en tests.
  const adminId = await pg.createUser('admin@almatejida.test', { admin: true })

  await pg.asService()

  const category = await pg.one<{ id: string }>(
    `insert into public.categories (name, slug, position)
     values ('Mantas', 'mantas', 1) returning id`,
  )

  const product = await pg.one<{ id: string }>(
    `insert into public.products
       (category_id, name, slug, base_price, status, stock_display, low_stock_threshold)
     values ($1, 'Manta Roma', 'manta-roma', 40000, 'published', 'vague', 2)
     returning id`,
    [category!.id],
  )

  // El trigger ya creo la variante por defecto (decision D1).
  const variant = await pg.one<{ id: string }>(
    `select id from public.product_variants where product_id = $1 and is_default`,
    [product!.id],
  )

  await pg.asUser(adminId)
  await pg.query(
    `select public.adjust_stock($1::uuid, 3, 'initial', 'Carga inicial')`,
    [variant!.id],
  )
  await pg.asService()

  return {
    adminId,
    categoryId: category!.id,
    productId: product!.id,
    variantId: variant!.id,
  }
}
