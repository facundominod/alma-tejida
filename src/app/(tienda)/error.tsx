'use client'

import Link from 'next/link'
import * as React from 'react'
import { BrandWatermark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { Overline, ThreadDivider } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'

/**
 * Error de la tienda pública (punto 150).
 *
 * Next monta esto cuando una página del grupo (tienda) lanza. Conserva el
 * header y el footer, así que la persona nunca queda sin salida: puede ir al
 * catálogo o al inicio aunque esta ruta esté rota.
 *
 * NO se muestra `error.message`. En producción Next ya lo reemplaza por un
 * texto genérico, pero el `digest` sí es seguro y es lo único que sirve para
 * cruzar este error con los logs del servidor. Va en letra chica, sin ruido.
 */
export default function TiendaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // El servidor ya registró el error con su stack. Acá sólo queda constancia
    // en la consola del navegador, con el mismo identificador.
    console.error('[alma-tejida]', error.digest ?? 'sin digest')
  }, [error])

  return (
    <div className="relative grid flex-1 place-items-center overflow-hidden px-6 py-20 md:py-28">
      <BrandWatermark className="pointer-events-none absolute inset-0 m-auto size-[22rem] text-linen-900" />

      <div className="relative max-w-md space-y-5 text-center">
        <Overline>Algo se trabó</Overline>

        <ThreadDivider />

        <div className="space-y-2">
          <p className="font-display text-3xl text-linen-900">{COPY.serverError}</p>
          <p className="text-ink-muted">{COPY.serverErrorHint}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <Button size="lg" onClick={reset}>
            {COPY.serverErrorAction}
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/tienda">Ver la tienda</Link>
          </Button>
        </div>

        {error.digest && (
          <p className="tabular pt-2 text-xs text-ink-subtle">
            Referencia: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
