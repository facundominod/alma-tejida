#!/usr/bin/env node
/**
 * Guardia de secretos (punto 13).
 *
 * Busca la service role key en cualquier archivo marcado "use client", y
 * cualquier variable sensible que alguien haya prefijado con NEXT_PUBLIC_
 * (lo que la publicaria al navegador).
 *
 * Corre en `npm run verify`, antes de cada deploy. Si encuentra algo, falla.
 */
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['src', 'supabase']
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

// Los unicos lugares que pueden LEER la service role key.
// El primero es el cliente admin del servidor; el segundo es el script de
// seed, que corre en Node desde la terminal y nunca se empaqueta para el
// navegador (ademas se niega a apuntar a produccion).
const ALLOWED = ['src/lib/supabase/admin.ts', 'supabase/seed/seed.ts']

const problems = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(path)
      continue
    }
    if (!EXTENSIONS.has(extname(entry))) continue

    const relative = path.split('\\').join('/')
    const content = readFileSync(path, 'utf8')
    const isClient = /^\s*['"]use client['"]/m.test(content)
    const mentionsServiceRole = /SUPABASE_SERVICE_ROLE_KEY|service_role/.test(content)

    if (mentionsServiceRole && isClient) {
      problems.push(`${relative}: menciona la service role key en un componente cliente`)
    }

    if (mentionsServiceRole && !isClient && !ALLOWED.includes(relative)) {
      // Se permite nombrarla en comentarios y documentacion, no usarla
      if (/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(content)) {
        problems.push(`${relative}: lee la service role key fuera de ${ALLOWED[0]}`)
      }
    }

    if (/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|PRIVATE|PASSWORD)/.test(content)) {
      problems.push(`${relative}: una variable sensible lleva el prefijo NEXT_PUBLIC_`)
    }
  }
}

for (const root of ROOTS) {
  try {
    walk(root)
  } catch {
    // la carpeta puede no existir
  }
}

if (problems.length > 0) {
  console.error('\n✖ Revision de secretos FALLIDA:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  process.exit(1)
}

console.log('✓ Ningun secreto expuesto.')
