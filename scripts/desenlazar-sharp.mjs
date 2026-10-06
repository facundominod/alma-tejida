#!/usr/bin/env node
/**
 * Reemplaza los enlaces simbólicos de `.next/standalone` por copias reales.
 *
 * Corre al final de `npm run build`, y SÓLO en Windows.
 *
 * Por qué existe: para armar la función del servidor, el plugin de Netlify
 * copia `.next/standalone` conservando los enlaces tal cual (`verbatimSymlinks`).
 * El build de Next deja exactamente uno —`sharp`, que pesa y por eso se enlaza
 * en vez de duplicarse— y recrearlo del otro lado necesita un permiso que
 * Windows no le da a una cuenta normal con el modo desarrollador apagado. El
 * despliegue muere con `EPERM: symlink`.
 *
 * Las salidas que no quisimos:
 *   - pedir que se despliegue desde una terminal como administrador: hay que
 *     acordarse cada vez;
 *   - pedir que se active el modo desarrollador de Windows: es tocarle la
 *     configuración del sistema a alguien para arreglar un problema nuestro.
 *
 * Lo que cuesta: unos megas más en el paquete de la función, porque sharp se
 * copia en lugar de enlazarse. El tope de Netlify son 250 MB; no se acerca.
 *
 * En Linux —donde compila Netlify si algún día se conecta por Git— no hace
 * nada: ahí los enlaces funcionan y duplicar sería desperdicio.
 */
import { cpSync, existsSync, lstatSync, readdirSync, readlinkSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAIZ = '.next/standalone'

if (process.platform !== 'win32') {
  process.exit(0)
}

if (!existsSync(RAIZ)) {
  // Un build normal de Next no genera `standalone`: sólo lo pide el plugin de
  // Netlify. No es un error.
  process.exit(0)
}

/** Devuelve todos los enlaces simbólicos que haya debajo de `dir`. */
function buscarEnlaces(dir, encontrados = []) {
  let hijos
  try {
    hijos = readdirSync(dir, { withFileTypes: true })
  } catch {
    return encontrados
  }

  for (const hijo of hijos) {
    const ruta = join(dir, hijo.name)
    if (hijo.isSymbolicLink()) {
      encontrados.push(ruta)
    } else if (hijo.isDirectory()) {
      buscarEnlaces(ruta, encontrados)
    }
  }

  return encontrados
}

const enlaces = buscarEnlaces(RAIZ)

if (enlaces.length === 0) {
  process.exit(0)
}

let reemplazados = 0

for (const enlace of enlaces) {
  const destino = resolve(join(enlace, '..'), readlinkSync(enlace))

  if (!existsSync(destino)) {
    // Un enlace roto no se copia: se saca. Dejarlo haría fallar el mismo
    // `cp` que se quiere evitar.
    rmSync(enlace, { force: true })
    console.log(`  - ${enlace}  (apuntaba a la nada)`)
    continue
  }

  // `lstat` y no `stat`: interesa el enlace, no lo que hay del otro lado.
  const esDirectorio = lstatSync(destino).isDirectory()

  rmSync(enlace, { force: true, recursive: true })
  cpSync(destino, enlace, { recursive: esDirectorio })
  reemplazados++
  console.log(`  ✓ ${enlace}`)
}

console.log(
  `\n  ${reemplazados} enlace${reemplazados === 1 ? '' : 's'} de standalone reemplazado${
    reemplazados === 1 ? '' : 's'
  } por copias (Windows no deja crearlos al desplegar).\n`,
)
