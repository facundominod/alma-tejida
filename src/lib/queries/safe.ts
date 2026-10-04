import 'server-only'

/**
 * Lectura pública tolerante a fallos.
 *
 * Dos garantías para cualquier consulta del catálogo:
 *
 * 1. **Nunca tira abajo la página.** Si la consulta falla, devuelve un valor
 *    vacío razonable. Una tienda que dice "todavía no hay piezas" es
 *    infinitamente mejor que una pantalla de error.
 *
 * 2. **Nunca hace esperar de más.** Si Supabase está caído o lento, la página
 *    degrada en 5 segundos en lugar de quedarse colgada hasta que el sistema
 *    operativo corte la conexión (medido: 14 segundos).
 *
 * El tope se aplica acá y no con `AbortSignal` en el cliente de Supabase
 * porque Next envuelve `fetch` para su propio caché y no siempre propaga la
 * señal de cancelación. Una carrera de promesas no depende de eso.
 *
 * La petición abandonada termina sola y su resultado se descarta; no se
 * cancela el socket, pero la persona ya tiene su página.
 */

/**
 * 2,5 segundos.
 *
 * Una consulta sana de este catálogo tarda menos de 200 ms, así que el tope
 * tiene doce veces de margen y jamás se dispara con la base andando. Pero
 * cuando NO anda, acota lo que espera la persona: el layout y la página se
 * renderizan uno después del otro, así que el peor caso de una pantalla son
 * dos topes seguidos. Con 5 segundos eso daban 10; con 2,5 da 5.
 */
const TIMEOUT_MS = 2500

export async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label = 'consulta',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), TIMEOUT_MS)
  })

  try {
    const result = await Promise.race([fn(), timeout])

    if (result === TIMEOUT_SENTINEL) {
      warn(`${label}: sin respuesta en ${TIMEOUT_MS / 1000}s`)
      return fallback
    }

    return result as T
  } catch (error) {
    warn(`${label}: ${(error as Error).message}`)
    return fallback
  } finally {
    clearTimeout(timer)
  }
}

/** Centinela propio: distingue "tardó demasiado" de un valor legítimo. */
const TIMEOUT_SENTINEL = Symbol('timeout')

function warn(message: string) {
  // En producción no se ensucia el log con cada hipo de red; el fallo ya se
  // ve en la página. En desarrollo sí, porque suele ser un error de config.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[alma-tejida] ${message}`)
  }
}
