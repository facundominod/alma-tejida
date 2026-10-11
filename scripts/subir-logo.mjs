#!/usr/bin/env node
/**
 * Sube el logo al almacenamiento y lo deja configurado como el de la tienda.
 *
 *   npm run logo:subir
 *
 * Va a Storage y no al repositorio porque es CONTENIDO, no código: la dueña
 * puede reemplazarlo desde Configuración sin que nadie despliegue nada. El
 * PNG versionado en `src/assets` es sólo el intermedio del recorte, por si
 * hay que volver a generarlo.
 */
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !clave) {
  console.error('\n  Faltan datos en .env.local. Corré antes: npm run db:clave\n')
  process.exit(1)
}

const supabase = createClient(url, clave, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const png = await readFile('src/assets/logo.png')

// Nombre fijo: reemplazarlo pisa el anterior y no deja huérfanos en el bucket.
const ruta = 'logo.png'

const { error } = await supabase.storage.from('brand').upload(ruta, png, {
  contentType: 'image/png',
  upsert: true,
  // Un año: si cambia el logo cambia el archivo, y Storage sirve el nuevo.
  cacheControl: '31536000',
})

if (error) {
  console.error(`\n  No se pudo subir: ${error.message}\n`)
  process.exit(1)
}

// `logo_url` guarda la direccion COMPLETA, no la ruta dentro del bucket: el
// encabezado se la pasa tal cual a next/image. El dominio de Supabase esta
// declarado en `remotePatterns` de next.config.ts, asi que la acepta.
const publica = supabase.storage.from('brand').getPublicUrl(ruta).data.publicUrl

const { error: errorAjuste } = await supabase
  .from('store_settings')
  .update({ logo_url: publica })
  .not('id', 'is', null)

if (errorAjuste) {
  console.error(`\n  Se subio, pero no se pudo guardar en la configuracion: ${errorAjuste.message}\n`)
  process.exit(1)
}

console.log(`
  ✓ Logo subido y configurado.

    ${Math.round(png.length / 1024)} KB
    ${publica}

    Se cambia desde /admin/configuracion, sin tocar codigo.
`)
