'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, EyeOff, Send } from 'lucide-react'
import { Ovillo } from '@/components/ui/ovillo'
import { Button } from '@/components/ui/button'
import { Checkbox, FormError, Textarea } from '@/components/ui/field'
import { Badge, StarRating } from '@/components/ui/primitives'
import {
  answerQuestion,
  hideQuestion,
  moderateReview,
} from '@/lib/actions/admin/operations'
import { formatDateTime } from '@/lib/utils'
import type { Question, Review } from '@/types/database'

type WithProduct<T> = T & { products: { name: string; slug: string } | null }

/* =============================================================================
   PREGUNTAS  (puntos 76, 77)
   Responder y publicar son dos decisiones distintas: hay respuestas que solo
   le sirven a quien pregunto.
   ========================================================================== */
export function QuestionCard({ question }: { question: WithProduct<Question> }) {
  const router = useRouter()
  const [answer, setAnswer] = React.useState(question.answer ?? '')
  const [publish, setPublish] = React.useState(question.status === 'published')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  async function submit() {
    setPending(true)
    setError(null)

    const result = await answerQuestion({
      questionId: question.id,
      answer,
      publish,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <li className="space-y-3 rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {question.products ? (
            <Link
              href={`/producto/${question.products.slug}`}
              target="_blank"
              className="text-sm font-medium text-ink hover:text-clay-700"
            >
              {question.products.name}
            </Link>
          ) : (
            <p className="text-sm font-medium text-ink">Producto</p>
          )}
          <p className="text-xs text-ink-subtle">
            {question.author_name ?? 'Cliente'} · {formatDateTime(question.created_at)}
          </p>
        </div>

        <Badge
          tone={
            question.status === 'published'
              ? 'success'
              : question.status === 'answered'
                ? 'primary'
                : question.status === 'hidden'
                  ? 'neutral'
                  : 'warning'
          }
          size="sm"
        >
          {question.status === 'published'
            ? 'Publicada'
            : question.status === 'answered'
              ? 'Respondida en privado'
              : question.status === 'hidden'
                ? 'Oculta'
                : 'Sin responder'}
        </Badge>
      </div>

      <p className="rounded-lg bg-surface-muted px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-ink">
        {question.body}
      </p>

      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Tu respuesta"
        aria-label="Respuesta"
      />

      <Checkbox
        name={`publicar-${question.id}`}
        label="Publicar esta pregunta y su respuesta"
        description="Si le sirve a más gente, dejala visible en la ficha del producto."
        checked={publish}
        onChange={(e) => setPublish(e.target.checked)}
      />

      <FormError>{error}</FormError>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !answer.trim()}>
          {pending ? <Ovillo /> : saved ? <Check /> : <Send />}
          {saved ? 'Guardada' : 'Responder'}
        </Button>

        {question.status !== 'hidden' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              const result = await hideQuestion(question.id)
              setPending(false)
              if (!result.ok) setError(result.error)
              else router.refresh()
            }}
          >
            <EyeOff />
            Ocultar
          </Button>
        )}
      </div>
    </li>
  )
}

/* =============================================================================
   RESENAS  (punto 82)
   Una crítica NO se oculta por ser negativa. Si se oculta, hay que escribir
   el motivo — y la base lo exige, no solo esta pantalla.
   ========================================================================== */
export function ReviewCard({ review }: { review: WithProduct<Review> }) {
  const router = useRouter()
  const [reply, setReply] = React.useState(review.admin_reply ?? '')
  const [reason, setReason] = React.useState(review.hidden_reason ?? '')
  const [hiding, setHiding] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function run(action: 'approve' | 'hide') {
    setPending(true)
    setError(null)

    const result = await moderateReview({
      reviewId: review.id,
      action,
      reason: action === 'hide' ? reason : undefined,
      reply: reply.trim() || undefined,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }
    setHiding(false)
    router.refresh()
  }

  return (
    <li className="space-y-3 rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {review.products ? (
            <Link
              href={`/producto/${review.products.slug}`}
              target="_blank"
              className="text-sm font-medium text-ink hover:text-clay-700"
            >
              {review.products.name}
            </Link>
          ) : (
            <p className="text-sm font-medium text-ink">Producto</p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <StarRating value={review.rating} showValue={false} size={14} />
            <span className="text-xs text-ink-subtle">
              {review.author_name ?? 'Cliente'} · {formatDateTime(review.created_at)}
            </span>
          </div>
        </div>

        <Badge
          tone={
            review.status === 'approved'
              ? 'success'
              : review.status === 'hidden'
                ? 'neutral'
                : 'warning'
          }
          size="sm"
        >
          {review.status === 'approved'
            ? 'Publicada'
            : review.status === 'hidden'
              ? 'Oculta'
              : 'Sin moderar'}
        </Badge>
      </div>

      {review.body && (
        <p className="rounded-lg bg-surface-muted px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-ink">
          {review.body}
        </p>
      )}

      {review.hidden_reason && (
        <p className="text-xs text-ink-subtle">
          Motivo por el que está oculta: {review.hidden_reason}
        </p>
      )}

      <Textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Respuesta publica (opcional)"
        aria-label="Respuesta a la reseña"
      />

      {hiding && (
        <div className="space-y-2 rounded-lg border border-border-soft bg-surface-muted/60 p-3">
          <p className="text-sm text-ink">
            Para ocultar una reseña hace falta escribir por que.
          </p>
          <p className="text-xs text-ink-subtle">
            Una crítica negativa no es motivo. Insultos, datos personales o contenido
            que no habla del producto, si.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Motivo"
            aria-label="Motivo para ocultar"
          />
        </div>
      )}

      <FormError>{error}</FormError>

      <div className="flex flex-wrap gap-2">
        {review.status !== 'approved' && (
          <Button size="sm" onClick={() => run('approve')} disabled={pending}>
            {pending ? <Ovillo /> : <Check />}
            Aprobar
          </Button>
        )}

        {review.status === 'approved' && reply.trim() !== (review.admin_reply ?? '') && (
          <Button size="sm" onClick={() => run('approve')} disabled={pending}>
            <Send />
            Guardar respuesta
          </Button>
        )}

        {review.status !== 'hidden' &&
          (hiding ? (
            <>
              <Button
                size="sm"
                variant="danger"
                disabled={pending || !reason.trim()}
                onClick={() => run('hide')}
              >
                Ocultar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHiding(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setHiding(true)}>
              <EyeOff />
              Ocultar
            </Button>
          ))}
      </div>
    </li>
  )
}
