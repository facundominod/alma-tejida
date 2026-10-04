'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import {
  AlertTriangle,
  Check,
  FileText,
  MessageCircleQuestion,
  ShoppingCart,
  Star,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/actions/admin/operations'
import { cn, formatRelative } from '@/lib/utils'
import type { Notification } from '@/types/database'

const ICONS: Record<string, typeof ShoppingCart> = {
  order_created: ShoppingCart,
  order_cancelled: X,
  question_asked: MessageCircleQuestion,
  review_created: Star,
  low_stock: AlertTriangle,
  payment_proof: FileText,
}

export function NotificationRow({
  notification,
  nested = false,
}: {
  notification: Notification
  nested?: boolean
}) {
  const router = useRouter()
  const [read, setRead] = React.useState(Boolean(notification.read_at))
  const Icon = ICONS[notification.type] ?? ShoppingCart

  async function open() {
    if (!read) {
      setRead(true)
      await markNotificationRead(notification.id)
      router.refresh()
    }
  }

  const content = (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          read ? 'bg-surface-muted text-linen-400' : 'bg-primary-soft text-clay-700',
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', read ? 'text-ink-muted' : 'font-medium text-ink')}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="truncate text-xs text-ink-subtle">{notification.body}</p>
        )}
        <p className="mt-0.5 text-xs text-ink-subtle">
          {formatRelative(notification.created_at)}
        </p>
      </div>

      {!read && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          aria-label="Sin leer"
        />
      )}
    </div>
  )

  const className = cn(
    'block w-full text-left transition-colors',
    nested ? 'p-3.5 hover:bg-surface-muted/60' : 'rounded-xl border bg-surface p-3.5',
    !nested && (read ? 'border-border-soft' : 'border-clay-200'),
    !nested && 'hover:border-clay-300',
  )

  return notification.link ? (
    <Link href={notification.link} onClick={open} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={open} className={className}>
      {content}
    </button>
  )
}

export function MarkAllRead() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await markAllNotificationsRead()
        setPending(false)
        router.refresh()
      }}
    >
      <Check />
      Marcar todo como leido
    </Button>
  )
}
