import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, ArrowRight } from 'lucide-react'
import { BrandWatermark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { Overline, ThreadDivider } from '@/components/ui/primitives'
import { MATERIALES } from '@/lib/labels'
import { getStoreSettings } from '@/lib/queries/store'
import { whatsappLink } from '@/lib/utils'

/**
 * Los hilos con los que está hecha cada pieza.
 *
 * POR QUÉ ESTA PÁGINA VENDE Y NO SÓLO INFORMA
 * Porque nadie elige un hilo en abstracto. Cada uno termina con las PIEZAS
 * concretas que salen mejor con él, y cada una enlaza al catálogo: se entra a
 * leer qué es el yute y se sale mirando los espejos de kraft y yute.
 *
 * La muestra de arriba de cada tarjeta es un fondo teñido, no una foto. No hay
 * fotos de material cargadas, y poner la foto de una pieza sería mentir sobre
 * qué se está mostrando. El color sí es información: el kraft tirando a papel
 * madera, el algodón crudo, el yute terroso, el polipropileno fresco.
 */

export const revalidate = 3600

export const metadata: Metadata = {
  title: MATERIALES.tituloCorto,
  description:
    'Hilo Kraft, algodón, yute y polipropileno: para qué sirve cada uno y qué piezas de Alma Tejida se hacen con él.',
  alternates: { canonical: '/materiales' },
}

export default async function MaterialesPage() {
  const settings = await getStoreSettings()

  const whatsapp = whatsappLink(
    settings.whatsapp_number,
    'Hola! Quería preguntarte por los hilos y qué me conviene para mi pieza.',
  )

  return (
    <div className="at-container py-8 md:py-14">
      {/* ENCABEZADO */}
      <header className="relative mx-auto max-w-3xl space-y-3 overflow-hidden text-center">
        <BrandWatermark className="pointer-events-none absolute -right-20 -top-16 size-72 text-linen-900" />
        <div className="relative space-y-3">
          <Overline>Con qué están hechas</Overline>
          <h1 className="text-display-lg">{MATERIALES.intro.titulo}</h1>
          <p className="mx-auto max-w-xl leading-relaxed text-ink-muted">
            {MATERIALES.intro.texto}
          </p>
        </div>
      </header>

      <ThreadDivider className="my-10 md:my-14" />

      {/* LOS CUATRO HILOS, EN DOS POR DOS
          En cuatro columnas la lista de piezas se rompe en una palabra por
          línea. En dos por dos cada hilo respira y los pares se comparan. */}
      <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2 md:gap-6">
        {MATERIALES.hilos.map((hilo) => (
          <article
            key={hilo.nombre}
            className="group flex flex-col overflow-hidden rounded-xl border border-border-soft bg-surface shadow-soft transition-[box-shadow,border-color,transform] duration-[var(--at-dur-base)] ease-[var(--ease-out-alma)] hover:-translate-y-0.5 hover:border-clay-300 hover:shadow-card motion-reduce:hover:translate-y-0"
          >
            {/* La muestra del hilo: color, no foto. */}
            <div
              className={`relative aspect-[16/7] overflow-hidden md:aspect-[5/2] ${hilo.muestra}`}
            >
              <div className="at-weave absolute inset-0 opacity-[0.55]" />
            </div>

            <div className="flex flex-1 flex-col p-5">
              <h2 className="font-display text-xl text-linen-900">{hilo.nombre}</h2>
              <p className={`text-sm font-medium ${hilo.acento}`}>{hilo.lema}</p>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                {hilo.texto}
              </p>

              <div className="mt-4 border-t border-border-soft pt-4">
                <Overline>Para qué lo usamos</Overline>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {hilo.paraQue.map((uso) => (
                    <li key={uso.texto}>
                      {uso.href ? (
                        <Link
                          href={uso.href}
                          className="at-tap inline-flex min-h-[34px] items-center rounded-lg border border-border-soft px-2.5 text-[0.8125rem] text-ink-muted transition-colors hover:border-clay-300 hover:text-clay-700"
                        >
                          {uso.texto}
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-[34px] items-center rounded-lg border border-border-soft px-2.5 text-[0.8125rem] text-ink-subtle">
                          {uso.texto}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>

      <ThreadDivider className="my-10 md:my-14" />

      {/* CIERRE */}
      <section className="mx-auto max-w-2xl space-y-4 rounded-xl border border-border-soft bg-surface-muted/60 p-6 text-center md:p-8">
        <h2 className="font-display text-2xl text-linen-900">{MATERIALES.cierre.titulo}</h2>
        <p className="mx-auto max-w-lg leading-relaxed text-ink-muted">
          {MATERIALES.cierre.texto}
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          {whatsapp && (
            <Button asChild variant="whatsapp" size="lg">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                {MATERIALES.cierre.boton}
              </a>
            </Button>
          )}
          <Button asChild variant="secondary" size="lg">
            <Link href="/tienda">
              Ver las piezas
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
