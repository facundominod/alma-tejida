'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, Percent, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/field'
import { Overline } from '@/components/ui/primitives'
import { Ovillo } from '@/components/ui/ovillo'
import { aplicarDescuentoMasivo, redondearPreciosMasivo } from '@/lib/actions/admin/catalog'
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
          <h2 className="font-display text-base text-ink">Cambios en varias piezas</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Dos operaciones que se aplican de una vez. Ninguna tiene vuelta atrás, así que
            cada una dice antes a cuántas piezas va a tocar.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </div>

      <Overline>Descuento por transferencia</Overline>

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

      <hr className="border-border-soft" />

      <RedondearA99 alcance={alcance} categoria={categoria} />
    </div>
  )
}

/**
 * Dejar los precios terminados en 99.
 *
 * Comparte el alcance con el bloque de arriba —la misma categoría elegida— para
 * que no haya dos selectores que digan cosas distintas en el mismo panel.
 *
 * LO QUE INFORMA DESPUÉS
 * Las tres cuentas, no sólo la buena. Las que no se tocaron porque tienen
 * precio provisorio, y las que hay que resolver a mano porque su precio de
 * lista y su precio promocional caen en la misma centena. Una tanda que saltea
 * cosas sin decirlo se lee como "ya está todo", y el precio equivocado se
 * descubre cobrando.
 */
function RedondearA99({
  alcance,
  categoria,
}: {
  alcance: string
  categoria: string
}) {
  const router = useRouter()
  const [pendiente, setPendiente] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [combinaciones, setCombinaciones] = React.useState(true)
  const [resultado, setResultado] = React.useState<{
    cambiadas: number
    combinaciones: number
    salteadas: number
    enConflicto: string[]
  } | null>(null)

  async function aplicar() {
    setPendiente(true)
    setError(null)
    setResultado(null)

    const r = await redondearPreciosMasivo({
      categoryId: categoria || null,
      incluirCombinaciones: combinaciones,
    })

    setPendiente(false)

    if (!r.ok) {
      setError(r.error)
      return
    }

    setResultado({
      cambiadas: r.cambiadas,
      combinaciones: r.combinaciones,
      salteadas: r.salteadas,
      enConflicto: r.enConflicto,
    })
    router.refresh()
  }

  return (
    <div className="space-y-3.5">
      <Overline>Precios terminados en 99</Overline>
      <p className="text-sm text-ink-muted">
        Redondea el precio de lista a la centena más cercana y le resta uno:{' '}
        <span className="tabular">$45.760</span> queda en{' '}
        <span className="tabular font-medium text-ink">$45.799</span>. Nunca mueve un precio
        más de cincuenta pesos.
      </p>

      <Checkbox
        label="También los precios propios de cada combinación"
        description="Los respaldos tienen un precio por cada ancho y diseño. Sin esto, sólo se toca el precio de la pieza."
        checked={combinaciones}
        onChange={(e) => setCombinaciones(e.target.checked)}
      />

      <p className="rounded-lg bg-surface-muted px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted">
        Las piezas con precio menor a <span className="tabular">$1.000</span> no se tocan.
        Hoy hay varias cargadas en <span className="tabular">$1</span> como valor provisorio, y
        redondearlas las dejaría en <span className="tabular">$99</span>.
      </p>

      {error && <FormError>{error}</FormError>}

      {resultado && (
        <div className="space-y-1.5 text-sm">
          <p className="flex items-center gap-2 text-sage-600">
            <Check className="size-4" aria-hidden="true" />
            {resultado.cambiadas === 0 && resultado.combinaciones === 0
              ? 'No había ningún precio para redondear.'
              : `Listo: ${resultado.cambiadas} ${resultado.cambiadas === 1 ? 'pieza' : 'piezas'}` +
                (resultado.combinaciones > 0
                  ? ` y ${resultado.combinaciones} ${resultado.combinaciones === 1 ? 'combinación' : 'combinaciones'}`
                  : '') +
                '.'}
          </p>
          {resultado.salteadas > 0 && (
            <p className="text-ink-muted">
              {resultado.salteadas} sin tocar: ya terminaban en 99 o tienen precio provisorio.
            </p>
          )}
          {resultado.enConflicto.length > 0 && (
            <p className="text-warning">
              Estas hay que verlas a mano, porque su precio promocional queda pegado al de
              lista: {resultado.enConflicto.join(', ')}.
            </p>
          )}
        </div>
      )}

      <Button variant="secondary" onClick={aplicar} disabled={pendiente}>
        {pendiente ? <Ovillo /> : <Tag />}
        Redondear los precios de {alcance}
      </Button>
    </div>
  )
}
