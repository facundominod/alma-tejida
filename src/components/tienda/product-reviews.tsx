import { Star } from 'lucide-react'
import { Badge, EmptyState, StarRating } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'
import { formatDate } from '@/lib/utils'
import type { Review } from '@/types/database'

/**
 * Reseñas (puntos 80-83).
 *
 * Solo aparecen las aprobadas, y solo puede escribirlas quien compro: la
 * policy de RLS exige un pedido cobrado del usuario con ese producto.
 *
 * Una crítica negativa no se oculta por ser negativa. Si se oculta, la base
 * exige escribir el motivo (punto 82).
 */
export function ProductReviews({
  reviews,
  ratingAvg,
  ratingCount,
}: {
  reviews: Array<Review & { author: string }>
  ratingAvg: number
  ratingCount: number
}) {
  const approved = reviews.filter((r) => r.status === 'approved')
  const mine = reviews.filter((r) => r.status === 'pending')

  // Distribución de estrellas, para leer de un vistazo si el 4,8 viene de
  // muchas opiniones parejas o de dos extremos.
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: approved.filter((r) => r.rating === stars).length,
  }))

  return (
    <section aria-labelledby="titulo-resenas">
      <h2 id="titulo-resenas" className="mb-5 font-display text-2xl">
        Reseñas
      </h2>

      {ratingCount > 0 && (
        <div className="mb-8 flex flex-col gap-6 rounded-xl border border-border-soft bg-surface p-5 sm:flex-row sm:items-center">
          <div className="text-center sm:w-36 sm:shrink-0">
            <p className="tabular font-display text-4xl text-linen-900">
              {ratingAvg.toFixed(1).replace('.', ',')}
            </p>
            <StarRating
              value={ratingAvg}
              showValue={false}
              size={16}
              className="mt-1 justify-center"
            />
            <p className="mt-1 text-xs text-ink-subtle">
              {ratingCount} {ratingCount === 1 ? 'reseña' : 'reseñas'}
            </p>
          </div>

          <div className="flex-1 space-y-1.5">
            {distribution.map(({ stars, count }) => {
              const percent = approved.length ? (count / approved.length) * 100 : 0
              return (
                <div key={stars} className="flex items-center gap-2 text-xs">
                  <span className="tabular flex w-8 items-center gap-0.5 text-ink-subtle">
                    {stars}
                    <Star className="size-3 fill-wood-500 text-wood-500" />
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-wood-400"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="tabular w-6 text-right text-ink-subtle">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mb-6 space-y-3">
          {mine.map((review) => (
            <div
              key={review.id}
              className="rounded-lg border border-border-soft bg-surface-muted/60 px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <StarRating value={review.rating} showValue={false} size={14} />
                <Badge tone="neutral" size="sm">
                  Esperando moderación
                </Badge>
              </div>
              {review.body && (
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink">
                  {review.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {approved.length > 0 ? (
        <ul className="divide-y divide-border-soft">
          {approved.map((review) => (
            <li key={review.id} className="py-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StarRating value={review.rating} showValue={false} size={14} />
                <span className="text-sm font-medium text-ink">{review.author}</span>
                <Badge tone="success" size="sm">
                  Compra verificada
                </Badge>
                <span className="text-xs text-ink-subtle">
                  {formatDate(review.created_at)}
                </span>
              </div>

              {review.body && (
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {review.body}
                </p>
              )}

              {review.admin_reply && (
                <div className="mt-3 border-l-2 border-clay-200 pl-3.5">
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {review.admin_reply}
                  </p>
                  <p className="mt-1 text-xs text-ink-subtle">Alma Tejida</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        mine.length === 0 && (
          <EmptyState
            icon={<Star className="size-8" strokeWidth={1.3} />}
            title={COPY.emptyReviews}
            description="Las reseñas las escriben quienes ya recibieron su pedido."
            className="py-10"
          />
        )
      )}
    </section>
  )
}
