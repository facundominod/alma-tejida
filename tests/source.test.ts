import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pruebas sobre el código fuente, no sobre su comportamiento.
 *
 * Nacieron de un error real: al corregir los acentos del español, un script
 * convirtió `name="telefono"` en `name="teléfono"` y `persistSession` en
 * `persistSessión`. Lo primero rompía el teléfono del checkout en silencio
 * —el formulario enviaba un campo que la Server Action no leía— y lo segundo
 * rompía la inferencia de tipos de todo el cliente de Supabase.
 *
 * El español va en los textos. Los identificadores, los nombres de campo, las
 * claves de almacenamiento y las rutas se quedan en ASCII.
 */

const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ]/

function archivosFuente(): string[] {
  return globSync('src/**/*.{ts,tsx}', { cwd: process.cwd() }).map((f) =>
    f.split('\\').join('/'),
  )
}

function leer(file: string) {
  return readFileSync(join(process.cwd(), file), 'utf8')
}

/**
 * Quita comentarios antes de buscar identificadores.
 *
 * La regla es "los identificadores van en ASCII", no "el código no tiene
 * acentos": los comentarios están en español y tienen que poder escribirse
 * bien. Sin esto, una palabra en mayúsculas dentro de una explicación
 * —DINÁMICO, INSTRUCCIÓN— se parece a una constante y la prueba fallaba por
 * prosa correcta.
 *
 * El `//` sólo cuenta como comentario si no viene pegado a `:`, para no
 * cortar una línea en `https://` y esconder lo que venga después.
 */
function sinComentarios(contenido: string) {
  return contenido
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\w])\/\/.*$/gm, '$1')
}

describe('higiene del código fuente', () => {
  const archivos = archivosFuente()

  it('encuentra archivos para revisar', () => {
    expect(archivos.length).toBeGreaterThan(50)
  })

  it('ningún identificador lleva acentos', () => {
    // Firma de un identificador: guion bajo o mayúscula interna.
    const token = /[A-Za-z_][A-Za-z0-9_áéíóúüñÁÉÍÓÚÜÑ]*/g
    const danados: string[] = []

    for (const file of archivos) {
      const contenido = sinComentarios(leer(file))
      for (const [match] of contenido.matchAll(token)) {
        if (!ACENTOS.test(match)) continue
        const esIdentificador = match.includes('_') || /[A-Z]/.test(match.slice(1))
        if (esIdentificador) danados.push(`${file}: ${match}`)
      }
    }

    expect(danados).toEqual([])
  })

  it('ningún atributo name, id o ancla lleva acentos', () => {
    const danados: string[] = []

    for (const file of archivos) {
      const contenido = leer(file)
      const sospechosos = [
        ...contenido.matchAll(/name="([^"]*)"/g),
        ...contenido.matchAll(/\bid="([^"]*)"/g),
        ...contenido.matchAll(/href="#([^"]*)"/g),
      ]
      for (const [, valor] of sospechosos) {
        if (ACENTOS.test(valor)) danados.push(`${file}: ${valor}`)
      }
    }

    expect(danados).toEqual([])
  })

  it('ninguna clave de almacenamiento ni parámetro de URL lleva acentos', () => {
    const danados: string[] = []

    for (const file of archivos) {
      const contenido = leer(file)
      const claves = [
        ...contenido.matchAll(/_KEY\s*=\s*'([^']*)'/g),
        ...contenido.matchAll(/\?([a-zA-Záéíóúñ]+)=/g),
        ...contenido.matchAll(/searchParams\.(?:get|set)\('([^']*)'/g),
      ]
      for (const [, valor] of claves) {
        if (ACENTOS.test(valor)) danados.push(`${file}: ${valor}`)
      }
    }

    expect(danados).toEqual([])
  })

  /**
   * LA PRUEBA QUE IMPORTA.
   *
   * Un `<input name="x">` sin un `form.get('x')` que lo lea es un campo que la
   * persona completa y que se pierde en el camino. No rompe el build, no
   * rompe los tipos: simplemente llega vacío al servidor.
   */
  it('cada campo del checkout tiene quien lo lea en el servidor', () => {
    const formulario = leer('src/components/tienda/checkout-form.tsx')

    const campos = [...formulario.matchAll(/name="([^"]+)"/g)]
      .map(([, name]) => name)
      // los radio de entrega se leen por estado de React, no por FormData
      .filter((name) => name !== 'entrega' && name !== 'crearCuenta')

    const leidos = new Set(
      [...formulario.matchAll(/form\.get\('([^']+)'\)/g)].map(([, name]) => name),
    )

    const huerfanos = [...new Set(campos)].filter((name) => !leidos.has(name))
    expect(huerfanos).toEqual([])
  })

  it('cada campo de los formularios de autenticación tiene quien lo lea', () => {
    const formulario = leer('src/components/auth/auth-forms.tsx')
    const accion = leer('src/lib/actions/auth.ts')

    const campos = [...new Set([...formulario.matchAll(/name="([^"]+)"/g)].map(([, n]) => n))]
    const leidos = new Set(
      [...accion.matchAll(/formData\.get\('([^']+)'\)/g)].map(([, n]) => n),
    )

    const huerfanos = campos.filter((name) => !leidos.has(name))
    expect(huerfanos).toEqual([])
  })

  /**
   * La service role key saltea RLS por completo: sólo puede leerse en el
   * módulo que la encapsula. Ya lo revisa `npm run check:secrets`, pero acá
   * queda también dentro de la suite de pruebas.
   */
  it('la service role key sólo se lee en el cliente admin', () => {
    const infractores = archivos.filter((file) => {
      if (file === 'src/lib/supabase/admin.ts') return false
      return /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(leer(file))
    })

    expect(infractores).toEqual([])
  })

  it('ningún componente cliente importa el cliente admin', () => {
    const infractores = archivos.filter((file) => {
      const contenido = leer(file)
      return (
        /^\s*['"]use client['"]/m.test(contenido) &&
        /supabase\/admin/.test(contenido)
      )
    })

    expect(infractores).toEqual([])
  })

  it('ningún contenido de usuario se renderiza como HTML crudo', () => {
    // La única excepción permitida son los datos estructurados de la ficha de
    // producto, que construimos nosotros desde la base (no hay entrada de
    // usuario sin escapar adentro).
    const permitido = 'src/app/(tienda)/producto/[slug]/page.tsx'

    const infractores = archivos.filter(
      (file) => file !== permitido && /dangerouslySetInnerHTML/.test(leer(file)),
    )

    expect(infractores).toEqual([])
  })
})
