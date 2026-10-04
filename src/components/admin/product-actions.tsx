'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Archive, Copy, Eye, EyeOff, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/field'
import {
  deleteProduct,
  duplicateProduct,
  setProductStatus,
} from '@/lib/actions/admin/catalog'
import type { ProductStatus } from '@/types/database'

/**
 * Publicar, despublicar, duplicar, archivar, borrar.
 *
 * Archivar es la acción normal para sacar algo de la tienda; borrar existe
 * pero la base lo rechaza si la pieza tuvo ventas. La historia no se borra
 * (punto 101).
 */
export function ProductActions({
  productId,
  status,
  slug,
}: {
  productId: string
  status: ProductStatus
  slug: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function run(action: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(action)
    setError(null)
    const result = await fn()
    setPending(null)
    setOpen(false)

    if (!result.ok) {
      setError(result.error ?? 'No pudimos completar la acción.')
      return
    }
    router.refresh()
  }

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center gap-2">
        {status === 'published' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending !== null}
            onClick={() =>
              run('unpublish', () => setProductStatus(productId, 'draft'))
            }
          >
            {pending === 'unpublish' ? <Loader2 className="animate-spin" /> : <EyeOff />}
            Despublicar
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() => run('publish', () => setProductStatus(productId, 'published'))}
          >
            {pending === 'publish' ? <Loader2 className="animate-spin" /> : <Eye />}
            Publicar
          </Button>
        )}

        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
          aria-label="Más acciones"
          aria-expanded={open}
        >
          <MoreVertical />
        </Button>
      </div>

      {open && (
        <div
          role="menú"
          className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-border-soft bg-surface py-1 shadow-lifted"
        >
          {status === 'published' && (
            <a
              href={`/producto/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <Eye className="size-4 text-ink-subtle" />
              Ver en la tienda
            </a>
          )}

          <button
            type="button"
            role="menuitem"
            disabled={pending !== null}
            onClick={() =>
              run('duplicate', async () => {
                const result = await duplicateProduct(productId)
                if (result.ok) router.push(`/admin/productos/${result.productId}`)
                return result
              })
            }
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink transition-colors hover:bg-surface-muted"
          >
            {pending === 'duplicate' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Copy className="size-4 text-ink-subtle" />
            )}
            Duplicar
            <span className="ml-auto text-xs text-ink-subtle">sin stock</span>
          </button>

          {status !== 'archived' && (
            <button
              type="button"
              role="menuitem"
              disabled={pending !== null}
              onClick={() =>
                run('archive', () => setProductStatus(productId, 'archived'))
              }
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <Archive className="size-4 text-ink-subtle" />
              Archivar
            </button>
          )}

          <div className="my-1 border-t border-border-soft" />

          {confirmDelete ? (
            <div className="space-y-2 px-3.5 py-2.5">
              <p className="text-xs text-ink-muted">
                Solo se puede borrar si nunca se vendio. Si tuvo ventas, archivala.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  block
                  disabled={pending !== null}
                  onClick={() =>
                    run('delete', async () => {
                      const result = await deleteProduct(productId)
                      if (result.ok) router.push('/admin/productos')
                      return result
                    })
                  }
                >
                  Borrar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-danger transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_7%,white)]"
            >
              <Trash2 className="size-4" />
              Borrar
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-72">
          <FormError>{error}</FormError>
        </div>
      )}
    </div>
  )
}
