import Link from 'next/link'
import { BrandMark, BrandWatermark } from '@/components/tienda/brand-mark'
import { getStoreSettings } from '@/lib/queries/store'

export default async function AuthLayout({ children }: LayoutProps<'/'>) {
  const settings = await getStoreSettings()

  return (
    <div className="at-weave at-alto-ventana relative flex flex-col items-center justify-center overflow-hidden px-4 py-12">
      <BrandWatermark className="pointer-events-none absolute -right-24 top-1/4 size-96 text-linen-900" />

      <Link href="/" className="relative mb-8" aria-label={`${settings.store_name} — Inicio`}>
        <BrandMark
          logoUrl={settings.logo_url}
          storeName={settings.store_name}
          size="lg"
          className="items-center text-center"
        />
      </Link>

      <main className="relative w-full max-w-sm">{children}</main>

      <Link
        href="/tienda"
        className="relative mt-8 text-sm text-ink-muted transition-colors hover:text-clay-700"
      >
        Seguir mirando la tienda
      </Link>
    </div>
  )
}
