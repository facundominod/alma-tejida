import { cva, type VariantProps } from 'class-variance-authority'
import { Star } from 'lucide-react'
import * as React from 'react'
import { cn, formatPrice } from '@/lib/utils'

/* =============================================================================
   BADGE
   ========================================================================== */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-ink-muted',
        primary: 'bg-primary-soft text-clay-700',
        success: 'bg-sage-100 text-sage-600',
        warning: 'bg-[color-mix(in_srgb,var(--color-warning)_14%,white)] text-[#8d6320]',
        danger: 'bg-[color-mix(in_srgb,var(--color-danger)_12%,white)] text-danger',
        sale: 'bg-sale-100 text-sale-500',
        wood: 'bg-[color-mix(in_srgb,var(--color-wood-400)_20%,white)] text-[#8a6330]',
      },
      size: {
        sm: 'px-2 py-0.5 text-[0.6875rem]',
        md: 'px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

export function Badge({
  className,
  tone,
  size,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
}

/* =============================================================================
   OVERLINE
   El gesto tipografico del sello: mayúsculas con tracking amplio, como la
   palabra TEJIDA del logo. Es lo que hace que web y marca se reconozcan.
   ========================================================================== */
export function Overline({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-ink-subtle',
        className,
      )}
      {...props}
    />
  )
}

/* =============================================================================
   PRECIO
   El precio anterior no depende solo del color: está tachado, es más chico y
   lleva texto para lectores de pantalla.
   ========================================================================== */
export function Price({
  final,
  list,
  from = false,
  size = 'md',
  className,
}: {
  final: number | string | null
  list?: number | string | null
  /** "desde $X" cuando las variantes tienen precios distintos */
  from?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const finalNum = Number(final ?? 0)
  const listNum = list == null ? null : Number(list)
  const hasDiscount = listNum != null && listNum > finalNum

  const sizes = {
    sm: { main: 'text-[0.9375rem]', old: 'text-xs' },
    md: { main: 'text-lg', old: 'text-sm' },
    lg: { main: 'text-3xl', old: 'text-base' },
  }[size]

  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      {from && <span className="text-xs text-ink-subtle">desde</span>}
      <span
        className={cn(
          'tabular font-semibold',
          sizes.main,
          hasDiscount ? 'text-sale' : 'text-ink',
        )}
      >
        {formatPrice(finalNum)}
      </span>
      {hasDiscount && (
        <span className={cn('tabular text-ink-subtle line-through', sizes.old)}>
          <span className="sr-only">Precio anterior: </span>
          {formatPrice(listNum)}
        </span>
      )}
    </span>
  )
}

/* =============================================================================
   ESTRELLAS
   ========================================================================== */
export function StarRating({
  value,
  count,
  size = 14,
  showValue = true,
  className,
}: {
  value: number
  count?: number
  size?: number
  showValue?: boolean
  className?: string
}) {
  const rounded = Math.round(value * 2) / 2

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            width={size}
            height={size}
            className={cn(
              i <= rounded
                ? 'fill-wood-500 text-wood-500'
                : i - 0.5 === rounded
                  ? 'fill-wood-300 text-wood-500'
                  : 'fill-transparent text-linen-300',
            )}
          />
        ))}
      </span>
      {showValue && (
        <span className="tabular text-sm text-ink-muted">
          {value.toFixed(1).replace('.', ',')}
          {count != null && <span className="text-ink-subtle"> ({count})</span>}
        </span>
      )}
      <span className="sr-only">
        {value.toFixed(1)} de 5 estrellas
        {count != null ? `, ${count} reseñas` : ''}
      </span>
    </span>
  )
}

/* =============================================================================
   SEPARADOR DE HILO
   Una línea ondulada de 1px con un nudito en el medio, entre secciones.
   ========================================================================== */
export function ThreadDivider({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center py-2', className)} aria-hidden="true">
      <svg
        width="140"
        height="12"
        viewBox="0 0 140 12"
        fill="none"
        className="text-linen-300"
      >
        <path
          d="M0 6 C 20 6, 28 2, 44 6 S 62 10, 70 6"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M70 6 C 78 2, 90 10, 104 6 S 124 6, 140 6"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <circle cx="70" cy="6" r="2.2" fill="currentColor" opacity="0.7" />
      </svg>
    </div>
  )
}

/* =============================================================================
   LOADER DE HILO
   Un path SVG: un hilo que se dibuja y forma una puntada. Anima
   stroke-dashoffset, que es barato, y pesa menos que cualquier GIF de carga.
   ========================================================================== */
export function ThreadLoader({
  label = 'Cargando',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center gap-3 py-10', className)}
      role="status"
      aria-live="polite"
    >
      <svg width="72" height="24" viewBox="0 0 72 24" fill="none" aria-hidden="true">
        <path
          d="M2 12 C 10 2, 18 22, 26 12 S 42 2, 50 12 S 62 22, 70 12"
          stroke="var(--color-clay-400)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="14 10"
          className="at-loader-thread"
          style={{ animation: 'at-stitch 1.2s linear infinite' }}
        />
      </svg>
      <span className="text-sm text-ink-subtle">{label}</span>
    </div>
  )
}

/* =============================================================================
   ESQUELETO
   ========================================================================== */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-muted',
        // El brillo se mueve con translate3d (compositor), no animando
        // posiciones de fondo, que obligan a repintar.
        'after:absolute after:inset-0 after:bg-gradient-to-r',
        'after:from-transparent after:via-white/55 after:to-transparent',
        'after:animate-[at-shimmer_1.6s_ease-in-out_infinite]',
        'motion-reduce:after:animate-none',
        className,
      )}
      {...props}
    />
  )
}

/* =============================================================================
   ESTADO VACIO
   Nunca una pantalla fria. Siempre con una salida concreta.
   ========================================================================== */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-16 text-center',
        className,
      )}
    >
      {icon && <div className="text-linen-300">{icon}</div>}
      <div className="space-y-1.5">
        <p className="font-display text-xl text-linen-900">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

/* =============================================================================
   TITULO DE SECCION
   ========================================================================== */
export function SectionHeading({
  overline,
  title,
  description,
  action,
  className,
}: {
  overline?: string
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-10',
        className,
      )}
    >
      <div className="space-y-1.5">
        {overline && <Overline>{overline}</Overline>}
        <h2 className="text-display-md">{title}</h2>
        {description && <p className="max-w-xl text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
