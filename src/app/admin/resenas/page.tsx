import Link from 'next/link'
import { Star } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import { ReviewCard } from '@/components/admin/moderation'
import { EmptyState } from '@/components/ui/primitives'
import { getAdminReviews } from '@/lib/queries/admin'

export const metadata = { title: 'Reseñas' }

export default async function AdminResenasPage({
  searchParams,
}: PageProps<'/admin/resenas'>) {
  const params = await searchParams
  const onlyPending = params.filtro === 'pendientes'
  const reviews = await getAdminReviews(onlyPending)
  const pending = reviews.filter((r) => r.status === 'pending').length

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Reseñas"
        description="Solo las escribe quien compro. Una crítica negativa no se oculta por serlo."
      />

      <div className="mb-5 flex gap-2">
        <Link
          href="/admin/resenas"
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
          href="/admin/resenas?filtro=pendientes"
          aria-current={onlyPending ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors ${
            onlyPending
              ? 'border-clay-300 bg-primary-soft font-medium text-clay-700'
              : 'border-border-soft bg-surface text-ink-muted'
          }`}
        >
          Sin moderar
          {pending > 0 && <span className="tabular text-xs opacity-70">{pending}</span>}
        </Link>
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          icon={<Star className="size-10" strokeWidth={1.3} />}
          title={onlyPending ? 'No hay reseñas sin moderar' : 'Todavía no hay reseñas'}
          description="Aparecen cuando alguien que ya recibio su pedido escribe una."
        />
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}
    </div>
  )
}
