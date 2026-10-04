import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Cliente PUBLICO del servidor: clave anonima, sin cookies.
 *
 * Existe por una razon muy concreta. Cualquier llamada a `cookies()` obliga a
 * Next a renderizar la ruta de forma dinámica, y eso significaría una consulta
 * a Supabase POR CADA VISITA. Con el plan gratuito, mil personas mirando la
 * misma manta serían mil consultas.
 *
 * Este cliente no toca cookies, así que el catálogo, la home y las fichas de
 * producto se pueden generar estaticamente y servirse desde el CDN de Vercel:
 * mil visitas pasan a ser UNA consulta.
 *
 * Como corre con el rol `anon`, RLS le muestra exactamente lo mismo que a un
 * visitante sin sesión: productos publicados, categorías visibles, promociones
 * vigentes. Que es justo lo que corresponde cachear y compartir entre todos.
 *
 * Para cualquier cosa que dependa de QUIEN está mirando (carrito, pedidos,
 * cuenta, panel) se usa createClient() de server.ts, que si lee la sesión.
 */
let publicClient: ReturnType<typeof createSupabaseClient<Database>> | undefined

export function createPublicClient() {
  publicClient ??= createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        /**
         * Tope de 5 segundos por consulta.
         *
         * Sin esto, si Supabase está caído o lento, una página pública se
         * queda esperando hasta que el sistema operativo corte la conexión
         * —se midió en 14 segundos— y recién ahí muestra el estado vacío.
         * Con el tope, la tienda degrada rápido: mejor un catálogo vacío en
         * cinco segundos que una pantalla en blanco durante quince.
         *
         * Sólo aplica a las lecturas públicas. Las mutaciones usan el cliente
         * con sesión, donde esperar es preferible a fallar.
         */
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
      },
    },
  )
  return publicClient
}
