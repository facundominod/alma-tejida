import Link from 'next/link'
import { BrandMark, BrandWatermark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { ThreadDivider } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'

export const metadata = {
  title: 'Página no encontrada',
  robots: { index: false, follow: false },
}

/**
 * 404 global (punto 150).
 *
 * Es autonoma a proposito: una URL que no existe no pasa por el layout de la
 * tienda, así que no puede depender de datos. Aun así se siente Alma Tejida.
 */
export default function NotFound() {
  return (
    <div className="relative grid flex-1 place-items-center overflow-hidden px-6 py-24">
      <BrandWatermark className="pointer-events-none absolute inset-0 m-auto size-[26rem] text-linen-900" />

      <div className="relative max-w-md space-y-5 text-center">
        <Link href="/" className="inline-block" aria-label="Alma Tejida — Inicio">
          <BrandMark size="lg" />
        </Link>

        <ThreadDivider />

        <div className="space-y-2">
          <p className="font-display text-3xl text-linen-900">{COPY.notFound}</p>
          <p className="text-ink-muted">
            Puede que la pieza ya no este publicada, o que el enlace tenga algo raro.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <Button asChild size="lg">
            <Link href="/">{COPY.notFoundAction}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/tienda">Ver la tienda</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
