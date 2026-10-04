import 'server-only'

import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import type { Order, OrderItem, OrderStatusHistory, Question, Review } from '@/types/database'

/**
 * Lecturas de "Mi cuenta".
 *
 * No filtran por usuario: lo hace RLS. Si alguna vez una policy se aflojara,
 * el test de aislamiento (tests/db/rls.test.ts) lo caza antes del deploy.
 */

export type AccountOrder = Order & { items: OrderItem[] }

export async function getMyOrders(): Promise<AccountOrder[]> {
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!orders?.length) return []

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .in(
      'order_id',
      orders.map((order) => order.id),
    )

  return orders.map((order) => ({
    ...order,
    items: ((items ?? []) as OrderItem[]).filter((item) => item.order_id === order.id),
  })) as AccountOrder[]
}

export async function getMyOrder(orderNumber: string) {
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('order_number', orderNumber.toUpperCase())
    .maybeSingle()

  if (!order) return null

  const [itemsRes, historyRes, reviewsRes] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', order.id).order('created_at'),
    supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at'),
    supabase.from('reviews').select('*').eq('order_id', order.id),
  ])

  return {
    order: order as Order,
    items: (itemsRes.data ?? []) as OrderItem[],
    history: (historyRes.data ?? []) as OrderStatusHistory[],
    reviews: (reviewsRes.data ?? []) as Review[],
  }
}

export async function getMyQuestions() {
  const supabase = await createClient()
  const profile = await getCurrentProfile()
  if (!profile) return []

  const { data } = await supabase
    .from('questions')
    .select('*, products(name, slug)')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<Array<Question & { products: { name: string; slug: string } | null }>>()

  return data ?? []
}

export async function getMyReviews() {
  const supabase = await createClient()
  const profile = await getCurrentProfile()
  if (!profile) return []

  const { data } = await supabase
    .from('reviews')
    .select('*, products(name, slug)')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<Array<Review & { products: { name: string; slug: string } | null }>>()

  return data ?? []
}
