'use client'

import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'
import { AlertTriangle, Check, ImageOff, Minus, Plus, Search, Undo2, X } from 'lucide-react'
import type { StockRow } from '@/app/admin/stock/page'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { Field, Input, Select } from '@/components/ui/field'
import { adjustStock } from '@/lib/actions/admin/operations'
import { storageUrl } from '@/lib/images'
import { cn } from '@/lib/utils'

/**
 * Tablero de stock.
 *
 * +1 y +5 aplican al instante con actualización optimista y un "deshacer" de
 * 5 segundos: sumar es barato de equivocarse y barato de arreglar.
 *
 * −1 y "Ajustar" piden confirmación, porque RESTAR es lo que duele si se toca
 * sin querer (punto 131).
 *
 * Nada de esto escribe stock directo: todo pasa por adjust_stock(), que deja
 * su movimiento de inventario en la misma transacción.
 */
export function StockBoard({
  rows,
  initialSearch,
}: {
  rows: StockRow[]
  initialSearch: string
}) {
  const [search, setSearch] = React.useState(initialSearch)
  const [onlyLow, setOnlyLow] = React.useState(false)
  const [state, setState] = React.useState<Record<string, { stock: number; available: number }>>(
    {},
  )
  const [busy, setBusy] = React.useState<string | null>(null)
  const [undo, setUndo] = React.useState<{
    variantId: string
    delta: number
    name: string
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [adjusting, setAdjusting] = React.useState<StockRow | null>(null)
  const undoTimer = React.useRef<number | undefined>(undefined)

  const visible = rows.filter((row) => {
    if (onlyLow) {
      const available = state[row.variant_id]?.available ?? row.available
      if (available > row.threshold) return false
    }
    if (!search.trim()) return true
    const haystack =
      `${row.product_name} ${row.variant_label ?? ''} ${row.sku ?? ''}`.toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  })

  async function apply(row: StockRow, delta: number, type: 'restock' | 'adjustment') {
    setBusy(row.variant_id)
    setError(null)

    const result = await adjustStock({
      variantId: row.variant_id,
      delta,
      type,
      note: delta > 0 ? 'Ingreso desde el panel' : 'Ajuste desde el panel',
    })

    setBusy(null)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setState((current) => ({
      ...current,
      [row.variant_id]: { stock: result.stock, available: result.available },
    }))

    // El deshacer solo aparece para sumas: restar ya paso por confirmación.
    if (delta > 0) {
      window.clearTimeout(undoTimer.current)
      setUndo({ variantId: row.variant_id, delta, name: row.product_name })
      undoTimer.current = window.setTimeout(() => setUndo(null), 5000)
    }
  }

  async function undoLast() {
    if (!undo) return
    const row = rows.find((r) => r.variant_id === undo.variantId)
    if (!row) return

    setUndo(null)
    window.clearTimeout(undoTimer.current)
    await apply(row, -undo.delta, 'adjustment')
  }

  return (
    <div className="space-y-4">
      {/* Buscador y filtro */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-linen-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pieza, variante o SKU"
            aria-label="Buscar en el stock"
            className="h-11 w-full rounded-lg border border-border-soft bg-surface pl-11 pr-3 text-[0.9375rem] focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-clay-500/25"
          />
        </div>
        <Button
          variant={onlyLow ? 'soft' : 'secondary'}
          onClick={() => setOnlyLow((v) => !v)}
          aria-pressed={onlyLow}
        >
          <AlertTriangle />
          Solo stock bajo
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-[color-mix(in_srgb,var(--color-danger)_7%,white)] px-3.5 py-2.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={search ? 'No encontramos esa pieza' : 'No hay variantes activas'}
          description={
            onlyLow
              ? 'Ninguna pieza está por debajo de su umbral. Buena señal.'
              : 'Carga una pieza para empezar a manejar stock.'
          }
          action={
            <Button asChild variant="secondary">
              <Link href="/admin/productos/nuevo">Cargar una pieza</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const stock = state[row.variant_id]?.stock ?? row.stock
            const available = state[row.variant_id]?.available ?? row.available
            const low = available <= row.threshold
            const image = storageUrl(row.image)
            const isBusy = busy === row.variant_id

            return (
              <li
                key={row.variant_id}
                className={cn(
                  'rounded-xl border bg-surface p-3 transition-colors',
                  low ? 'border-warning/35' : 'border-border-soft',
                )}
              >
                <div className="flex gap-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                    {image ? (
                      <Image
                        src={image}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-linen-300">
                        <ImageOff className="size-5" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/productos/${row.product_id}`}
                          className="block truncate font-medium text-ink hover:text-clay-700"
                        >
                          {row.product_name}
                        </Link>
                        {row.variant_label && (
                          <p className="truncate text-sm text-ink-subtle">
                            {row.variant_label}
                          </p>
                        )}
                      </div>
                      {row.status !== 'published' && (
                        <Badge tone="neutral" size="sm">
                          {row.status === 'draft' ? 'Borrador' : 'Archivado'}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1 text-sm">
                      <span
                        className={cn(
                          'tabular font-semibold',
                          available === 0
                            ? 'text-danger'
                            : low
                              ? 'text-warning'
                              : 'text-ink',
                        )}
                        aria-live="polite"
                      >
                        {available} disponibles
                      </span>
                      <span className="tabular text-ink-subtle">
                        {' '}
                        · stock {stock}
                        {row.reserved > 0 && ` · reservado ${row.reserved}`}
                      </span>
                    </p>
                    {low && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-warning">
                        <AlertTriangle className="size-3" />
                        Por debajo del umbral ({row.threshold})
                      </p>
                    )}
                  </div>
                </div>

                {/* Acciones rápidas, pensadas para el pulgar */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isBusy || stock === 0}
                    onClick={() => setAdjusting({ ...row, stock, available })}
                    aria-label={`Restar una unidad de ${row.product_name}`}
                  >
                    <Minus />1
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={isBusy}
                    onClick={() => apply(row, 1, 'restock')}
                  >
                    <Plus />1
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={isBusy}
                    onClick={() => apply(row, 5, 'restock')}
                  >
                    <Plus />5
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => setAdjusting({ ...row, stock, available })}
                  >
                    Ajustar...
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Deshacer */}
      {undo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-20 z-40 flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface px-4 py-3 shadow-lifted md:left-auto md:right-8 md:bottom-8 md:w-96"
        >
          <p className="min-w-0 truncate text-sm">
            <Check className="mr-1.5 inline size-4 text-sage-500" />
            +{undo.delta} en {undo.name}
          </p>
          <button
            type="button"
            onClick={undoLast}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-clay-700 hover:underline"
          >
            <Undo2 className="size-4" />
            Deshacer
          </button>
        </div>
      )}

      {adjusting && (
        <AdjustDialog
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onConfirm={async (delta, type, note) => {
            setAdjusting(null)
            setBusy(adjusting.variant_id)
            setError(null)

            const result = await adjustStock({
              variantId: adjusting.variant_id,
              delta,
              type,
              note,
            })

            setBusy(null)
            if (!result.ok) {
              setError(result.error)
              return
            }

            setState((current) => ({
              ...current,
              [adjusting.variant_id]: {
                stock: result.stock,
                available: result.available,
              },
            }))
          }}
        />
      )}
    </div>
  )
}

/**
 * Ajuste manual con confirmación.
 * Pide el motivo: un movimiento sin explicación es un número que dentro de
 * tres meses nadie va a poder justificar.
 */
function AdjustDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: StockRow
  onClose: () => void
  onConfirm: (
    delta: number,
    type: 'restock' | 'adjustment' | 'initial',
    note: string,
  ) => void
}) {
  const [amount, setAmount] = React.useState('1')
  const [direction, setDirection] = React.useState<'add' | 'subtract'>('subtract')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const quantity = Math.max(Number(amount) || 0, 0)
  const delta = direction === 'add' ? quantity : -quantity
  const resulting = row.stock + delta
  const invalid = quantity === 0 || resulting < 0 || resulting < row.reserved

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <button
        type="button"
        className="absolute inset-0 bg-linen-900/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ajustar stock de ${row.product_name}`}
        className="relative w-full max-w-md space-y-4 rounded-t-2xl bg-background p-5 shadow-overlay sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl">Ajustar stock</h2>
            <p className="truncate text-sm text-ink-muted">
              {row.product_name}
              {row.variant_label ? ` · ${row.variant_label}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 grid size-10 place-items-center rounded-lg text-ink-muted"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="rounded-lg bg-surface-muted px-3.5 py-2.5 text-sm">
          <p className="tabular">
            Ahora: stock <strong>{row.stock}</strong> · reservado{' '}
            <strong>{row.reserved}</strong> · disponible{' '}
            <strong>{row.available}</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Operación">
            {(props) => (
              <Select
                {...props}
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'add' | 'subtract')}
              >
                <option value="add">Sumar</option>
                <option value="subtract">Restar</option>
              </Select>
            )}
          </Field>

          <Field label="Cantidad">
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <Field
          label="Motivo"
          hint="Queda guardado en el historial. Por ejemplo: rotura, regalo, error de conteo."
        >
          {(props) => (
            <Input
              {...props}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="Error de conteo"
            />
          )}
        </Field>

        {resulting < row.reserved && quantity > 0 && (
          <p role="alert" className="text-sm font-medium text-danger">
            No se puede dejar el stock por debajo de lo ya reservado ({row.reserved}).
          </p>
        )}

        <p className="tabular text-sm text-ink-muted">
          Queda en: <strong className="text-ink">{Math.max(resulting, 0)}</strong>
        </p>

        <div className="flex gap-2">
          <Button variant="secondary" block onClick={onClose}>
            Cancelar
          </Button>
          <Button
            block
            disabled={invalid}
            onClick={() =>
              onConfirm(
                delta,
                direction === 'add' ? 'restock' : 'adjustment',
                reason.trim() || (direction === 'add' ? 'Ingreso' : 'Ajuste'),
              )
            }
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}
