import Link from 'next/link'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState, StarRating } from '@/components/ui/primitives'
import { getMyReviews } from '@/lib/queries/account'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Mis reseñas' }

export default async function MisResenasPage() {
  const reviews = await getMyReviews()

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<Star className="size-10" strokeWidth={1.3} />}
        title="Todavía no escribiste ninguna reseña"
        description="Cuando recibas un pedido vas a poder contarnos que te pareció."
        action={
          <Button asChild variant="secondary">
            <Link href="/cuenta/pedidos">Ver mis pedidos</Link>
          </Button>
        }
      />
    )
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li
          key={review.id}
          className="space-y-2 rounded-xl border border-border-soft bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            {review.products ? (
              <Link
                href={`/producto/${review.products.slug}`}
                className="font-medium text-ink hover:text-clay-700"
              >
                {review.products.name}
              </Link>
            ) : (
              <span className="font-medium text-ink">Producto</span>
            )}
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
                  ? 'No publicada'
                  : 'Esperando moderación'}
            </Badge>
          </div>

          <StarRating value={review.rating} showValue={false} size={14} />
          {review.body && <p className="text-[0.9375rem] text-ink">{review.body}</p>}
          <p className="text-xs text-ink-subtle">{formatDate(review.created_at)}</p>

          {review.admin_reply && (
            <div className="border-l-2 border-clay-200 pl-3.5">
              <p className="text-sm leading-relaxed text-ink-muted">{review.admin_reply}</p>
              <p className="mt-1 text-xs text-ink-subtle">Alma Tejida</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
