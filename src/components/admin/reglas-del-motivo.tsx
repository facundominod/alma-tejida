'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input, Select } from '@/components/ui/field'
import { Overline } from '@/components/ui/primitives'
import { Ovillo } from '@/components/ui/ovillo'
import { guardarReglas, simularOferta } from '@/lib/actions/admin/catalog'
import { formatPrice } from '@/lib/utils'
import type { PromotionRule } from '@/types/database'

/**
 * Las reglas de un motivo, y lo que dejan.
 *
 * QUÉ ES UN MOTIVO
 * "Día de la Madre" no es un descuento: es un paraguas con reglas adentro.
 * 25 % por llevar dos o más, y 15 % más si se paga en efectivo. Cada regla se
 * configura acá y se aplican acumuladas.
 *
 * LA VISTA PREVIA NO CALCULA NADA
 * Le manda las reglas de la pantalla a `precio_con_reglas()`, que es la MISMA
 * función que después cobra. La alternativa —repetir la cuenta en JavaScript
 * para no ir al servidor— empieza dando lo mismo y termina dando distinto, y
 * el día que se separan el panel promete un número y la tienda cobra otro.
 *
 * Por eso cada cambio consulta al servidor. Es un viaje de ida y vuelta por
 * tecla, así que espera a que se deje de escribir.
 */

type Regla = {
  kind: 'cantidad' | 'medio_de_pago'
  minQuantity: number
  paymentMethod: 'transferencia' | 'efectivo' | 'tarjeta'
  paymentMode: 'reemplaza' | 'ademas'
  discountPercent: number
}

type Simulacion = {
  precioBase: number
  precioUnitario: number
  total: number
  descuento: number
  gananciaUnitaria: number | null
  margen: number | null
  aplicadas: Array<{ motivo: string; porcentaje: number }>
  topeAlcanzado: boolean
}

const VACIA: Regla = {
  kind: 'cantidad',
  minQuantity: 2,
  paymentMethod: 'efectivo',
  paymentMode: 'reemplaza',
  discountPercent: 15,
}

function desdeLaBase(filas: PromotionRule[]): Regla[] {
  return filas.map((f) => ({
    kind: f.kind,
    minQuantity: f.min_quantity ?? 2,
    paymentMethod: f.payment_method ?? 'efectivo',
    paymentMode: f.payment_mode,
    discountPercent: Number(f.discount_percent),
  }))
}

