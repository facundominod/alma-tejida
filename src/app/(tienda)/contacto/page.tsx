import type { Metadata } from 'next'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { BrandWatermark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { SocialIcon, socialLabel } from '@/components/ui/social-icons'
import { Overline, ThreadDivider } from '@/components/ui/primitives'
import { getStoreSettings } from '@/lib/queries/store'
import { whatsappLink } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Contacto',
  description:
    'Escribinos por WhatsApp, teléfono o correo. Coordinamos cada pedido con vos.',
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
          <Overline>Del otro lado hay alguien</Overline>
          <h1 className="text-display-lg">Contacto</h1>
          <p className="mx-auto max-w-lg text-ink-muted">
            La entrega, los tiempos y el pago los arreglamos hablando. Y si tenés una
            idea para una pieza a medida —un respaldo para una cama rara, un tapiz de
            un tamaño puntual—, contánosla: casi siempre se puede.
          </p>
        </header>

        <ThreadDivider className="my-10" />

        <div className="grid gap-4 sm:grid-cols-2">
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

        {whatsapp && (
          <div className="mt-8 text-center">
            <Button asChild variant="whatsapp" size="lg">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Consultar por WhatsApp
              </a>
            </Button>
          </div>
        )}

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
