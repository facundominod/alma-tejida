import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Eye,
  MessageCircleQuestion,
  Receipt,
  ShoppingCart,
  Star,
  Wallet,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import {
  ChartTable,
  FunnelChart,
  RankingChart,
  StatTile,
  TimeSeriesChart,
} from '@/components/admin/charts'
import { Badge } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import {
  getDashboard,
  getFunnel,
  getLowStock,
  getSalesByDay,
  getTopProducts,
  getTopViewed,
} from '@/lib/queries/admin'
import { formatPrice } from '@/lib/utils'

export const metadata = { title: 'Inicio' }

/**
 * Panel de inicio (puntos 85-96, 133).
 *
 * Responde de un vistazo las siete preguntas del punto 85, y mantiene
 * separados dos números que NO son lo mismo: pedidos y ventas cobradas
 * (punto 170).
 */
export default async function AdminDashboard() {
  const metrics = await getDashboard()
  const { from, to } = metrics.range

  const [salesByDay, topByUnits, topByAmount, topViewed, funnel, lowStock] =
    await Promise.all([
      getSalesByDay(from, to),
      getTopProducts(from, to, 'units', 5),
      getTopProducts(from, to, 'amount', 5),
      getTopViewed(from, to, 5),
      getFunnel(from, to),
      getLowStock(6),
    ])

  const current = metrics.current
  const previous = metrics.previous

  const pct = (now: number, before: number) =>
    before > 0 ? ((now - before) / before) * 100 : null

  const chartData = salesByDay.map((row) => {
    const date = new Date(`${row.day}T12:00:00`)
    return {
      label: date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
      fullLabel: date.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      revenue: Number(row.revenue),
      orders_count: Number(row.orders_count),
      sales_count: Number(row.sales_count),
    }
  })

  const inbox = [
    {
      href: '/admin/pedidos?estado=pending',
      label: 'Pedidos pendientes',
      value: current.pending_count,
      icon: ShoppingCart,
      urgent: current.pending_count > 0,
    },
    {
      href: '/admin/preguntas',
      label: 'Preguntas sin responder',
      value: metrics.unanswered_questions,
      icon: MessageCircleQuestion,
      urgent: metrics.unanswered_questions > 0,
    },
    {
      href: '/admin/stock',
      label: 'Con stock bajo',
      value: metrics.low_stock_count,
      icon: Boxes,
      urgent: metrics.low_stock_count > 0,
    },
    {
      href: '/admin/resenas',
      label: 'Reseñas por moderar',
      value: metrics.pending_reviews,
      icon: Star,
      urgent: metrics.pending_reviews > 0,
    },
  ]

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Como va el mes"
        description={`Del ${new Date(`${from}T12:00:00`).toLocaleDateString('es-AR')} al ${new Date(`${to}T12:00:00`).toLocaleDateString('es-AR')}`}
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/productos/nuevo">Cargar una pieza</Link>
          </Button>
        }
      />

      {/* LOS NUMEROS DEL MES ------------------------------------------------ */}
      <section aria-label="Resumen del mes" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Ingresos confirmados"
          value={formatPrice(current.revenue)}
          delta={pct(current.revenue, previous.revenue)}
          hint="vs. mes anterior"
          tone="positive"
          icon={<Wallet className="size-4" />}
        />
        <StatTile
          label="Ventas cobradas"
          value={String(current.sales_count)}
          delta={pct(current.sales_count, previous.sales_count)}
          hint={`${metrics.units_sold} unidades`}
          icon={<Receipt className="size-4" />}
        />
        <StatTile
          label="Pendiente de cobro"
          value={formatPrice(current.pending_amount)}
          hint={`${current.pending_count} pedidos`}
          tone={current.pending_count > 0 ? 'warning' : 'neutral'}
          icon={<ShoppingCart className="size-4" />}
        />
        <StatTile
          label="Ticket promedio"
          value={formatPrice(current.avg_ticket)}
          hint={`${current.orders_count} pedidos en total`}
          icon={<Eye className="size-4" />}
        />
      </section>

      {/* Un pedido NO es una venta. El panel no los mezcla nunca. */}
      {current.cancelled_count > 0 && (
        <p className="mt-3 text-xs text-ink-subtle">
          {current.cancelled_count} pedidos cancelados por{' '}
          {formatPrice(current.cancelled_amount)}. No se cuentan como ingreso.
        </p>
      )}

      {/* BANDEJA ------------------------------------------------------------ */}
      <section aria-label="Pendientes" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {inbox.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-4 transition-colors hover:border-clay-300"
            >
              <span
                className={
                  item.urgent
                    ? 'grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-clay-700'
                    : 'grid size-10 shrink-0 place-items-center rounded-lg bg-surface-muted text-linen-400'
                }
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="tabular block font-sans text-xl font-semibold leading-tight text-ink">
                  {item.value}
                </span>
                <span className="block truncate text-xs text-ink-muted">{item.label}</span>
              </span>
            </Link>
          )
        })}
      </section>

      {/* GRAFICOS ----------------------------------------------------------- */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <TimeSeriesChart
            data={chartData}
            dataKey="revenue"
            label="Ingresos por día"
            format="money"
          />
          <ChartTable
            caption="Ingresos y pedidos por día"
            columns={['Día', 'Ingresos', 'Pedidos']}
            rows={chartData.map((row) => [
              row.fullLabel,
              formatPrice(row.revenue),
              row.orders_count,
            ])}
          />
        </div>

        <div className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          {/* Small multiple: la otra medida va en SU PROPIO gráfico.
              Dos escalas distintas en un mismo eje inventan una correlación
              que no existe. */}
          <TimeSeriesChart data={chartData} dataKey="orders_count" label="Pedidos por día" />
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <RankingChart
            data={topByUnits.map((p) => ({ name: p.name, units: p.units }))}
            valueKey="units"
            label="Más vendidas (unidades)"
          />
        </div>

        <div className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <RankingChart
            data={topByAmount.map((p) => ({ name: p.name, amount: Number(p.amount) }))}
            valueKey="amount"
            label="Más vendidas (monto)"
            format="money"
          />
        </div>

        <div className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <RankingChart
            data={topViewed.map((p) => ({ name: p.name, views: p.views }))}
            valueKey="views"
            label="Más visitadas"
          />
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <FunnelChart
            steps={[
              { label: 'Visitas a productos', value: funnel.product_views },
              {
                label: 'Agregados al carrito',
                value: funnel.add_to_cart,
                rate: funnel.view_to_cart,
              },
              { label: 'Pedidos', value: funnel.orders, rate: funnel.cart_to_order },
              { label: 'Ventas cobradas', value: funnel.paid, rate: funnel.order_to_paid },
            ]}
          />
        </div>

        {/* STOCK BAJO */}
        <div className="rounded-xl border border-border-soft bg-surface p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Stock bajo</p>
            <Button asChild variant="link" size="sm">
              <Link href="/admin/stock">
                Ver todo <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {lowStock.length > 0 ? (
            <ul className="divide-y divide-border-soft">
              {lowStock.map((row) => (
                <li
                  key={row.variant_id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {row.product_name}
                    </p>
                    {row.variant_label && (
                      <p className="truncate text-xs text-ink-subtle">
                        {row.variant_label}
                      </p>
                    )}
                  </div>
                  {/* El estado se dice con texto e icono, no solo con color */}
                  <Badge tone={row.available === 0 ? 'danger' : 'warning'} size="sm">
                    <AlertTriangle className="size-3" />
                    {row.available === 0 ? 'Sin stock' : `Quedan ${row.available}`}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-ink-subtle">
              Ninguna pieza está por debajo de su umbral.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
