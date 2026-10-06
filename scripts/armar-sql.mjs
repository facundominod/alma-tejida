#!/usr/bin/env node
/**
 * Junta las migraciones en un solo archivo para pegar en el SQL Editor.
 *
 * El camino recomendado sigue siendo el CLI (`npm run db:push`): lleva la
 * cuenta de lo aplicado y permite volver atrás. Pero el CLI pide instalar
 * Supabase, iniciar sesión y vincular el proyecto, y para alguien que sólo
 * quiere abrir su tienda eso son tres pasos antes del primero.
 *
 * Este archivo es la alternativa honesta: un pegado, una ejecución, la base
 * entera. El orden numérico se respeta, que es lo único que importa —0003
 * referencia tablas de 0002, 0011 referencia funciones de 0002—.
 *
 *   npm run sql:armar   →   supabase/migraciones-todo-junto.sql
 *
 * Se regenera, no se edita a mano: cualquier cambio va en la migración que
 * corresponda y después se vuelve a correr esto.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DESDE = 'supabase/migrations'
const HASTA = 'supabase/migraciones-todo-junto.sql'

const archivos = readdirSync(DESDE)
  .filter((f) => f.endsWith('.sql'))
  .sort() // 0001, 0002, ... El cero inicial hace que el orden alfabético sea el correcto.

if (archivos.length === 0) {
  console.error(`No hay migraciones en ${DESDE}`)
  process.exit(1)
}

const hoy = new Date().toISOString().slice(0, 10)

const partes = [
  `-- =============================================================================`,
  `-- ALMA TEJIDA — base de datos completa`,
  `--`,
  `-- Generado el ${hoy} por scripts/armar-sql.mjs a partir de ${DESDE}/.`,
  `-- NO EDITAR ACÁ: los cambios se pierden al regenerar.`,
  `--`,
  `-- Cómo usarlo:`,
  `--   1. Panel de Supabase → SQL Editor → New query`,
  `--   2. Pegar TODO este archivo`,
  `--   3. Run`,
  `--`,
  `-- Son ${archivos.length} migraciones en orden. Tarda unos segundos.`,
  `-- =============================================================================`,
  '',
]

for (const archivo of archivos) {
  const sql = readFileSync(join(DESDE, archivo), 'utf8').trimEnd()
  partes.push(
    '',
    `-- ─────────────────────────────────────────────────────────────────────────`,
    `-- ${archivo}`,
    `-- ─────────────────────────────────────────────────────────────────────────`,
    '',
    sql,
    '',
  )
}

const salida = partes.join('\n') + '\n'
writeFileSync(HASTA, salida, 'utf8')

const kb = (Buffer.byteLength(salida) / 1024).toFixed(1)
console.log(`✓ ${HASTA}`)
console.log(`  ${archivos.length} migraciones · ${kb} KB · ${salida.split('\n').length} líneas`)
