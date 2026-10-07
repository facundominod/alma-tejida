'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Overline } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/database'

/**
 * Filtros del catálogo.
 *
 * El estado vive en la URL, no en React. Eso hace que un filtro se pueda
 * compartir, guardar en favoritos y que el botón "atras" del navegador haga
 * lo que la gente espera.
 *
 * En desktop es una barra lateral fija; en móvil, un panel que sube desde
 * abajo, que es donde esta el pulgar.
 */

const SORTS = [
  { value: 'novedades', label: 'Más nuevas' },
  { value: 'precio-asc', label: 'Precio: menor a mayor' },
  { value: 'precio-desc', label: 'Precio: mayor a menor' },
  { value: 'mejor-valorados', label: 'Mejor valoradas' },
  { value: 'nombre', label: 'Nombre' },
] as const

export function CatalogFilters({
  categories,
  total,
  /** Cuando se navega dentro de una categoría, el filtro de categoría sobra */
  lockedCategory,
}: {
  categories: Category[]
  total: number
  lockedCategory?: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [searchDraft, setSearchDraft] = React.useState(params.get('buscar') ?? '')

  const current = {
    categoría: params.get('categoría') ?? '',
    orden: params.get('orden') ?? 'novedades',
    disponibles: params.get('disponibles') === '1',
    oferta: params.get('oferta') === '1',
    min: params.get('min') ?? '',
    max: params.get('max') ?? '',
    buscar: params.get('buscar') ?? '',
  }

  const activeCount =
    (current.categoría && !lockedCategory ? 1 : 0) +
    (current.disponibles ? 1 : 0) +
    (current.oferta ? 1 : 0) +
    (current.min || current.max ? 1 : 0)

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      // Cualquier cambio de filtro vuelve a la primera página
      next.delete('página')
      router.push(`?${next.toString()}`, { scroll: false })
    },
    [params, router],
  )

  const clearAll = () => {
    const next = new URLSearchParams()
    if (lockedCategory) next.set('categoría', lockedCategory)
    setSearchDraft('')
    router.push(next.toString() ? `?${next.toString()}` : '?', { scroll: false })
  }

  function onSearchSubmit(event: React.FormEvent) {
    event.preventDefault()
    update({ buscar: searchDraft.trim() || null })
    setPanelOpen(false)
  }

  const panelContent = (
    <div className="space-y-7">
      {!lockedCategory && categories.length > 0 && (
        <FilterGroup title="Categoría">
          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={!current.categoría}
              onClick={() => update({ categoría: null })}
            >
              Todas
            </FilterChip>
            {categories.map((category) => (
              <FilterChip
                key={category.id}
                active={current.categoría === category.slug}
                onClick={() =>
                  update({
                    categoría: current.categoría === category.slug ? null : category.slug,
                  })
                }
              >
                {category.name}
              </FilterChip>
            ))}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title="Precio">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Desde"
            defaultValue={current.min}
            onBlur={(e) => update({ min: e.target.value || null })}
            className="tabular h-11 w-full rounded-lg border border-border-soft bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-clay-500/25"
            aria-label="Precio mínimo"
          />
          <span className="text-ink-subtle">—</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Hasta"
            defaultValue={current.max}
            onBlur={(e) => update({ max: e.target.value || null })}
            className="tabular h-11 w-full rounded-lg border border-border-soft bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-clay-500/25"
            aria-label="Precio máximo"
          />
        </div>
      </FilterGroup>

      <FilterGroup title="Disponibilidad">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={current.disponibles}
            onClick={() => update({ disponibles: current.disponibles ? null : '1' })}
          >
            Solo disponibles
          </FilterChip>
          <FilterChip
            active={current.oferta}
            onClick={() => update({ oferta: current.oferta ? null : '1' })}
          >
            En oferta
          </FilterChip>
        </div>
      </FilterGroup>

      <FilterGroup title="Ordenar por">
        <div className="flex flex-col gap-1">
          {SORTS.map((sort) => (
            <button
              key={sort.value}
              type="button"
              onClick={() => update({ orden: sort.value })}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm transition-colors',
                current.orden === sort.value
                  ? 'bg-primary-soft font-medium text-clay-700'
                  : 'text-ink-muted hover:bg-surface-muted',
              )}
              aria-pressed={current.orden === sort.value}
            >
              {sort.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      {activeCount > 0 && (
        <Button variant="ghost" block onClick={clearAll}>
          Limpiar filtros
        </Button>
      )}
    </div>
  )

  return (
    <>
      {/* Buscador: siempre visible, en las dos medidas */}
      <form onSubmit={onSearchSubmit} className="relative mb-6" role="search">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-linen-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Buscar respaldos, espejos, tapices..."
          aria-label="Buscar en la tienda"
          className="h-12 w-full rounded-lg border border-border-soft bg-surface pl-11 pr-24 text-[0.9375rem] placeholder:text-linen-400 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-clay-500/25"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {current.buscar && (
            <button
              type="button"
              onClick={() => {
                setSearchDraft('')
                update({ buscar: null })
              }}
              className="grid size-9 place-items-center rounded-md text-ink-subtle hover:bg-surface-muted"
              aria-label="Limpiar busqueda"
            >
              <X className="size-4" />
            </button>
          )}
          <Button type="submit" size="sm">
            Buscar
          </Button>
        </div>
      </form>

      {/* Barra de control en móvil */}
      <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
        <p className="text-sm text-ink-muted">
          <span className="tabular font-medium text-ink">{total}</span>{' '}
          {total === 1 ? 'pieza' : 'piezas'}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setPanelOpen(true)}>
          <SlidersHorizontal />
          Filtrar
          {activeCount > 0 && (
            <Badge tone="primary" size="sm" className="ml-0.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Barra lateral en desktop */}
      <aside className="hidden lg:block" aria-label="Filtros">
        {panelContent}
      </aside>

      {/* Panel inferior en móvil */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-linen-900/30 backdrop-blur-[2px]"
            onClick={() => setPanelOpen(false)}
            aria-label="Cerrar filtros"
            tabIndex={-1}
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-5 shadow-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl">Filtrar</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="-mr-2 grid size-11 place-items-center rounded-lg text-ink-muted"
                aria-label="Cerrar filtros"
              >
                <X className="size-5" />
              </button>
            </div>
            {panelContent}
            <Button block size="lg" className="mt-6" onClick={() => setPanelOpen(false)}>
              Ver {total} {total === 1 ? 'pieza' : 'piezas'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <Overline>{title}</Overline>
      {children}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3.5 py-2 text-sm transition-colors',
        active
          ? 'border-clay-300 bg-primary-soft font-medium text-clay-700'
          : 'border-border-soft bg-surface text-ink-muted hover:border-border-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
