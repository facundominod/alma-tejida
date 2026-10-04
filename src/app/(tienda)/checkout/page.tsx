import type { Metadata } from 'next'
import { CheckoutForm } from '@/components/tienda/checkout-form'
import { getStoreSettings } from '@/lib/queries/store'

export const metadata: Metadata = {
  title: 'Hacer el pedido',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage() {
  const settings = await getStoreSettings()

  return (
    <div className="at-container py-8 md:py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-display-md mb-2">Hacer el pedido</h1>
        <p className="mb-8 max-w-xl text-ink-muted">
          Solo necesitamos tres datos para poder coordinar con vos. No hace falta crear
          una cuenta.
        </p>

        <CheckoutForm
          deliveryMethods={settings.delivery_methods ?? []}
          paymentAlias={settings.payment_alias}
          paymentHolder={settings.payment_holder}
          paymentBank={settings.payment_bank}
          whatsappNumber={settings.whatsapp_number}
          storeName={settings.store_name}
        />
      </div>
    </div>
  )
}
