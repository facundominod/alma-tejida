import Link from 'next/link'
import { MessageCircleQuestion } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import { QuestionCard } from '@/components/admin/moderation'
import { EmptyState } from '@/components/ui/primitives'
import { getAdminQuestions } from '@/lib/queries/admin'

export const metadata = { title: 'Preguntas' }

export default async function AdminPreguntasPage({
  searchParams,
}: PageProps<'/admin/preguntas'>) {
  const params = await searchParams
  const onlyPending = params.filtro === 'pendientes'
  const questions = await getAdminQuestions(onlyPending)
  const pending = questions.filter((q) => q.status === 'pending').length

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Preguntas"
        description="Nacen privadas. Solo se publican si vos decidis que le sirven a más gente."
      />

      <div className="mb-5 flex gap-2">
        <Link
          href="/admin/preguntas"
          aria-current={!onlyPending ? 'page' : undefined}
          className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
            !onlyPending
              ? 'border-clay-300 bg-primary-soft font-medium text-clay-700'
              : 'border-border-soft bg-surface text-ink-muted'
          }`}
        >
          Todas
        </Link>
        <Link
          href="/admin/preguntas?filtro=pendientes"
          aria-current={onlyPending ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors ${
            onlyPending
              ? 'border-clay-300 bg-primary-soft font-medium text-clay-700'
              : 'border-border-soft bg-surface text-ink-muted'
          }`}
        >
          Sin responder
          {pending > 0 && <span className="tabular text-xs opacity-70">{pending}</span>}
        </Link>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon={<MessageCircleQuestion className="size-10" strokeWidth={1.3} />}
          title={onlyPending ? 'No hay preguntas sin responder' : 'Todavía no hay preguntas'}
          description="Cuando alguien pregunte por una pieza, te va a aparecer acá."
        />
      ) : (
        <ul className="space-y-3">
          {questions.map((question) => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </ul>
      )}
    </div>
  )
}
