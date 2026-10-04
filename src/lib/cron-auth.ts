import { NextResponse } from 'next/server'

/**
 * Los crons de Vercel llegan con un secreto compartido en la cabecera.
 * Sin el, cualquiera podría disparar la limpieza de datos desde internet.
 */
export function assertCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }

  const header = request.headers.get('authorization')
  if (header !== `Bearer ${secret}`) {
    // 404 y no 401: no hace falta confirmar que esta ruta existe.
    return new NextResponse(null, { status: 404 })
  }

  return null
}
