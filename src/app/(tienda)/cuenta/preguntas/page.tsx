import Link from 'next/link'
import { MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { getMyQuestions } from '@/lib/queries/account'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Mis preguntas' }

export default async function MisPreguntasPage() {
  const questions = await getMyQuestions()

  if (questions.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircleQuestion className="size-10" strokeWidth={1.3} />}
        title="Todavía no preguntaste nada"
        description="Si tenés una duda sobre una pieza, preguntanos desde su ficha."
        action={
          <Button asChild variant="secondary">
            <Link href="/tienda">Ver la tienda</Link>
          </Button>
        }
      />
    )
  }

  return (
    <ul className="space-y-3">
      {questions.map((question) => (
        <li
          key={question.id}
          className="space-y-2 rounded-xl border border-border-soft bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            {question.products ? (
              <Link
                href={`/producto/${question.products.slug}`}
                className="font-medium text-ink hover:text-clay-700"
              >
                {question.products.name}
              </Link>
            ) : (
              <span className="font-medium text-ink">Producto</span>
            )}
            <Badge tone={question.answer ? 'success' : 'neutral'} size="sm">
              {question.answer ? 'Respondida' : 'Esperando respuesta'}
            </Badge>
          </div>

          <p className="text-[0.9375rem] text-ink">{question.body}</p>
          <p className="text-xs text-ink-subtle">{formatDate(question.created_at)}</p>

          {question.answer && (
            <div className="border-l-2 border-clay-200 pl-3.5">
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
                {question.answer}
              </p>
              <p className="mt-1 text-xs text-ink-subtle">Alma Tejida</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
