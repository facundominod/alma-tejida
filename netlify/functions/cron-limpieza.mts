import type { Config } from '@netlify/functions'

/**
 * Limpieza nocturna.
 *
 * Borra datos que sólo sirven un rato: eventos de analítica viejos y el
 * registro de intentos del limitador. Sin esto, dos tablas crecen para
 * siempre y el medio giga del plan gratuito de Supabase se llena con basura.
 *
 * Igual que el ping, acá no hay lógica: el trabajo lo hace la ruta de Next, y
 * esto es sólo el horario, que en Netlify tiene que ser una función.
 */
export default async () => {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET

  if (!base || !secret) {
    console.error('[cron-limpieza] faltan URL o CRON_SECRET en el entorno')
    return new Response('sin configurar', { status: 500 })
  }

  const respuesta = await fetch(`${base}/api/cron/limpieza`, {
    headers: { authorization: `Bearer ${secret}` },
  })

  console.log(`[cron-limpieza] ${respuesta.status}`)
  return new Response(null, { status: respuesta.ok ? 200 : 500 })
}

export const config: Config = {
  // Las 4 de la mañana: la hora con menos gente mirando la tienda.
  schedule: '0 4 * * *',
}
