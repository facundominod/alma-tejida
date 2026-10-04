import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut, MessageCircleQuestion, Package, Star, User } from 'lucide-react'
import { Overline } from '@/components/ui/primitives'
import { signOut } from '@/lib/actions/auth'
import { getCurrentProfile } from '@/lib/supabase/server'

export const metadata = {
  title: { default: 'Mi cuenta', template: '%s · Mi cuenta' },
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { href: '/cuenta/pedidos', label: 'Mis pedidos', icon: Package },
  { href: '/cuenta/preguntas', label: 'Mis preguntas', icon: MessageCircleQuestion },
  { href: '/cuenta/resenas', label: 'Mis reseñas', icon: Star },
  { href: '/cuenta/datos', label: 'Mis datos', icon: User },
]

export default async function CuentaLayout({ children }: LayoutProps<'/cuenta'>) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/ingresar?volver=/cuenta')

  return (
    <div className="at-container py-8 md:py-12">
      <header className="mb-8">
        <Overline>Hola{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</Overline>
        <h1 className="text-display-md">Mi cuenta</h1>
      </header>

      <div className="grid gap-8 md:grid-cols-[220px_1fr] md:gap-12">
        <nav aria-label="Mi cuenta" className="md:sticky md:top-24 md:self-start">
          <ul className="scrollbar-none flex gap-2 overflow-x-auto pb-2 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <li key={section.href} className="shrink-0">
                  <Link
                    href={section.href}
                    className="flex items-center gap-2.5 rounded-lg border border-border-soft px-3.5 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink md:border-0 md:px-3"
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                    {section.label}
                  </Link>
                </li>
              )
            })}

            <li className="shrink-0 md:mt-3 md:border-t md:border-border-soft md:pt-3">
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg border border-border-soft px-3.5 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-danger md:border-0 md:px-3"
                >
                  <LogOut className="size-4 shrink-0" strokeWidth={1.8} />
                  Cerrar sesión
                </button>
              </form>
            </li>
          </ul>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
