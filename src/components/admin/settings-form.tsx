'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, HardDrive, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/field'
import { Overline } from '@/components/ui/primitives'
import { updateStoreSettings } from '@/lib/actions/admin/operations'
import { formatBytes } from '@/lib/images'
import { STOCK_DISPLAY_LABEL } from '@/lib/labels'
import type { DeliveryMethod, StockDisplayMode, StorageUsage, StoreSettings } from '@/types/database'

const SOCIAL_NETWORKS = ['instagram', 'facebook', 'tiktok', 'pinterest'] as const

/**
 * Configuración de la tienda (punto 118).
 *
 * Todo lo que aparece en el header, el pie, el checkout y el seguimiento sale
 * de acá. Nada de eso está escrito en el código: cambiar el WhatsApp o el
 * alias no requiere un programador.
 */
export function SettingsForm({
  settings,
  storage,
}: {
  settings: StoreSettings
  storage: StorageUsage | null
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [methods, setMethods] = React.useState<DeliveryMethod[]>(
    settings.delivery_methods?.length
      ? settings.delivery_methods
      : [
          {
            key: 'retiro',
            label: 'Retiro acordado',
            description: 'Coordinamos punto y horario por WhatsApp',
            price: 0,
            requires_address: false,
            is_active: true,
          },
        ],
  )

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const value = (key: string) => String(form.get(key) ?? '').trim()

    const result = await updateStoreSettings({
      storeName: value('storeName'),
      tagline: value('tagline'),
      whatsappNumber: value('whatsappNumber'),
      phone: value('phone'),
      contactEmail: value('contactEmail'),
      address: value('address'),
      openingHours: value('openingHours'),
      aboutText: value('aboutText'),
      socials: Object.fromEntries(
        SOCIAL_NETWORKS.map((network) => [network, value(`social_${network}`)]).filter(
          ([, url]) => url,
        ),
      ),
      paymentAlias: value('paymentAlias'),
      paymentBank: value('paymentBank'),
      paymentHolder: value('paymentHolder'),
      paymentCbu: value('paymentCbu'),
      paymentInstructions: value('paymentInstructions'),
      deliveryMethods: methods.filter((method) => method.key && method.label),
      homeHero: {
        title: value('heroTitle'),
        subtitle: value('heroSubtitle'),
        cta_label: value('heroCtaLabel'),
        cta_href: value('heroCtaHref'),
      },
      defaultStockDisplay: value('defaultStockDisplay') as StockDisplayMode,
      defaultLowStockThreshold: Number(form.get('defaultLowStockThreshold') ?? 2),
      isOpen: form.get('isOpen') === 'on',
      closedMessage: value('closedMessage'),
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
    router.refresh()
  }

  const usedPercent = storage ? Number(storage.used_percent) : 0

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      {/* MARCA ------------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>La tienda</Overline>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" required>
            {(props) => (
              <Input {...props} name="storeName" defaultValue={settings.store_name} />
            )}
          </Field>
          <Field label="Frase de marca">
            {(props) => (
              <Input {...props} name="tagline" defaultValue={settings.tagline} />
            )}
          </Field>
        </div>

        <Field label="Sobre nosotros" hint="Se muestra en Contacto y en el pie.">
          {(props) => (
            <Textarea
              {...props}
              name="aboutText"
              defaultValue={settings.about_text ?? ''}
              rows={3}
              maxLength={2000}
            />
          )}
        </Field>
      </section>

      {/* PORTADA ----------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Lo que dice el inicio</Overline>

        <Field label="Título principal">
          {(props) => (
            <Input
              {...props}
              name="heroTitle"
              defaultValue={settings.home_hero?.title ?? ''}
              placeholder="Piezas tejidas a mano, una por una."
              maxLength={120}
            />
          )}
        </Field>

        <Field label="Subtítulo">
          {(props) => (
            <Textarea
              {...props}
              name="heroSubtitle"
              defaultValue={settings.home_hero?.subtitle ?? ''}
              rows={2}
              maxLength={300}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Texto del botón">
            {(props) => (
              <Input
                {...props}
                name="heroCtaLabel"
                defaultValue={settings.home_hero?.cta_label ?? ''}
                placeholder="Ver productos"
                maxLength={40}
              />
            )}
          </Field>
          <Field label="A donde lleva">
            {(props) => (
              <Input
                {...props}
                name="heroCtaHref"
                defaultValue={settings.home_hero?.cta_href ?? ''}
                placeholder="/tienda"
                maxLength={200}
              />
            )}
          </Field>
        </div>
      </section>

      {/* CONTACTO ---------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Contacto</Overline>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="WhatsApp"
            hint="Con código de pais, sin signos. Ej: 5493511234567"
          >
            {(props) => (
              <Input
                {...props}
                name="whatsappNumber"
                defaultValue={settings.whatsapp_number ?? ''}
                inputMode="tel"
                className="tabular"
              />
            )}
          </Field>
          <Field label="Teléfono">
            {(props) => (
              <Input
                {...props}
                name="phone"
                defaultValue={settings.phone ?? ''}
                inputMode="tel"
              />
            )}
          </Field>
          <Field label="Correo">
            {(props) => (
              <Input
                {...props}
                name="contactEmail"
                type="email"
                defaultValue={settings.contact_email ?? ''}
              />
            )}
          </Field>
          <Field label="Horarios">
            {(props) => (
              <Input
                {...props}
                name="openingHours"
                defaultValue={settings.opening_hours ?? ''}
                placeholder="Lunes a viernes de 9 a 18"
              />
            )}
          </Field>
        </div>

        <Field label="Dirección" hint="Opcional. Solo si recibis gente.">
          {(props) => (
            <Input {...props} name="address" defaultValue={settings.address ?? ''} />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((network) => (
            <Field key={network} label={network[0].toUpperCase() + network.slice(1)}>
              {(props) => (
                <Input
                  {...props}
                  name={`social_${network}`}
                  type="url"
                  defaultValue={settings.socials?.[network] ?? ''}
                  placeholder={`https://${network}.com/almatejida`}
                />
              )}
            </Field>
          ))}
        </div>
      </section>

      {/* PAGO -------------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Cobro por transferencia</Overline>
        <p className="text-sm text-ink-muted">
          Estos datos se le muestran al cliente después de confirmar el pedido. Son
          los tuyos: no se guarda ningun dato bancario de quien compra.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Alias">
            {(props) => (
              <Input
                {...props}
                name="paymentAlias"
                defaultValue={settings.payment_alias ?? ''}
                placeholder="almatejida.mp"
              />
            )}
          </Field>
          <Field label="CBU / CVU">
            {(props) => (
              <Input
                {...props}
                name="paymentCbu"
                defaultValue={settings.payment_cbu ?? ''}
                className="tabular"
              />
            )}
          </Field>
          <Field label="Titular">
            {(props) => (
              <Input
                {...props}
                name="paymentHolder"
                defaultValue={settings.payment_holder ?? ''}
              />
            )}
          </Field>
          <Field label="Banco o billetera">
            {(props) => (
              <Input
                {...props}
                name="paymentBank"
                defaultValue={settings.payment_bank ?? ''}
              />
            )}
          </Field>
        </div>

        <Field label="Instrucciones" hint="Lo que quieras aclarar al momento de pagar.">
          {(props) => (
            <Textarea
              {...props}
              name="paymentInstructions"
              defaultValue={settings.payment_instructions ?? ''}
              rows={2}
              maxLength={600}
            />
          )}
        </Field>
      </section>

      {/* ENTREGA ----------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Overline>Formas de entrega</Overline>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              setMethods((current) => [
                ...current,
                {
                  key: `metodo-${current.length + 1}`,
                  label: '',
                  price: 0,
                  requires_address: false,
                  is_active: true,
                },
              ])
            }
          >
            <Plus />
            Agregar
          </Button>
        </div>

        {methods.map((method, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border border-border-soft p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <Field label="Nombre">
              {(props) => (
                <Input
                  {...props}
                  value={method.label}
                  onChange={(e) =>
                    setMethods((current) =>
                      current.map((m, i) =>
                        i === index ? { ...m, label: e.target.value } : m,
                      ),
                    )
                  }
                  placeholder="Envío a domicilio"
                />
              )}
            </Field>

            <Field label="Costo" hint="0 = sin cargo">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={method.price ?? 0}
                  onChange={(e) =>
                    setMethods((current) =>
                      current.map((m, i) =>
                        i === index ? { ...m, price: Number(e.target.value) } : m,
                      ),
                    )
                  }
                  className="tabular"
                />
              )}
            </Field>

            <div className="flex items-end pb-1.5">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-ink-subtle hover:text-danger"
                aria-label="Quitar forma de entrega"
                onClick={() =>
                  setMethods((current) => current.filter((_, i) => i !== index))
                }
              >
                <Trash2 />
              </Button>
            </div>

            <div className="sm:col-span-3 sm:-mt-1">
              <Input
                value={method.description ?? ''}
                onChange={(e) =>
                  setMethods((current) =>
                    current.map((m, i) =>
                      i === index ? { ...m, description: e.target.value } : m,
                    ),
                  )
                }
                placeholder="Aclaración para el cliente"
                aria-label="Descripción de la forma de entrega"
                className="h-10 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-4 sm:col-span-3">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={method.requires_address ?? false}
                  onChange={(e) =>
                    setMethods((current) =>
                      current.map((m, i) =>
                        i === index ? { ...m, requires_address: e.target.checked } : m,
                      ),
                    )
                  }
                  className="size-4 accent-[var(--color-primary)]"
                />
                Pedir dirección
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={method.is_active ?? true}
                  onChange={(e) =>
                    setMethods((current) =>
                      current.map((m, i) =>
                        i === index ? { ...m, is_active: e.target.checked } : m,
                      ),
                    )
                  }
                  className="size-4 accent-[var(--color-primary)]"
                />
                Disponible
              </label>
            </div>
          </div>
        ))}
      </section>

      {/* POLITICAS --------------------------------------------------------- */}
      <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
        <Overline>Política de stock por defecto</Overline>
        <p className="text-sm text-ink-muted">
          Se aplica a las piezas nuevas. Cada una puede tener la suya.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Que ve el cliente del stock">
            {(props) => (
              <Select
                {...props}
                name="defaultStockDisplay"
                defaultValue={settings.default_stock_display}
              >
                {(Object.keys(STOCK_DISPLAY_LABEL) as StockDisplayMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {STOCK_DISPLAY_LABEL[mode]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Avisarme cuando queden">
            {(props) => (
              <Input
                {...props}
                name="defaultLowStockThreshold"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={settings.default_low_stock_threshold}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <Checkbox
          name="isOpen"
          label="La tienda está abierta"
          description="Si la cerras temporalmente, se puede mirar pero no hacer pedidos."
          defaultChecked={settings.is_open}
        />

        <Field label="Mensaje cuando está cerrada">
          {(props) => (
            <Input
              {...props}
              name="closedMessage"
              defaultValue={settings.closed_message ?? ''}
              placeholder="Volvemos el 5 de febrero"
              maxLength={300}
            />
          )}
        </Field>
      </section>

      {/* USO DE ESPACIO ---------------------------------------------------- */}
      {storage && (
        <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-ink-subtle" />
            <Overline>Espacio usado</Overline>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={
                usedPercent > 90
                  ? 'h-full rounded-full bg-danger'
                  : usedPercent > 70
                    ? 'h-full rounded-full bg-warning'
                    : 'h-full rounded-full bg-clay-500'
              }
              style={{ width: `${Math.min(usedPercent, 100)}%` }}
            />
          </div>

          <p className="tabular text-sm text-ink-muted">
            {formatBytes(storage.total_bytes)} de {formatBytes(storage.quota_bytes)} (
            {usedPercent}%)
          </p>
          <p className="tabular text-xs text-ink-subtle">
            Fotos {formatBytes(storage.images_bytes)} · Videos{' '}
            {formatBytes(storage.videos_bytes)} · Comprobantes{' '}
            {formatBytes(storage.proofs_bytes)}
          </p>

          {usedPercent > 70 && (
            <p className="text-sm font-medium text-warning">
              Ya pasaste el 70%. Conviene revisar los videos, que son lo que más pesa.
            </p>
          )}
        </section>
      )}

      <FormError>{error}</FormError>

      <div className="sticky bottom-16 z-10 rounded-xl border border-border-soft bg-background/95 p-3 backdrop-blur-sm md:bottom-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : saved ? <Check /> : null}
          {pending ? 'Guardando...' : saved ? 'Guardado' : 'Guardar configuración'}
        </Button>
      </div>
    </form>
  )
}
