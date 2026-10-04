#!/usr/bin/env node
/**
 * Descarga toda la multimedia del bucket `catalog` a respaldos/media/,
 * respetando la estructura products/{id}/ (punto 207).
 *
 *   npm run backup:media
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const OUT = 'respaldos/media'

/** Recorre el bucket en profundidad: Storage lista un nivel por vez. */
async function listAll(prefix = '') {
  const { data, error } = await supabase.storage.from('catalog').list(prefix, { limit: 1000 })
  if (error) throw error

  const files = []
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    // Sin `id` significa carpeta
    if (entry.id === null) files.push(...(await listAll(path)))
    else files.push(path)
  }
  return files
}

const paths = await listAll()
console.log(`→ ${paths.length} archivos por descargar\n`)

let done = 0
for (const path of paths) {
  const { data, error } = await supabase.storage.from('catalog').download(path)
  if (error || !data) {
    console.error(`  ✖ ${path}`)
    continue
  }

  const target = join(OUT, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, Buffer.from(await data.arrayBuffer()))
  done += 1

  if (done % 25 === 0) console.log(`  ${done}/${paths.length}`)
}

console.log(`\n✓ ${done} archivos guardados en ${OUT}/`)
