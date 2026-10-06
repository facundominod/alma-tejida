import type { Config } from '@netlify/functions'

/**
 * Ping diario a la base.
 *
 * Un proyecto de Supabase en plan gratuito se PAUSA tras varios días sin
 * actividad, y despertarlo tarda. Una consulta trivial por día evita que la
 * tienda aparezca caída un lunes a la mañana.
 *
 * Esto no hace el trabajo: llama a la ruta de Next que lo hace. La lógica vive
 * en un solo lugar (`/api/cron/ping`) y este archivo es sólo el despertador,
 * que en Netlify tiene que ser una función con su propio horario.
 *
 * El secreto viaja en la cabecera: la ruta devuelve 404 sin él, así que nadie
 * puede dispararla desde internet.
 */
const despertarLaBase = async () => {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET

  if (!base || !secret) {
    console.error('[cron-ping] faltan URL o CRON_SECRET en el entorno')
    return new Response('sin configurar', { status: 500 })
  }

  const respuesta = await fetch(`${base}/api/cron/ping`, {
    headers: { authorization: `Bearer ${secret}` },
  })

  // Se registra el resultado para poder ver en los logs si la base se despertó.
  console.log(`[cron-ping] ${respuesta.status}`)
  return new Response(null, { status: respuesta.ok ? 200 : 500 })
}

export default despertarLaBase

export const config: Config = {
  schedule: '0 11 * * *',
}
