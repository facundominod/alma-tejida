'use client'

import * as React from 'react'
import { Check, MessageCircle, MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { Field, FormError, Input, Textarea } from '@/components/ui/field'
import { askQuestion } from '@/lib/actions/interaction'
import { useCart } from '@/lib/cart/cart-store'
import { COPY } from '@/lib/labels'
import { formatDate, whatsappLink } from '@/lib/utils'
import type { PublicQuestion } from '@/types/database'

/**
 * Preguntas sobre la pieza.
 *
 * SIN CUENTA.
 * Antes había que registrarse para preguntar. Nadie crea una cuenta para
 * saber si un respaldo entra en su cama: se va, o escribe por WhatsApp y la
 * pregunta se pierde en un chat en vez de quedar en la ficha donde le sirve a
 * la próxima persona.
 *
 * QUÉ SE VE Y QUÉ NO
 * Ninguna pregunta nace publicada. Silvana decide dos cosas por separado: si
 * publica la pregunta y si publica la respuesta. Una pregunta publicada con la
 * respuesta en privado se muestra como "respondida en privado" —el hueco se
 * explica en vez de parecer abandono—.
 *
 * EL CONTACTO ES OPCIONAL PERO IMPORTA
 * Quien no deja contacto ni tiene cuenta sólo se entera de la respuesta si la
 * pregunta se publica. El formulario lo dice en lugar de dejarlo esperando.
 */
export function ProductQuestions({
  productId,
  productName,
  questions,
  whatsappNumber,
  sinEncabezado = false,
}: {
  productId: string
  productName: string
  questions: PublicQuestion[]
  whatsappNumber: string | null
  /**
   * El título lo pone el bloque plegable que la envuelve. Sin esto, la ficha
   * mostraría el mismo título dos veces: una en la solapa y otra adentro.
   */
  sinEncabezado?: boolean
}) {
  // El mismo token que el carrito ya guarda. No identifica a nadie: sirve para
  // contar cuántas preguntas mandó la misma persona.
  const { anonToken } = useCart()

  const [body, setBody] = React.useState('')
  const [nombre, setNombre] = React.useState('')
  const [contacto, setContacto] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)

  const whatsapp = whatsappLink(
    whatsappNumber,
    `Hola! Tengo una consulta sobre ${productName}.`,
  )

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSending(true)

    const result = await askQuestion({
      productId,
      body,
      authorName: nombre || undefined,
      authorContact: contacto || undefined,
      visitante: anonToken || undefined,
    })

    setSending(false)
    if (result.ok) {
      setBody('')
      setSent(true)
    } else {
      setError(result.error)
    }
  }

  return (
    <section aria-label="Preguntas">
      {!sinEncabezado && (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="preguntas" className="font-display text-2xl">
            Preguntas
          </h2>
          <p className="text-sm text-ink-subtle">No hace falta tener cuenta.</p>
        </div>
      )}

      {sent ? (
        <div className="mb-8 rounded-lg border border-sage-500/25 bg-sage-100/60 px-4 py-3.5 text-sm">
          <p className="flex items-center gap-2 font-medium text-sage-600">
            <Check className="size-4" aria-hidden="true" />
            Recibimos tu pregunta.
          </p>
          <p className="mt-1 text-ink-muted">
            {contacto
              ? `Te contestamos a ${contacto}.`
              : 'Si la respuesta le sirve a más gente, la vas a ver acá mismo. Dejá tu WhatsApp la próxima y te contestamos directo.'}
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-2 text-xs text-sage-600 underline-offset-2 hover:underline"
          >
            Hacer otra pregunta
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mb-8 space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Por ejemplo: ¿lo hacés en 1,60? ¿qué hilo me conviene para un baño?"
            rows={3}
            maxLength={1000}
            required
            aria-label="Tu pregunta"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tu nombre" hint="Opcional">
              {(props) => (
                <Input
                  {...props}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Como te llamamos"
                  maxLength={80}
                  autoComplete="name"
                />
              )}
            </Field>

            <Field
              label="WhatsApp o correo"
              hint="Opcional. Sin esto sólo te contestamos acá."
            >
              {(props) => (
                <Input
                  {...props}
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                  placeholder="351 123 4567"
                  maxLength={160}
                />
              )}
            </Field>
          </div>

          <FormError>{error}</FormError>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={sending || body.trim().length < 5}>
              {sending ? 'Enviando...' : 'Preguntar'}
            </Button>
            {whatsapp && (
              <Button asChild variant="whatsapp" size="sm">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  Preguntar por WhatsApp
                </a>
              </Button>
            )}
          </div>
        </form>
      )}

      {questions.length > 0 ? (
        <ul className="divide-y divide-border-soft">
          {questions.map((question) => (
            <li key={question.id} className="py-4">
              <QuestionItem question={question} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<MessageCircleQuestion className="size-8" strokeWidth={1.3} />}
          title={COPY.emptyQuestions}
          description={COPY.emptyQuestionsHint}
          className="py-10"
        />
      )}
    </section>
  )
}

function QuestionItem({ question }: { question: PublicQuestion }) {
  return (
    <div>
      {/* Texto plano interpolado por React: se escapa por definición. */}
      <p className="text-[0.9375rem] leading-relaxed text-ink">{question.body}</p>

      <p className="mt-1 text-xs text-ink-subtle">
        {question.author_name ? `${question.author_name.split(' ')[0]} · ` : ''}
        {formatDate(question.created_at)}
      </p>

      {question.answer ? (
        <div className="mt-3 border-l-2 border-clay-200 pl-3.5">
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
            {question.answer}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">Alma Tejida</p>
        </div>
      ) : (
        /* Respondida, pero en privado. Decirlo evita que la pregunta parezca
           abandonada, que es lo que transmite una pregunta publicada sin
           ninguna señal de respuesta. */
        question.fue_respondida && (
          <Badge tone="neutral" size="sm" className="mt-2">
            Respondida en privado
          </Badge>
        )
      )}
    </div>
  )
}
