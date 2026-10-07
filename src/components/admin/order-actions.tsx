'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, FileText, X } from 'lucide-react'
import { Ovillo } from '@/components/ui/ovillo'
import { Button } from '@/components/ui/button'
import { FormError, Textarea } from '@/components/ui/field'
import { Overline } from '@/components/ui/primitives'
import { getProofUrl, saveInternalNote, setOrderStatus } from '@/lib/actions/admin/operations'
import { ALLOWED_TRANSITIONS, ORDER_STATUS_LABEL } from '@/lib/labels'
import { formatDate } from '@/lib/utils'
import type { OrderStatus } from '@/types/database'

/**
 * Acciones sobre un pedido.
 *
 * Confirmar el pago es LA acción importante: ahí y solo ahí el stock fisico
 * baja y el ingreso entra en la contabilidad. Por eso tiene su propio botón
 * destacado y pide confirmación, mientras el resto de los cambios de estado
 * viven en una lista secundaria.
 *
 * Las transiciones validas son las mismas que impone set_order_status() en la
 * base: acá solo se dibujan las que la base va a aceptar.
 */
export function OrderActions({
  orderId,
  orderNumber,
  status,
  internalNote,
  whatsappHref,
  proofs,
}: {
  orderId: string
  orderNumber: string
  status: OrderStatus
  internalNote: string | null
  whatsappHref: string | null
  proofs: Array<{ id: string; path: string; createdAt: string }>
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState<OrderStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<OrderStatus | null>(null)
  const [cancelReason, setCancelReason] = React.useState('')
  const [note, setNote] = React.useState(internalNote ?? '')
  const [noteSaved, setNoteSaved] = React.useState(false)

  const allowed = ALLOWED_TRANSITIONS[status]
  const canConfirmPayment = allowed.includes('paid')

  async function change(next: OrderStatus, reason?: string) {
    setPending(next)
    setError(null)

    const result = await setOrderStatus(orderId, next, reason)

    setPending(null)
    setConfirming(null)

    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function persistNote() {
    await saveInternalNote(orderId, note)
    setNoteSaved(true)
    window.setTimeout(() => setNoteSaved(false), 2000)
  }

  async function openProof(path: string) {
    const result = await getProofUrl(path)
    if ('url' in result) {
      // URL firmada de 60 segundos: el bucket sigue siendo privado
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } else {
      setError(result.error)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
      <Overline>Acciones</Overline>

      {error && <FormError>{error}</FormError>}

      {/* LA acción importante */}
      {canConfirmPayment && (
        <div className="space-y-2">
          {confirming === 'paid' ? (
            <div className="space-y-2 rounded-lg border border-sage-500/30 bg-sage-100/50 p-3">
              <p className="text-sm font-medium text-sage-600">
                ¿Confirmas que recibiste el pago de {orderNumber}?
              </p>
              <p className="text-xs text-ink-muted">
                Al confirmar, el stock reservado sale del inventario y el importe
                entra como ingreso del mes.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  block
                  disabled={pending !== null}
                  onClick={() => change('paid', 'Pago confirmado por transferencia')}
                >
                  {pending === 'paid' ? (
                    <Ovillo />
                  ) : (
                    <Check />
                  )}
                  Si, confirmar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  block
                  onClick={() => setConfirming(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button block onClick={() => setConfirming('paid')}>
              <Check />
              Confirmar pago recibido
            </Button>
          )}
        </div>
      )}

      {/* Otros cambios de estado */}
      {allowed.filter((s) => s !== 'paid' && s !== 'cancelled').length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-subtle">Marcar como</p>
          <div className="flex flex-wrap gap-2">
            {allowed
              .filter((s) => s !== 'paid' && s !== 'cancelled')
              .map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant="secondary"
                  disabled={pending !== null}
                  onClick={() => change(next)}
                >
                  {pending === next && <Ovillo />}
                  {ORDER_STATUS_LABEL[next]}
                </Button>
              ))}
          </div>
        </div>
      )}

      {/* Cancelar: siempre con motivo */}
      {allowed.includes('cancelled') && (
        <div className="border-t border-border-soft pt-3">
          {confirming === 'cancelled' ? (
            <div className="space-y-2">
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Motivo de la cancelación"
                aria-label="Motivo de la cancelación"
              />
              <p className="text-xs text-ink-muted">
                {status === 'paid' || status === 'preparing'
                  ? 'Las piezas vuelven al inventario.'
                  : 'Se libera el stock reservado.'}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  block
                  disabled={pending !== null || !cancelReason.trim()}
                  onClick={() => change('cancelled', cancelReason.trim())}
                >
                  {pending === 'cancelled' ? (
                    <Ovillo />
                  ) : (
                    <X />
                  )}
                  Cancelar pedido
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  Volver
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-[color-mix(in_srgb,var(--color-danger)_8%,white)]"
              onClick={() => setConfirming('cancelled')}
            >
              Cancelar pedido
            </Button>
          )}
        </div>
      )}

      {/* Comprobantes */}
      {proofs.length > 0 && (
        <div className="space-y-2 border-t border-border-soft pt-3">
          <p className="text-xs text-ink-subtle">Comprobantes</p>
          {proofs.map((proof) => (
            <button
              key={proof.id}
              type="button"
              onClick={() => openProof(proof.path)}
              className="flex w-full items-center gap-2 rounded-lg border border-border-soft px-3 py-2 text-left text-sm transition-colors hover:border-clay-300"
            >
              <FileText className="size-4 shrink-0 text-clay-400" />
              <span className="flex-1">Comprobante</span>
              <span className="text-xs text-ink-subtle">
                {formatDate(proof.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Nota interna: invisible al cliente */}
      <div className="space-y-2 border-t border-border-soft pt-3">
        <label htmlFor="nota-interna" className="text-xs text-ink-subtle">
          Nota interna (el cliente no la ve)
        </label>
        <Textarea
          id="nota-interna"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={persistNote}
          rows={3}
          maxLength={2000}
          placeholder="Coordinamos entrega el viernes..."
        />
        {noteSaved && (
          <p role="status" className="text-xs font-medium text-sage-600">
            <Check className="mr-1 inline size-3" />
            Nota guardada
          </p>
        )}
      </div>

      {whatsappHref && (
        <p className="text-xs text-ink-subtle">
          El pedido ya existe en Alma Tejida. WhatsApp es solo el canal para
          coordinar.
        </p>
      )}
    </section>
  )
}
