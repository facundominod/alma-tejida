'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn, formatPrice } from '@/lib/utils'

/**
 * Gráficos del panel.
 *
 * Tres decisiones que vienen de validar la paleta, no del gusto:
 *
 * 1. TODOS los gráficos son de UNA sola serie. La paleta de Alma Tejida es
 *    deliberadamente apagada y de baja saturación, y eso la hace inservible
 *    como paleta categorica: clay y sage quedan a ΔE 1.3 en protanopia, o sea
 *    indistinguibles. En lugar de meter colores ajenos a la marca, se usan
 *    gráficos separados (small múltiples). Nunca dos escalas en un mismo eje.
 *
 * 2. Los números grandes van en Inter, no en la serif de títulos: una serif en
 *    una cifra se lee como decoración, no como dato.
 *
 * 3. La rampa del embudo (#C9907A → #7E5142) está validada como rampa ordinal:
 *    monotona en luminosidad, un solo tono, y el extremo claro separado del
 *    fondo. El embudo SI tiene orden natural, así que la rampa corresponde.
 */

const SERIES = '#B67760' // clay-500 — el único color de datos
const GRID = '#E8DDD0' // linen-200 — retícula solida, un tono sobre el fondo
const AXIS_TEXT = '#97806B' // linen-500

/** Rampa ordinal validada. Solo para categorías CON orden natural. */
const ORDINAL_RAMP = ['#C9907A', '#B67760', '#9C6350', '#7E5142']

/* =============================================================================
   TARJETA DE METRICA
   Cuando la historia es un número, el número ES el gráfico.
   ========================================================================== */
