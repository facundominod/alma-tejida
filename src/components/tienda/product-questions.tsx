'use client'

import Link from 'next/link'
import * as React from 'react'
import { MessageCircle, MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { FormError, Textarea } from '@/components/ui/field'
import { askQuestion } from '@/lib/actions/interaction'
import { useAuth } from '@/lib/auth/auth-state'
import { COPY } from '@/lib/labels'
import { formatDate, whatsappLink } from '@/lib/utils'
import type { Question } from '@/types/database'

/**
 * Preguntas sobre la pieza (puntos 75-79).
 *
 * Una pregunta nace privada: solo la ve quien la hizo y el administrador.
 * Aparece publicamente si el administrador decide publicarla junto con su
 * respuesta, porque entonces le sirve a todo el mundo.
 */
export function ProductQuestions({
  productId,
  productName,
  questions,
  whatsappNumber,
}: {
  productId: string
  productName: string
  questions: Question[]
  whatsappNumber: string | null
}) {
  const { isLoggedIn, ready } = useAuth()
  const [body, setBody] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)

  const whatsapp = whatsappLink(
    whatsappNumber,
    `Hola! Tengo una consulta sobre ${productName}.`,
  )

  const published = questions.filter((q) => q.status === 'published')
  const mine = questions.filter((q) => q.status !== 'published')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSending(true)

    const result = await askQuestion({ productId, body })

    setSending(false)
    if (result.ok) {
      setBody('')
      setSent(true)
    } else {
      setError(result.error)
    }
  }

  return (
    <section aria-labelledby="preguntas">
      <h2 id="preguntas" className="mb-5 font-display text-2xl">
        Preguntas
      </h2>

      {/* Formulario */}
      {ready && isLoggedIn ? (
        sent ? (
          <div className="mb-8 rounded-lg border border-sage-500/25 bg-sage-100/60 px-4 py-3.5 text-sm">
            <p className="font-medium text-sage-600">Recibimos tu pregunta.</p>
            <p className="text-ink-muted">
              Te avisamos apenas la respondamos. Va a aparecer en tu cuenta.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mb-8 space-y-3">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Por ejemplo: ¿la hacen en azul? ¿cuánto tarda?"
              rows={3}
              maxLength={1000}
              required
              aria-label="Tu pregunta"
            />
            <FormError>{error}</FormError>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={sending || body.trim().length < 5}>
                {sending ? 'Enviando...' : 'Preguntar'}
              </Button>
              <p className="text-xs text-ink-subtle">
                Se publica solo si la respuesta le sirve a más gente.
              </p>
            </div>
          </form>
        )
      ) : (
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border border-border-soft bg-surface px-4 py-3.5">
          <p className="flex-1 text-sm text-ink-muted">
            Para preguntar por acá necesitás una cuenta.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/ingresar">Ingresar</Link>
          </Button>
          {whatsapp && (
            <Button asChild variant="whatsapp" size="sm">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Mis preguntas pendientes */}
      {mine.length > 0 && (
        <div className="mb-6 space-y-3">
          {mine.map((question) => (
            <QuestionItem key={question.id} question={question} own />
          ))}
        </div>
      )}

      {/* Publicas */}
      {published.length > 0 ? (
        <ul className="divide-y divide-border-soft">
          {published.map((question) => (
            <li key={question.id} className="py-4">
              <QuestionItem question={question} />
            </li>
          ))}
        </ul>
      ) : (
        mine.length === 0 && (
          <EmptyState
            icon={<MessageCircleQuestion className="size-8" strokeWidth={1.3} />}
            title={COPY.emptyQuestions}
            description={COPY.emptyQuestionsHint}
            className="py-10"
          />
        )
      )}
    </section>
  )
}

function QuestionItem({ question, own = false }: { question: Question; own?: boolean }) {
  return (
    <div
      className={
        own ? 'rounded-lg border border-border-soft bg-surface-muted/60 px-4 py-3.5' : ''
      }
    >
      <div className="flex items-start justify-between gap-3">
        {/* Texto plano interpolado por React: se escapa por definición. */}
        <p className="flex-1 text-[0.9375rem] leading-relaxed text-ink">{question.body}</p>
        {own && (
          <Badge tone={question.answer ? 'success' : 'neutral'} size="sm">
            {question.answer ? 'Respondida' : 'Esperando respuesta'}
          </Badge>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-subtle">
        {question.author_name ? `${question.author_name.split(' ')[0]} · ` : ''}
        {formatDate(question.created_at)}
      </p>

      {question.answer && (
        <div className="mt-3 border-l-2 border-clay-200 pl-3.5">
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
            {question.answer}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">Alma Tejida</p>
        </div>
      )}
    </div>
  )
}
