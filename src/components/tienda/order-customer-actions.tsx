'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, FileUp, Star, X } from 'lucide-react'
import { Ovillo } from '@/components/ui/ovillo'
import { Button } from '@/components/ui/button'
import { FormError, Textarea } from '@/components/ui/field'
import { Overline } from '@/components/ui/primitives'
import { createReview } from '@/lib/actions/interaction'
import { cancelMyOrder } from '@/lib/actions/order'
import { uploadPaymentProof } from '@/lib/actions/proof'
import { UPLOAD_LIMITS } from '@/lib/images'
import { cn } from '@/lib/utils'
import type { OrderStatus } from '@/types/database'

/* =============================================================================
   SUBIR COMPROBANTE
   ========================================================================== */
export function ProofUploader({
  orderId,
  proofCount,
}: {
  orderId: string
  proofCount: number
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  async function upload(file: File | undefined) {
    if (!file) return

    setPending(true)
    setError(null)

    const formData = new FormData()
    formData.append('orderId', orderId)
    formData.append('file', file)

    const result = await uploadPaymentProof(formData)

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setDone(true)
    router.refresh()
  }

  if (done || proofCount > 0) {
    return (
      <p
        role="status"
        className="rounded-lg border border-sage-500/25 bg-sage-100/60 px-3.5 py-2.5 text-sm"
      >
        <Check className="mr-1.5 inline size-4 text-sage-600" />
        Recibimos tu comprobante. Lo revisamos y te confirmamos.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        id="comprobante"
        accept={UPLOAD_LIMITS.proof.accept.join(',')}
        className="sr-only"
        disabled={pending}
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <Button asChild variant="secondary" block disabled={pending}>
        <label htmlFor="comprobante" className="cursor-pointer">
          {pending ? <Ovillo /> : <FileUp />}
          {pending ? 'Subiendo...' : 'Enviar comprobante'}
        </label>
      </Button>
      <p className="text-xs text-ink-subtle">
        Una foto o un PDF, hasta 5 MB. Solo lo vemos vos y nosotros.
      </p>
      <FormError>{error}</FormError>
    </div>
  )
}

/* =============================================================================
   CANCELAR (antes de pagar)
   ========================================================================== */
export function CancelOrderButton({
  orderId,
  status,
}: {
  orderId: string
  status: OrderStatus
}) {
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')

  if (!['pending', 'contacted', 'awaiting_payment'].includes(status)) return null

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Cancelar pedido
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-border-soft bg-surface-muted/60 p-3">
      <p className="text-sm text-ink">¿Seguro que querés cancelarlo?</p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={200}
        placeholder="Contanos por que (opcional)"
        aria-label="Motivo de la cancelación"
      />
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={async () => {
            setPending(true)
            const result = await cancelMyOrder(orderId, reason.trim() || undefined)
            setPending(false)
            if (!result.ok) setError(result.error ?? 'No pudimos cancelar.')
            else router.refresh()
          }}
        >
          {pending ? <Ovillo /> : <X />}
          Si, cancelar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          No
        </Button>
      </div>
    </div>
  )
}

/* =============================================================================
   DEJAR RESENA  (solo con compra verificada; la base lo exige)
   ========================================================================== */
export function ReviewForm({
  orderId,
  productId,
  productName,
}: {
  orderId: string
  productId: string
  productName: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [rating, setRating] = React.useState(0)
  const [hovered, setHovered] = React.useState(0)
  const [body, setBody] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  if (done) {
    return (
      <p role="status" className="text-sm font-medium text-sage-600">
        <Check className="mr-1 inline size-4" />
        Gracias. La publicamos apenas la revisemos.
      </p>
    )
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Star />
        Calificar esta pieza
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-soft bg-surface-muted/50 p-3.5">
      <Overline>{productName}</Overline>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} ${value === 1 ? 'estrella' : 'estrellas'}`}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setRating(value)}
            className="p-1"
          >
            <Star
              className={cn(
                'size-7 transition-colors',
                value <= (hovered || rating)
                  ? 'fill-wood-500 text-wood-500'
                  : 'fill-transparent text-linen-300',
              )}
            />
          </button>
        ))}
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="¿Que te pareció? (opcional)"
        aria-label="Comentario"
      />

      <FormError>{error}</FormError>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || rating === 0}
          onClick={async () => {
            setPending(true)
            setError(null)

            const result = await createReview({
              productId,
              orderId,
              rating,
              body: body.trim() || undefined,
            })

            setPending(false)

            if (!result.ok) {
              setError(result.error)
              return
            }

            setDone(true)
            router.refresh()
          }}
        >
          {pending && <Ovillo />}
          Enviar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
