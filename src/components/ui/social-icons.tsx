import { Globe } from 'lucide-react'
import type { ComponentProps } from 'react'

/**
 * Iconos de redes.
 *
 * Inline y no desde una librería de iconos de marca: son cuatro trazos, pesan
 * nada y evitan sumar una dependencia entera para esto. El fallback es un
 * globo, así que una red nueva configurada por el administrador siempre
 * muestra algo razonable.
 */
type IconProps = ComponentProps<'svg'>

function Instagram(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Facebook(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
      <path d="M14.5 8.5h2.2V5.6h-2.4c-2.3 0-3.6 1.4-3.6 3.7v1.6H8.5v2.9h2.2V21h3v-7.2h2.3l.4-2.9h-2.7V9.6c0-.8.3-1.1.8-1.1Z" />
    </svg>
  )
}

function TikTok(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
      <path
        d="M14.2 3v10.6a3.1 3.1 0 1 1-2.6-3.06"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14.2 3c.4 2.2 2 3.7 4.3 3.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Pinterest(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 20c-.4-1.4 0-3 .3-4.2l1-4" strokeLinecap="round" />
      <path
        d="M8.9 10.6c0-2 1.6-3.7 3.9-3.7 2 0 3.4 1.3 3.4 3.2 0 2.3-1.3 4.1-3.1 4.1-.9 0-1.6-.7-1.4-1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

const ICONS: Record<string, (props: IconProps) => React.ReactElement> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: TikTok,
  pinterest: Pinterest,
}

/** Nombre legible de la red, para el aria-label. */
export const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  web: 'Sitio web',
}

export function SocialIcon({
  network,
  className,
}: {
  network: string
  className?: string
}) {
  const Icon = ICONS[network.toLowerCase()] ?? Globe
  return <Icon className={className} aria-hidden="true" />
}

export function socialLabel(network: string) {
  return SOCIAL_LABELS[network.toLowerCase()] ?? network
}