export function ReglasDelMotivo({
  promotionId,
  reglasGuardadas,
  productos,
}: {
  promotionId: string
  reglasGuardadas: PromotionRule[]
  productos: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [reglas, setReglas] = React.useState<Regla[]>(() => desdeLaBase(reglasGuardadas))
  const [pendiente, setPendiente] = React.useState(false)
  const [guardado, setGuardado] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // El escenario de la vista previa.
  const [productoId, setProductoId] = React.useState(productos[0]?.id ?? '')
  const [cantidad, setCantidad] = React.useState(2)
  const [medio, setMedio] = React.useState<'transferencia' | 'efectivo' | 'tarjeta'>(
    'efectivo',
  )
  const [simulacion, setSimulacion] = React.useState<Simulacion | null>(null)

  // Espera a que se deje de escribir: cada cambio es una consulta al servidor.
  React.useEffect(() => {
    if (!productoId) return

    const espera = window.setTimeout(async () => {
      const r = await simularOferta({ productId: productoId, cantidad, medioDePago: medio, reglas })
      setSimulacion(r.ok ? r : null)
    }, 400)

    return () => window.clearTimeout(espera)
  }, [productoId, cantidad, medio, reglas])

  function cambiar(i: number, cambios: Partial<Regla>) {
    setReglas((previas) => previas.map((r, j) => (j === i ? { ...r, ...cambios } : r)))
  }

  async function guardar() {
    setPendiente(true)
    setError(null)

    const r = await guardarReglas({ promotionId, reglas })

    setPendiente(false)
    if (!r.ok) {
      setError(r.error)
      return
    }

    setGuardado(true)
    window.setTimeout(() => setGuardado(false), 2500)
    router.refresh()
  }

  return (
    <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
      <div>
        <Overline>Reglas de este motivo</Overline>
        <p className="mt-1 text-sm text-ink-muted">
          Se aplican acumuladas sobre el precio de la pieza. Abajo ves, en vivo, cuánto
          cobrás y cuánto te queda.
        </p>
      </div>

      {reglas.length === 0 && (
        <p className="rounded-lg bg-surface-muted px-3.5 py-3 text-sm text-ink-muted">
          Sin reglas, este motivo sólo sirve como cartel en la portada.
        </p>
      )}

      <ul className="space-y-3">
        {reglas.map((regla, i) => (
          <li
            key={i}
            className="space-y-3 rounded-lg border border-border-soft bg-surface-muted/50 p-3.5"
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Cuándo se aplica">
                {(props) => (
                  <Select
                    {...props}
                    value={regla.kind}
                    onChange={(e) =>
                      cambiar(i, { kind: e.target.value as Regla['kind'] })
                    }
                  >
                    <option value="cantidad">Por cantidad</option>
                    <option value="medio_de_pago">Por medio de pago</option>
                  </Select>
                )}
              </Field>

              {regla.kind === 'cantidad' ? (
                <Field label="Llevando" hint="o más">
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={99}
                      value={regla.minQuantity}
                      onChange={(e) =>
                        cambiar(i, { minQuantity: Number(e.target.value) || 2 })
                      }
                      className="tabular w-24"
                    />
                  )}
                </Field>
              ) : (
                <Field label="Pagando con">
                  {(props) => (
                    <Select
                      {...props}
                      value={regla.paymentMethod}
                      onChange={(e) =>
                        cambiar(i, {
                          paymentMethod: e.target.value as Regla['paymentMethod'],
                        })
                      }
                    >
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                    </Select>
                  )}
                </Field>
              )}

              <Field label="Descuento" hint="%">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    max={99.99}
                    step={0.5}
                    value={regla.discountPercent}
                    onChange={(e) =>
                      cambiar(i, { discountPercent: Number(e.target.value) || 0 })
                    }
                    className="tabular w-24"
                  />
                )}
              </Field>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setReglas((p) => p.filter((_, j) => j !== i))}
                aria-label="Quitar esta regla"
              >
                <Trash2 />
              </Button>
            </div>

            {/* La decisión que más plata mueve de toda esta pantalla. */}
            {regla.kind === 'medio_de_pago' && (
              <Field
                label="Con el descuento de contado de siempre"
                hint="El habitual es el que tenés en Configuración."
              >
                {(props) => (
                  <Select
                    {...props}
                    value={regla.paymentMode}
                    onChange={(e) =>
                      cambiar(i, { paymentMode: e.target.value as Regla['paymentMode'] })
                    }
                  >
                    <option value="reemplaza">
                      En lugar del habitual (gana el que más convenga)
                    </option>
                    <option value="ademas">Además del habitual (se acumulan)</option>
                  </Select>
                )}
              </Field>
            )}
          </li>
        ))}
      </ul>

      <Button variant="secondary" size="sm" onClick={() => setReglas((p) => [...p, VACIA])}>
        <Plus />
        Agregar una regla
      </Button>

      {/* ========================= LO QUE DEJA ========================= */}
      <div className="space-y-3 rounded-lg border border-border-soft bg-background p-3.5">
        <Overline>Qué pasa si alguien compra</Overline>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Pieza">
            {(props) => (
              <Select
                {...props}
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
              >
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Lleva">
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value) || 1)}
                className="tabular"
              />
            )}
          </Field>

          <Field label="Y paga con">
            {(props) => (
              <Select
                {...props}
                value={medio}
                onChange={(e) => setMedio(e.target.value as typeof medio)}
              >
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
              </Select>
            )}
          </Field>
        </div>

        {simulacion ? (
          <dl className="space-y-1.5 text-sm">
            <Renglon titulo="Precio de la pieza" valor={formatPrice(simulacion.precioBase)} />

            {simulacion.aplicadas.map((a, i) => (
              <Renglon
                key={i}
                titulo={a.motivo}
                valor={`−${a.porcentaje}%`}
                tono="descuento"
              />
            ))}

            <Renglon
              titulo="Paga por unidad"
              valor={formatPrice(simulacion.precioUnitario)}
              fuerte
            />

            {cantidad > 1 && (
              <Renglon
                titulo={`Lo que cobrás por ${cantidad}`}
                valor={formatPrice(simulacion.total)}
                fuerte
              />
            )}

            {simulacion.gananciaUnitaria != null ? (
              <Renglon
                titulo="Te queda por unidad"
                valor={`${formatPrice(simulacion.gananciaUnitaria)} · ${simulacion.margen}% de margen`}
                tono={simulacion.gananciaUnitaria > 0 ? 'ganancia' : 'perdida'}
              />
            ) : (
              <p className="pt-1 text-xs text-ink-subtle">
                Esta pieza no tiene costo cargado, así que no puedo decirte la ganancia.
              </p>
            )}

            {simulacion.topeAlcanzado && (
              <p className="rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning">
                Las reglas juntas pasaban el tope de descuento de la tienda, así que se
                frenó ahí. El tope se cambia en Configuración.
              </p>
            )}
          </dl>
        ) : (
          <p className="text-sm text-ink-subtle">
            {productos.length === 0
              ? 'Cargá una pieza para poder simular.'
              : 'Calculando...'}
          </p>
        )}
      </div>

      {error && <FormError>{error}</FormError>}

      <Button onClick={guardar} disabled={pendiente}>
        {pendiente ? <Ovillo /> : guardado ? <Check /> : null}
        {guardado ? 'Guardadas' : 'Guardar las reglas'}
      </Button>
    </div>
  )
}

function Renglon({
  titulo,
  valor,
  fuerte = false,
  tono,
}: {
  titulo: string
  valor: string
  fuerte?: boolean
  tono?: 'descuento' | 'ganancia' | 'perdida'
}) {
  const color =
    tono === 'descuento'
      ? 'text-sale'
      : tono === 'ganancia'
        ? 'text-sage-600'
        : tono === 'perdida'
          ? 'text-danger'
          : 'text-ink'

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="text-ink-muted">{titulo}</dt>
      <dd className={`tabular ${fuerte ? 'text-base font-semibold' : ''} ${color}`}>
        {valor}
      </dd>
    </div>
  )
}
