import type { Metadata } from 'next'
import { CartPageView } from '@/components/tienda/cart-page-view'
import { getStoreSettings } from '@/lib/queries/store'

export const metadata: Metadata = {
  title: 'Tu carrito',
  robots: { index: false, follow: true },
}

export default async function CarritoPage() {
  const settings = await getStoreSettings()

  return (
    <div className="at-container py-8 md:py-12">
      <h1 className="text-display-md mb-8">Tu carrito</h1>
      <CartPageView whatsappNumber={settings.whatsapp_number} />
    </div>
  )
}