export function StatTile({
  label,
  value,
  hint,
  delta,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string
  hint?: string
  /** Variación respecto del período anterior, en porcentaje */
  delta?: number | null
  tone?: 'neutral' | 'positive' | 'warning'
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.1em] text-ink-subtle">{label}</p>
        {icon && <span className="text-linen-400">{icon}</span>}
      </div>

      {/* Inter + tabular: los números no bailan al actualizarse */}
      <p
        className={cn(
          'tabular mt-1.5 font-sans text-2xl font-semibold leading-tight md:text-[1.75rem]',
          tone === 'positive' && 'text-sage-600',
          tone === 'warning' && 'text-warning',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {delta != null && Number.isFinite(delta) && (
          <span
            className={cn(
              'tabular font-medium',
              delta > 0 ? 'text-sage-600' : delta < 0 ? 'text-sale' : 'text-ink-subtle',
            )}
          >
            {/* El signo acompana al color: la información no depende del color solo */}
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-ink-subtle">{hint}</span>}
      </div>
    </div>
  )
}

/* =============================================================================
   TOOLTIP
   ========================================================================== */
type TooltipPayload = Array<{ payload: Record<string, unknown> }>

function ChartTooltip({
  active,
  payload,
  render,
}: {
  active?: boolean
  payload?: TooltipPayload
  render: (row: Record<string, unknown>) => React.ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-xs shadow-card">
      {render(payload[0].payload)}
    </div>
  )
}

/* =============================================================================
   SERIE TEMPORAL  (una medida, un eje)
   ========================================================================== */
export function TimeSeriesChart({
  data,
  dataKey,
  label,
  format = 'number',
  height = 220,
}: {
  data: Array<Record<string, string | number>>
  dataKey: string
  label: string
  format?: 'number' | 'money'
  height?: number
}) {
  const formatValue = (value: number) =>
    format === 'money' ? formatPrice(value) : String(value)

  const hasData = data.some((row) => Number(row[dataKey]) > 0)

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-ink">{label}</figcaption>

      {hasData ? (
        // El contenedor incluye la banda del eje X: si no, las etiquetas
        // quedan recortadas y aparece un scroll diminuto dentro de la tarjeta.
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              {/* Retícula solida y discreta: nunca punteada */}
              <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />

              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) =>
                  format === 'money'
                    ? value >= 1000
                      ? `${Math.round(value / 1000)}k`
                      : String(value)
                    : String(value)
                }
              />

              <Tooltip
                cursor={{ stroke: SERIES, strokeWidth: 1 }}
                content={
                  <ChartTooltip
                    render={(row) => (
                      <>
                        <p className="font-medium text-ink">{String(row.fullLabel)}</p>
                        <p className="tabular text-ink-muted">
                          {label}: {formatValue(Number(row[dataKey]))}
                        </p>
                        {row.orders_count != null && dataKey !== 'orders_count' && (
                          <p className="tabular text-ink-subtle">
                            Pedidos: {String(row.orders_count)}
                          </p>
                        )}
                      </>
                    )}
                  />
                }
              />

              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={SERIES}
                strokeWidth={2}
                fill={`url(#fill-${dataKey})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChart height={height} />
      )}
    </figure>
  )
}

/* =============================================================================
   RANKING  (una serie, un color para todas las barras)
   Colorear cada barra más oscura donde es más grande duplicaría el largo en
   el tono y gastaria el único canal libre. Categorías sin orden -> un color.
   ========================================================================== */
export function RankingChart({
  data,
  valueKey,
  label,
  format = 'number',
}: {
  data: Array<{ name: string; [key: string]: string | number }>
  valueKey: string
  label: string
  format?: 'number' | 'money'
}) {
  if (data.length === 0) return <EmptyChart height={180} />

  const max = Math.max(...data.map((row) => Number(row[valueKey]) || 0), 1)

  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-medium text-ink">{label}</figcaption>
      <ul className="space-y-2.5">
        {data.map((row) => {
          const value = Number(row[valueKey]) || 0
          return (
            <li key={row.name} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink">{row.name}</span>
                <span className="tabular shrink-0 font-medium text-ink">
                  {format === 'money' ? formatPrice(value) : value}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((value / max) * 100, 2)}%`,
                    backgroundColor: SERIES,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}

/* =============================================================================
   EMBUDO  (categorías CON orden natural -> rampa ordinal validada)
   ========================================================================== */
export function FunnelChart({
  steps,
}: {
  steps: Array<{ label: string; value: number; rate?: number }>
}) {
  const max = Math.max(...steps.map((s) => s.value), 1)

  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-medium text-ink">
        De la visita a la venta
      </figcaption>

      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink">{step.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="tabular font-medium text-ink">{step.value}</span>
                {step.rate != null && index > 0 && (
                  <span className="tabular text-xs text-ink-subtle">
                    {step.rate}% del paso anterior
                  </span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((step.value / max) * 100, 1.5)}%`,
                  backgroundColor: ORDINAL_RAMP[Math.min(index, ORDINAL_RAMP.length - 1)],
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </figure>
  )
}

/* =============================================================================
   BARRAS SIMPLES  (para comparaciones puntuales, una serie)
   ========================================================================== */
export function SimpleBarChart({
  data,
  dataKey,
  label,
  height = 180,
}: {
  data: Array<Record<string, string | number>>
  dataKey: string
  label: string
  height?: number
}) {
  if (!data.some((row) => Number(row[dataKey]) > 0)) return <EmptyChart height={height} />

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-ink">{label}</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(182,119,96,0.08)' }}
              content={
                <ChartTooltip
                  render={(row) => (
                    <>
                      <p className="font-medium text-ink">{String(row.fullLabel)}</p>
                      <p className="tabular text-ink-muted">
                        {label}: {String(row[dataKey])}
                      </p>
                    </>
                  )}
                />
              }
            />
            {/* radius solo arriba: el extremo apoyado en la línea base queda recto */}
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={28}>
              {data.map((row, index) => (
                <Cell key={index} fill={SERIES} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div
      className="grid place-items-center rounded-lg border border-dashed border-border-soft text-sm text-ink-subtle"
      style={{ height }}
    >
      Todavía no hay datos de este período
    </div>
  )
}

/**
 * Vista de tabla.
 *
 * Siempre disponible junto a cada gráfico: es lo que hace que el dato siga
 * siendo accesible aunque el color no se distinga, se imprima en blanco y
 * negro o se use un lector de pantalla.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: string[]
  rows: Array<Array<string | number>>
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mt-3"
    >
      <summary className="cursor-pointer text-xs text-ink-subtle hover:text-ink">
        Ver los datos en tabla
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border-soft">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-muted">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="tabular px-3 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
