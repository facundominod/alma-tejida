import Link from 'next/link'
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { SocialIcon, socialLabel } from '@/components/ui/social-icons'
import { BrandMark, BrandWatermark } from '@/components/tienda/brand-mark'
import { ThreadDivider } from '@/components/ui/primitives'
import { whatsappLink } from '@/lib/utils'
import type { Category, StoreSettings } from '@/types/database'

export function SiteFooter({
  settings,
  categories,
}: {
  settings: StoreSettings
  categories: Category[]
}) {
  const whatsapp = whatsappLink(
    settings.whatsapp_number,
    `Hola ${settings.store_name}, queria hacerte una consulta.`,
  )

  const socials = Object.entries(settings.socials ?? {}).filter(([, url]) => url)

  return (
    <footer className="at-weave relative mt-20 overflow-hidden border-t border-border-soft bg-surface-muted">
      <BrandWatermark className="pointer-events-none absolute -right-16 -top-16 size-80 text-linen-900" />

      <ThreadDivider className="pt-8" />

      <div className="at-container relative grid gap-10 py-10 md:grid-cols-[1.3fr_1fr_1fr_1.2fr] md:py-14">
        <div className="space-y-4">
          <BrandMark logoUrl={settings.logo_url} storeName={settings.store_name} size="md" />
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
            {settings.tagline}
          </p>
          {settings.about_text && (
            <p className="max-w-xs text-sm leading-relaxed text-ink-subtle">
              {settings.about_text}
            </p>
          )}
        </div>

        <nav aria-labelledby="pie-tienda" className="space-y-3">
          <p
            id="pie-tienda"
            className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-ink-subtle"
          >
            Tienda
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/tienda" className="text-ink-muted hover:text-clay-700">
                Todas las piezas
              </Link>
            </li>
            <li>
              <Link href="/ofertas" className="text-ink-muted hover:text-clay-700">
                Ofertas
              </Link>
            </li>
            <li>
              <Link href="/novedades" className="text-ink-muted hover:text-clay-700">
                Novedades
              </Link>
            </li>
            <li>
              <Link href="/cuenta/pedidos" className="text-ink-muted hover:text-clay-700">
                Mis pedidos
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="pie-categorias" className="space-y-3">
          <p
            id="pie-categorias"
            className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-ink-subtle"
          >
            Categorías
          </p>
          <ul className="space-y-2 text-sm">
            {categories.slice(0, 6).map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categoria/${category.slug}`}
                  className="text-ink-muted hover:text-clay-700"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            {categories.length === 0 && (
              <li className="text-ink-subtle">Próximamente</li>
            )}
          </ul>
        </nav>

        <div className="space-y-3">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Contacto
          </p>
          <ul className="space-y-2.5 text-sm">
            {whatsapp && (
              <li>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-ink-muted hover:text-clay-700"
                >
                  <MessageCircle className="size-4 shrink-0" />
                  WhatsApp
                </a>
              </li>
            )}
            {settings.phone && (
              <li>
                <a
                  href={`tel:${settings.phone.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-2 text-ink-muted hover:text-clay-700"
                >
                  <Phone className="size-4 shrink-0" />
                  {settings.phone}
                </a>
              </li>
            )}
            {settings.contact_email && (
              <li>
                <a
                  href={`mailto:${settings.contact_email}`}
                  className="inline-flex items-center gap-2 break-all text-ink-muted hover:text-clay-700"
                >
                  <Mail className="size-4 shrink-0" />
                  {settings.contact_email}
                </a>
              </li>
            )}
            {settings.address && (
              <li className="inline-flex items-start gap-2 text-ink-muted">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {settings.address}
              </li>
            )}
            {socials.length > 0 && (
              <li className="flex gap-2 pt-1">
                {socials.map(([name, url]) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid size-10 place-items-center rounded-lg border border-border-soft bg-surface text-ink-muted transition-colors hover:border-clay-300 hover:text-clay-700"
                    aria-label={socialLabel(name)}
                  >
                    <SocialIcon network={name} className="size-4" />
                  </a>
                ))}
              </li>
            )}
          </ul>
          {settings.opening_hours && (
            <p className="text-xs text-ink-subtle">{settings.opening_hours}</p>
          )}
        </div>
      </div>

      <div className="at-container relative flex flex-col gap-2 border-t border-border-soft py-5 text-xs text-ink-subtle md:flex-row md:items-center md:justify-between">
        <p>
          © {new Date().getFullYear()} {settings.store_name}. Hecho a mano, desde el alma.
        </p>
        <p>Cada pieza es única: pueden existir pequeñas diferencias de color y medida.</p>
      </div>
    </footer>
  )
}
