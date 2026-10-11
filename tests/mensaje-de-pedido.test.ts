import { describe, expect, it } from 'vitest'
import { mensajeDePedido, totalesDelPedido } from '@/lib/mensaje-de-pedido'
import type { PublicOrder } from '@/types/database'

function pedido(parcial: Partial<PublicOrder> = {}): PublicOrder {
  return {
    order_number: 'A-1043',
    status: 'pending',
    status_label: 'Pendiente',
    created_at: '2026-10-11T12:00:00Z',
    customer_name: 'Ana Pérez',
    delivery_method: null,
    subtotal: 215_000,
    discount_total: 0,
    delivery_cost: 0,
    total: 215_000,
    customer_note: null,
    items: [
      {
        product_name: 'Respaldo Sol',
        product_slug: 'respaldo-sol',
        variant_label: '1,40 · Nido',
        image_url: null,
        quantity: 1,
        unit_price: 215_000,
        line_total: 215_000,
        payment_method: 'transferencia',
        cash_discount_percent: 20,
      },
    ],
    timeline: [],
    ...parcial,
  }
}

describe('totalesDelPedido', () => {
  it('separa el total de lista del que se va a pagar', () => {
    const t = totalesDelPedido(pedido())

    expect(t.lista).toBe(215_000)
    expect(t.segunPago).toBe(172_000)
    expect(t.ahorro).toBe(43_000)
    expect(t.hayDiferencia).toBe(true)
  })

  it('con tarjeta no hay diferencia', () => {
    const t = totalesDelPedido(
      pedido({
        items: [{ ...pedido().items[0]!, payment_method: 'tarjeta' }],
      }),
    )

    expect(t.segunPago).toBe(t.lista)
    expect(t.ahorro).toBe(0)
    expect(t.hayDiferencia).toBe(false)
  })

  it('el ahorro cierra contra los dos totales', () => {
    const t = totalesDelPedido(pedido())
    expect(t.segunPago + t.ahorro).toBe(t.lista)
  })

  it('suma el costo de entrega sin descontarlo', () => {
    // La entrega no tiene descuento por transferencia: es un costo, no una
    // pieza. Descontarla seria regalar parte del envio.
    const t = totalesDelPedido(pedido({ delivery_cost: 8_000, total: 223_000 }))

    expect(t.segunPago).toBe(172_000 + 8_000)
  })

  it('un pedido mixto cobra cada pieza como corresponde', () => {
    const base = pedido().items[0]!
    const t = totalesDelPedido(
      pedido({
        total: 315_000,
        items: [
          { ...base, payment_method: 'transferencia' },
          {
            ...base,
            product_name: 'Espejo Luna',
            payment_method: 'tarjeta',
            unit_price: 100_000,
            line_total: 100_000,
          },
        ],
      }),
    )

    // 172.000 por transferencia + 100.000 con tarjeta
    expect(t.segunPago).toBe(272_000)
  })

  it('un pedido sin piezas no explota', () => {
    const t = totalesDelPedido(pedido({ items: [], total: 0 }))
    expect(t.segunPago).toBe(0)
    expect(t.hayDiferencia).toBe(false)
  })
})

describe('mensajeDePedido', () => {
  it('lleva el número, la pieza y cómo se paga', () => {
    const texto = mensajeDePedido(pedido(), 'Alma Tejida')

    expect(texto).toContain('A-1043')
    expect(texto).toContain('Respaldo Sol')
    expect(texto).toContain('1,40 · Nido')
    expect(texto).toContain('Transferencia')
  })

  it('declara los dos totales cuando difieren, cada uno con su nombre', () => {
    const texto = mensajeDePedido(pedido(), 'Alma Tejida')

    expect(texto).toContain('Total de lista')
    expect(texto).toContain('215.000')
    expect(texto).toContain('172.000')
  })

  it('con un solo total no inventa una comparación', () => {
    const texto = mensajeDePedido(
      pedido({ items: [{ ...pedido().items[0]!, payment_method: 'tarjeta' }] }),
      'Alma Tejida',
    )

    expect(texto).not.toContain('Total de lista')
    expect(texto).toContain('Total')
  })

  /**
   * LA PRUEBA QUE IMPORTA: los números del mensaje tienen que cerrar entre
   * sí. Un mensaje donde las líneas no suman al total declarado hace dudar
   * de todo el resto, y se descubre recién cuando alguien transfiere mal.
   */
  it('las líneas suman exactamente el total declarado', () => {
    const base = pedido().items[0]!
    const orden = pedido({
      total: 530_000,
      delivery_cost: 0,
      items: [
        { ...base, payment_method: 'transferencia', quantity: 2, unit_price: 215_000 },
        {
          ...base,
          product_name: 'Espejo Luna',
          payment_method: 'efectivo',
          quantity: 1,
          unit_price: 100_000,
        },
      ],
    })

    const t = totalesDelPedido(orden)
    // 2 × 172.000 + 80.000
    expect(t.segunPago).toBe(344_000 + 80_000)

    const texto = mensajeDePedido(orden, 'Alma Tejida')
    expect(texto).toContain('344.000')
    expect(texto).toContain('80.000')
    expect(texto).toContain('424.000')
  })

  it('usa el markdown de WhatsApp y no el de otro lado', () => {
    // WhatsApp pone en negrita con *un* asterisco. Con dos se ven los
    // asteriscos sueltos en el chat.
    const texto = mensajeDePedido(pedido(), 'Alma Tejida')
    expect(texto).not.toContain('**')
  })

  it('incluye la entrega y la nota cuando existen', () => {
    const texto = mensajeDePedido(
      pedido({ delivery_method: 'Retiro en taller', customer_note: 'Es un regalo' }),
      'Alma Tejida',
    )

    expect(texto).toContain('Retiro en taller')
    expect(texto).toContain('Es un regalo')
  })

  it('un pedido sin elección de pago asume transferencia y no queda en blanco', () => {
    const texto = mensajeDePedido(
      pedido({ items: [{ ...pedido().items[0]!, payment_method: null }] }),
      'Alma Tejida',
    )

    expect(texto).toContain('Transferencia')
  })
})
