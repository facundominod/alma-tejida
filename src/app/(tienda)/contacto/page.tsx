import type { Metadata } from 'next'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { BrandWatermark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { SocialIcon, socialLabel } from '@/components/ui/social-icons'
import { Overline, ThreadDivider } from '@/components/ui/primitives'
import { CONTACTO } from '@/lib/labels'
import { getStoreSettings } from '@/lib/queries/store'
import { whatsappLink } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Contacto',
  description:
    'Escribinos por WhatsApp, teléfono o correo. Todo se hace a medida: contanos la ' +
    'medida y el diseño y te pasamos precio y plazo.',
  alternates: { canonical: '/contacto' },
}

export const revalidate = 3600

export default async function ContactoPage() {
  const settings = await getStoreSettings()

  const whatsapp = whatsappLink(
    settings.whatsapp_number,
    `Hola ${settings.store_name}! Queria hacerte una consulta.`,
  )
  const socials = Object.entries(settings.socials ?? {}).filter(([, url]) => url)

  const channels = [
    whatsapp && {
      icon: MessageCircle,
      label: 'WhatsApp',
      value: 'Escribinos ahora',
      href: whatsapp,
      external: true,
      primary: true,
    },
    settings.phone && {
      icon: Phone,
      label: 'Teléfono',
      value: settings.phone,
      href: `tel:${settings.phone.replace(/\s/g, '')}`,
    },
    settings.contact_email && {
      icon: Mail,
      label: 'Correo',
      value: settings.contact_email,
      href: `mailto:${settings.contact_email}`,
    },
    settings.address && {
      icon: MapPin,
      label: 'Donde estamos',
      value: settings.address,
    },
    settings.opening_hours && {
      icon: Clock,
      label: 'Horarios',
      value: settings.opening_hours,
    },
  ].filter(Boolean) as Array<{
    icon: typeof Mail
    label: string
    value: string
    href?: string
    external?: boolean
    primary?: boolean
  }>

  return (
    <div className="at-container py-10 md:py-16">
      <div className="relative mx-auto max-w-3xl overflow-hidden">
        <BrandWatermark className="pointer-events-none absolute -right-20 -top-16 size-72 text-linen-900" />

        <header className="relative space-y-3 text-center">
          <Overline>{CONTACTO.overline}</Overline>
          <h1 className="text-display-lg">{CONTACTO.titulo}</h1>
          <p className="mx-auto max-w-lg leading-relaxed text-ink-muted">
            {CONTACTO.bajada}
          </p>
        </header>

        {/* La acción primaria va arriba, para quien ya se decidió y sólo quiere
            escribir. El que necesita leer antes tiene el mismo botón al final de
            los pasos. */}
        {whatsapp && (
          <div className="relative mt-6 text-center">
            <Button asChild variant="whatsapp" size="lg">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Escribime por WhatsApp
              </a>
            </Button>
          </div>
        )}

        <ThreadDivider className="my-10" />

        {/* CÓMO SIGUE
            Cuatro pasos en dos por dos: cierran el rectángulo y cada uno
            respira. En cuatro columnas el texto queda en bandas de tres
            palabras y se pierde la calma que la página tiene que transmitir. */}
        <section className="space-y-5">
          <div className="text-center">
            <Overline>Cómo trabajamos</Overline>
            <h2 className="mt-1 font-display text-2xl text-linen-900">
              De la idea a la pared
            </h2>
          </div>

          <ol className="grid items-stretch gap-4 sm:grid-cols-2">
            {CONTACTO.pasos.map((paso, i) => (
              <li
                key={paso.titulo}
                className="flex h-full gap-4 rounded-xl border border-border-soft bg-surface px-4 py-4"
              >
                {/* El número es el único adorno de la página: sin iconos y sin
                    emojis en los pasos. */}
                <span
                  aria-hidden="true"
                  className="tabular shrink-0 font-display text-2xl font-light leading-none text-clay-300"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-ink">{paso.titulo}</p>
                  <p className="text-sm leading-relaxed text-ink-muted">{paso.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* TODO A MEDIDA */}
        <section className="mt-10 space-y-2.5 rounded-xl border border-border-soft bg-surface-muted/60 p-5 text-center md:p-7">
          <h2 className="font-display text-2xl text-linen-900">
            {CONTACTO.invitacion.titulo}
          </h2>
          <p className="mx-auto max-w-xl leading-relaxed text-ink-muted">
            {CONTACTO.invitacion.texto}
          </p>
        </section>

        <ThreadDivider className="my-10" />

        <div className="text-center">
          <Overline>Por dónde escribirme</Overline>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {channels.map((channel) => {
            const Icon = channel.icon
            const content = (
              <>
                <Icon
                  className={
                    channel.primary
                      ? 'size-5 shrink-0 text-sage-500'
                      : 'size-5 shrink-0 text-clay-400'
                  }
                  strokeWidth={1.7}
                />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-ink-subtle">
                    {channel.label}
                  </p>
                  <p className="truncate font-medium text-ink">{channel.value}</p>
                </div>
              </>
            )

            const className =
              'flex items-center gap-3.5 rounded-xl border border-border-soft bg-surface px-4 py-4 transition-colors'

            return channel.href ? (
              <a
                key={channel.label}
                href={channel.href}
                target={channel.external ? '_blank' : undefined}
                rel={channel.external ? 'noopener noreferrer' : undefined}
                className={`${className} hover:border-clay-300`}
              >
                {content}
              </a>
            ) : (
              <div key={channel.label} className={className}>
                {content}
              </div>
            )
          })}
        </div>

        {channels.length === 0 && (
          <p className="rounded-xl border border-border-soft bg-surface px-4 py-6 text-center text-ink-muted">
            Los datos de contacto todavía no están configurados.
          </p>
        )}

        <p className="mx-auto mt-8 max-w-md text-center leading-relaxed text-ink-muted">
          {CONTACTO.cierre}
        </p>

        {socials.length > 0 && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <Overline>Seguinos</Overline>
            <div className="flex gap-2">
              {socials.map(([name, url]) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid size-11 place-items-center rounded-lg border border-border-soft bg-surface text-ink-muted transition-colors hover:border-clay-300 hover:text-clay-700"
                  aria-label={socialLabel(name)}
                >
                  <SocialIcon network={name} className="size-[18px]" />
                </a>
              ))}
            </div>
          </div>
        )}

        {settings.about_text && (
          <>
            <ThreadDivider className="my-10" />
            <div className="mx-auto max-w-xl whitespace-pre-line text-center leading-relaxed text-ink-muted">
              {settings.about_text}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
