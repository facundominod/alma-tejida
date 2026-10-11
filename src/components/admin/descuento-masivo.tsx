'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/field'
import { Ovillo } from '@/components/ui/ovillo'
import { aplicarDescuentoMasivo } from '@/lib/actions/admin/catalog'
import type { Category } from '@/types/database'

/**
 * Aplicar el descuento por transferencia a muchas piezas de una vez.
 *
 * Va plegado. Es una operación que toca decenas de precios de golpe y no tiene
 * deshacer: dejarla abierta al lado del listado invita a apretarla sin querer.
 *
 * Lo que dice el botón es cuántas piezas va a tocar, no "Aplicar". Antes de una
 * operación así lo que uno quiere saber es el alcance.
 */
export function DescuentoMasivo({
  categories,
  totalPiezas,
}: {
  categories: Category[]
  totalPiezas: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = React.useState(false)
  const [pendiente, setPendiente] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [hecho, setHecho] = React.useState<number | null>(null)

  const [porcentaje, setPorcentaje] = React.useState('20')
  const [categoria, setCategoria] = React.useState('')
  const [pisar, setPisar] = React.useState(false)
  const [limpiar, setLimpiar] = React.useState(false)

  async function aplicar() {
    setPendiente(true)
    setError(null)

    const result = await aplicarDescuentoMasivo({
      porcentaje: limpiar ? undefined : Number(porcentaje),
      categoryId: categoria || null,
      pisarLasQueTienenPropio: pisar,
      volverAlDeLaTienda: limpiar,
    })

    setPendiente(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setHecho(result.piezas)
    router.refresh()
    window.setTimeout(() => setHecho(null), 4000)
  }

  if (!abierto) {
    return (
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
          <Percent />
          Aplicar descuento a varias piezas
        </Button>
      </div>
    )
  }

  const alcance = categoria
    ? (categories.find((c) => c.id === categoria)?.name ?? 'la categoría')
    : `las ${totalPiezas} piezas`

  return (
    <div className="mb-4 space-y-4 rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-base text-ink">Descuento por transferencia en tanda</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Cambia el descuento por transferencia o efectivo. No toca el precio de lista.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Alcance">
          {(props) => (
            <Select
              {...props}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Todas las piezas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {!limpiar && (
          <Field label="Descuento" hint="En porcentaje">
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="decimal"
                min={0}
                max={99.99}
                step={0.01}
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                className="tabular"
              />
            )}
          </Field>
        )}
      </div>

      <Checkbox
        label="Volver al descuento general de la tienda"
        description="Les borra el descuento propio para que vuelvan a seguir el de la tienda. Es la salida si una tanda quedó mal."
        checked={limpiar}
        onChange={(e) => setLimpiar(e.target.checked)}
      />

      {!limpiar && (
        <Checkbox
          label="Pisar también las que tienen su propio descuento"
          description="Destildado, solo toca las que siguen el de la tienda. Esas decisiones las tomaste pieza por pieza y no se borran sin pedirlo."
          checked={pisar}
          onChange={(e) => setPisar(e.target.checked)}
        />
      )}

      {error && <FormError>{error}</FormError>}

      {hecho != null && (
        <p className="flex items-center gap-2 text-sm text-sage-600">
          <Check className="size-4" aria-hidden="true" />
          {hecho === 0
            ? 'No había piezas para cambiar.'
            : `Listo: ${hecho} ${hecho === 1 ? 'pieza' : 'piezas'}.`}
        </p>
      )}

      <Button onClick={aplicar} disabled={pendiente}>
        {pendiente ? <Ovillo /> : null}
        {limpiar ? `Devolver ${alcance} al descuento general` : `Aplicar a ${alcance}`}
      </Button>
    </div>
  )
}
