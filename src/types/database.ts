/**
 * Tipos de la base de Alma Tejida.
 *
 * Escritos a mano a partir de supabase/migrations/. Cuando el proyecto de
 * Supabase este creado, se regeneran con:
 *
 *   npm run types:generate
 *
 * y este archivo pasa a ser generado. Hasta entonces esta versión cumple la
 * misma función: que el editor y el compilador conozcan el esquema real.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export type UserRole = 'customer' | 'admin'
export type ProductStatus = 'draft' | 'published' | 'archived'
export type AvailabilityMode = 'in_stock' | 'made_to_order' | 'unique_piece'
export type StockDisplayMode = 'exact' | 'vague' | 'hidden'
export type AttributeType = 'select' | 'text' | 'number' | 'measure' | 'color'
export type MediaType = 'image' | 'video'
export type DiscountType = 'percent' | 'fixed_price' | 'amount_off'
export type CartStatus = 'active' | 'converted' | 'abandoned'
export type OrderStatus =
  | 'pending'
  | 'contacted'
  | 'awaiting_payment'
  | 'paid'
  | 'preparing'
  | 'delivered'
  | 'cancelled'
export type MovementType =
  | 'initial'
  | 'restock'
  | 'reserve'
  | 'release'
  | 'sale'
  | 'cancellation'
  | 'adjustment'
export type QuestionStatus = 'pending' | 'answered' | 'published' | 'hidden'
export type ReviewStatus = 'pending' | 'approved' | 'hidden'
export type NotificationAudience = 'admin' | 'customer'
export type ProofStatus = 'pending' | 'accepted' | 'rejected'
export type AnalyticsEventType =
  | 'product_view'
  | 'gallery_image_view'
  | 'video_play'
  | 'category_view'
  | 'search'
  | 'add_to_cart'
  | 'checkout_started'
  | 'order_created'
  | 'order_paid'
  | 'whatsapp_click'
export type PriceSource = 'base' | 'product_sale' | 'promotion'

// -----------------------------------------------------------------------------
// Filas
// -----------------------------------------------------------------------------
export type Profile = {
  id: string
  role: UserRole
  full_name: string | null
  /** Nombre para entrar. Nulo en las cuentas creadas antes de la migracion 0015. */
  username: string | null
  email: string | null
  phone: string | null
  accepts_marketing: boolean
  created_at: string
  updated_at: string
}

export type DeliveryMethod = {
  key: string
  label: string
  description?: string
  requires_address?: boolean
  price?: number
  is_active?: boolean
}

export type StoreSettings = {
  id: number
  store_name: string
  tagline: string
  logo_url: string | null
  logo_mark_url: string | null
  og_image_url: string | null
  whatsapp_number: string | null
  phone: string | null
  contact_email: string | null
  address: string | null
  opening_hours: string | null
  socials: Record<string, string>
  payment_alias: string | null
  payment_bank: string | null
  payment_holder: string | null
  payment_cbu: string | null
  payment_instructions: string | null
  delivery_methods: DeliveryMethod[]
  home_hero: {
    title?: string
    subtitle?: string
    image_url?: string
    cta_label?: string
    cta_href?: string
  }
  home_sections: Record<string, Json>
  about_text: string | null
  default_stock_display: StockDisplayMode
  default_low_stock_threshold: number
  currency: string
  is_open: boolean
  closed_message: string | null
  updated_at: string
}

export type Category = {
  id: string
  parent_id: string | null
  name: string
  slug: string
  description: string | null
  image_path: string | null
  position: number
  is_visible: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type Product = {
  id: string
  category_id: string | null
  name: string
  slug: string
  short_description: string | null
  description: string | null
  status: ProductStatus
  availability_mode: AvailabilityMode
  lead_time_days: number | null
  base_price: number
  /** Cuanto cuesta hacerla. NUNCA sale a la tienda publica. */
  base_cost: number | null
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  stock_display: StockDisplayMode
  low_stock_threshold: number
  show_when_out_of_stock: boolean
  is_featured: boolean
  featured_position: number
  rating_avg: number
  rating_count: number
  search_vector: unknown
  published_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type ProductAttribute = {
  id: string
  product_id: string
  name: string
  type: AttributeType
  position: number
  created_at: string
}

export type ProductAttributeValue = {
  id: string
  attribute_id: string
  value: string
  color_hex: string | null
  position: number
  created_at: string
}

export type ProductVariant = {
  id: string
  product_id: string
  sku: string | null
  price_override: number | null
  stock: number
  reserved: number
  low_stock_threshold: number | null
  is_default: boolean
  is_active: boolean
  position: number
  created_at: string
  updated_at: string
}

export type VariantOptionValue = {
  variant_id: string
  attribute_id: string
  value_id: string
}

export type ProductMedia = {
  id: string
  product_id: string
  variant_id: string | null
  attribute_value_id: string | null
  type: MediaType
  storage_path: string
  thumb_path: string | null
  blur_data: string | null
  external_url: string | null
  alt: string | null
  width: number | null
  height: number | null
  size_bytes: number | null
  duration_seconds: number | null
  position: number
  is_cover: boolean
  created_at: string
}

export type Promotion = {
  id: string
  title: string
  description: string | null
  image_path: string | null
  discount_type: DiscountType
  discount_value: number
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  show_in_hero: boolean
  position: number
  cta_label: string | null
  cta_href: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PromotionTarget = {
  id: string
  promotion_id: string
  product_id: string | null
  category_id: string | null
}

export type Cart = {
  id: string
  user_id: string | null
  anon_token: string | null
  status: CartStatus
  created_at: string
  updated_at: string
}

export type CartItem = {
  id: string
  cart_id: string
  variant_id: string
  quantity: number
  created_at: string
  updated_at: string
}

export type Order = {
  id: string
  order_number: string
  access_token: string
  user_id: string | null
  customer_name: string
  customer_email: string
  customer_phone: string
  delivery_method: string | null
  shipping_address: Json | null
  status: OrderStatus
  subtotal: number
  discount_total: number
  delivery_cost: number
  total: number
  currency: string
  customer_note: string | null
  internal_note: string | null
  idempotency_key: string
  paid_at: string | null
  paid_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
  updated_at: string
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string | null
  variant_id: string | null
  product_name: string
  product_slug: string | null
  variant_label: string | null
  sku: string | null
  image_url: string | null
  unit_price: number
  unit_compare_price: number | null
  discount_amount: number
  quantity: number
  reserved_quantity: number
  line_total: number
  promotion_id: string | null
  promotion_title: string | null
  created_at: string
}

export type OrderStatusHistory = {
  id: string
  order_id: string
  from_status: OrderStatus | null
  to_status: OrderStatus
  changed_by: string | null
  note: string | null
  created_at: string
}

export type PaymentProof = {
  id: string
  order_id: string
  storage_path: string
  uploaded_by: string | null
  file_size: number | null
  mime_type: string | null
  status: ProofStatus
  created_at: string
}

export type InventoryMovement = {
  id: string
  variant_id: string
  movement_type: MovementType
  stock_delta: number
  reserved_delta: number
  stock_after: number
  reserved_after: number
  order_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export type Question = {
  id: string
  product_id: string
  user_id: string | null
  author_name: string | null
  body: string
  answer: string | null
  answered_at: string | null
  answered_by: string | null
  status: QuestionStatus
  created_at: string
  updated_at: string
}

export type Review = {
  id: string
  product_id: string
  order_id: string
  user_id: string
  author_name: string | null
  rating: number
  body: string | null
  status: ReviewStatus
  admin_reply: string | null
  replied_at: string | null
  hidden_reason: string | null
  created_at: string
  updated_at: string
}

export type Favorite = {
  user_id: string
  product_id: string
  created_at: string
}

export type RestockRequest = {
  id: string
  product_id: string
  variant_id: string | null
  user_id: string | null
  email: string
  notified_at: string | null
  created_at: string
}

export type Notification = {
  id: string
  audience: NotificationAudience
  user_id: string | null
  type: string
  title: string
  body: string | null
  link: string | null
  entity_type: string | null
  entity_id: string | null
  group_key: string | null
  read_at: string | null
  created_at: string
}

export type PriceHistory = {
  id: string
  product_id: string
  variant_id: string | null
  field: string
  old_price: number | null
  new_price: number | null
  changed_by: string | null
  reason: string | null
  created_at: string
}

export type AuditLog = {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before: Json | null
  after: Json | null
  created_at: string
}

export type AnalyticsDaily = {
  day: string
  event_type: AnalyticsEventType
  product_id: string | null
  category_id: string | null
  count: number
}

// -----------------------------------------------------------------------------
// Vistas
// -----------------------------------------------------------------------------
export type OptionSummary = { name: string; count: number }

export type CatalogProduct = {
  id: string
  slug: string
  name: string
  short_description: string | null
  status: ProductStatus
  category_id: string | null
  category_name: string | null
  category_slug: string | null
  availability_mode: AvailabilityMode
  lead_time_days: number | null
  stock_display: StockDisplayMode
  low_stock_threshold: number
  show_when_out_of_stock: boolean
  is_featured: boolean
  featured_position: number
  rating_avg: number
  rating_count: number
  published_at: string | null
  created_at: string
  price_variant_id: string | null
  list_price: number | null
  final_price: number | null
  discount_amount: number | null
  discount_percent: number | null
  promotion_id: string | null
  promotion_title: string | null
  price_source: PriceSource | null
  variant_count: number
  available_total: number
  has_price_range: boolean
  option_summary: OptionSummary[] | null
  cover_path: string | null
  cover_thumb: string | null
  cover_blur: string | null
  cover_alt: string | null
  /** Las primeras 3 fotos, portada incluida. Nulo si la pieza no tiene ninguna. */
  gallery: ProductThumb[] | null
}

/** Una foto de la galeria corta que trae el catalogo (migracion 0016). */
export type ProductThumb = {
  path: string | null
  thumb: string | null
  blur: string | null
  alt: string | null
}

export type VariantView = {
  variant_id: string
  product_id: string
  sku: string | null
  stock: number
  reserved: number
  available: number
  is_default: boolean
  is_active: boolean
  position: number
  low_stock_threshold: number
  is_low_stock: boolean
  variant_label: string | null
  list_price: number | null
  final_price: number | null
  discount_amount: number | null
  discount_percent: number | null
  promotion_id: string | null
  promotion_title: string | null
  price_source: PriceSource | null
}

// -----------------------------------------------------------------------------
// Resultados de funciones
// -----------------------------------------------------------------------------
export type EffectivePrice = {
  list_price: number
  final_price: number
  discount_amount: number
  discount_percent: number
  promotion_id: string | null
  promotion_title: string | null
  price_source: PriceSource
}

export type CreateOrderResult = {
  order_id: string
  order_number: string
  access_token: string
  total: number
  status: OrderStatus
  duplicate: boolean
}

export type PublicOrder = {
  order_number: string
  status: OrderStatus
  status_label: string
  created_at: string
  customer_name: string
  delivery_method: string | null
  subtotal: number
  discount_total: number
  delivery_cost: number
  total: number
  customer_note: string | null
  items: Array<{
    product_name: string
    product_slug: string | null
    variant_label: string | null
    image_url: string | null
    quantity: number
    unit_price: number
    line_total: number
  }>
  timeline: Array<{ status: OrderStatus; label: string; created_at: string }>
}

export type DashboardMetrics = {
  range: { from: string; to: string; days: number }
  previous_range: { from: string; to: string }
  current: {
    orders_count: number
    orders_amount: number
    sales_count: number
    revenue: number
    pending_amount: number
    pending_count: number
    cancelled_count: number
    cancelled_amount: number
    avg_ticket: number
  }
  previous: { orders_count: number; sales_count: number; revenue: number }
  units_sold: number
  unanswered_questions: number
  pending_reviews: number
  unread_notifications: number
  low_stock_count: number
  published_products: number
}

export type FunnelMetrics = {
  product_views: number
  add_to_cart: number
  checkout_started: number
  orders: number
  paid: number
  view_to_cart: number
  cart_to_order: number
  order_to_paid: number
}

export type StorageUsage = {
  images_bytes: number
  videos_bytes: number
  proofs_bytes: number
  total_bytes: number
  quota_bytes: number
  used_percent: number
}

export type LowStockRow = {
  variant_id: string
  product_id: string
  product_name: string
  product_slug: string
  variant_label: string | null
  stock: number
  reserved: number
  available: number
  threshold: number
  image_url: string | null
}

// -----------------------------------------------------------------------------
// Forma que espera supabase-js
// -----------------------------------------------------------------------------
type Table<Row, RequiredOnInsert extends keyof Row = never> = {
  Row: Row
  Insert: Partial<Row> & Pick<Row, RequiredOnInsert>
  Update: Partial<Row>
  Relationships: []
}

type View<Row> = { Row: Row; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, 'id'>
      store_settings: Table<StoreSettings, 'id'>
      categories: Table<Category, 'name' | 'slug'>
      products: Table<Product, 'name' | 'slug' | 'base_price'>
      product_attributes: Table<ProductAttribute, 'product_id' | 'name'>
      product_attribute_values: Table<ProductAttributeValue, 'attribute_id' | 'value'>
      product_variants: Table<ProductVariant, 'product_id'>
      variant_option_values: Table<VariantOptionValue, 'variant_id' | 'attribute_id' | 'value_id'>
      product_media: Table<ProductMedia, 'product_id' | 'storage_path'>
      price_history: Table<PriceHistory, 'product_id' | 'field'>
      promotions: Table<Promotion, 'title' | 'discount_type' | 'discount_value'>
      promotion_targets: Table<PromotionTarget, 'promotion_id'>
      carts: Table<Cart>
      cart_items: Table<CartItem, 'cart_id' | 'variant_id'>
      orders: Table<
        Order,
        'customer_name' | 'customer_email' | 'customer_phone' | 'idempotency_key'
      >
      order_items: Table<
        OrderItem,
        'order_id' | 'product_name' | 'unit_price' | 'quantity' | 'line_total'
      >
      order_status_history: Table<OrderStatusHistory, 'order_id' | 'to_status'>
      payment_proofs: Table<PaymentProof, 'order_id' | 'storage_path'>
      inventory_movements: Table<
        InventoryMovement,
        'variant_id' | 'movement_type' | 'stock_after' | 'reserved_after'
      >
      questions: Table<Question, 'product_id' | 'body'>
      reviews: Table<Review, 'product_id' | 'order_id' | 'user_id' | 'rating'>
      favorites: Table<Favorite, 'user_id' | 'product_id'>
      restock_requests: Table<RestockRequest, 'product_id' | 'email'>
      notifications: Table<Notification, 'audience' | 'type' | 'title'>
      analytics_daily: Table<AnalyticsDaily, 'day' | 'event_type'>
      audit_log: Table<AuditLog, 'action' | 'entity_type'>
    }
    Views: {
      v_catalog_products: View<CatalogProduct>
      v_product_variants: View<VariantView>
      v_active_promotions: View<Promotion>
    }
    Functions: {
      effective_price: {
        Args: { p_product_id: string; p_variant_id?: string | null }
        Returns: EffectivePrice[]
      }
      variant_label: { Args: { p_variant_id: string }; Returns: string | null }
      search_products: {
        Args: { p_query: string; p_limit?: number }
        Returns: CatalogProduct[]
      }
      create_order: {
        Args: {
          p_cart_id: string
          p_idempotency_key: string
          p_customer_name: string
          p_customer_email: string
          p_customer_phone: string
          p_anon_token?: string | null
          p_delivery_method?: string | null
          p_shipping_address?: Json | null
          p_customer_note?: string | null
        }
        Returns: CreateOrderResult
      }
      set_order_status: {
        Args: { p_order_id: string; p_status: OrderStatus; p_note?: string | null }
        Returns: { order_id: string; status: OrderStatus; changed: boolean }
      }
      cancel_order_by_customer: {
        Args: { p_order_id: string; p_reason?: string | null }
        Returns: { order_id: string; status: OrderStatus }
      }
      get_order_public: {
        Args: { p_order_number: string; p_token: string }
        Returns: PublicOrder | null
      }
      adjust_stock: {
        Args: {
          p_variant_id: string
          p_delta: number
          p_type?: MovementType
          p_note?: string | null
        }
        Returns: {
          variant_id: string
          stock: number
          reserved: number
          available: number
          movement_id: string
        }
      }
      merge_cart: { Args: { p_anon_token: string }; Returns: string }
      link_guest_orders: { Args: Record<string, never>; Returns: number }
      track_event: {
        Args: {
          p_event_type: AnalyticsEventType
          p_session_id: string
          p_product_id?: string | null
          p_variant_id?: string | null
          p_category_id?: string | null
          p_media_id?: string | null
          p_metadata?: Json
        }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      /** Solo service_role: desde el navegador seria una fuga de correos. */
      email_for_username: {
        Args: { p_username: string }
        Returns: string | null
      }
      /** Solo service_role: un si/no repetido tambien permite enumerar cuentas. */
      username_disponible: {
        Args: { p_username: string }
        Returns: boolean
      }
      /** Solo admin: comprueba is_admin() adentro y lanza si no lo es. */
      admin_margenes: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: Json
      }
      admin_dashboard: {
        Args: { p_from?: string | null; p_to?: string | null }
        Returns: DashboardMetrics
      }
      admin_sales_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: Array<{
          day: string
          orders_count: number
          sales_count: number
          revenue: number
        }>
      }
      admin_top_products: {
        Args: { p_from: string; p_to: string; p_by?: string; p_limit?: number }
        Returns: Array<{
          product_id: string
          name: string
          slug: string
          image_url: string | null
          units: number
          amount: number
        }>
      }
      admin_top_viewed: {
        Args: { p_from: string; p_to: string; p_limit?: number }
        Returns: Array<{ product_id: string; name: string; slug: string; views: number }>
      }
      admin_funnel: { Args: { p_from: string; p_to: string }; Returns: FunnelMetrics }
      admin_low_stock: { Args: { p_limit?: number }; Returns: LowStockRow[] }
      storage_usage: { Args: Record<string, never>; Returns: StorageUsage }
      purge_old_data: { Args: Record<string, never>; Returns: Json }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      admin_save_product_structure: {
        Args: { p_product_id: string; p_payload: Json }
        Returns: {
          product_id: string
          variants: number
          created: number
          deactivated: number
        }
      }
    }
    Enums: {
      user_role: UserRole
      product_status: ProductStatus
      availability_mode: AvailabilityMode
      stock_display_mode: StockDisplayMode
      attribute_type: AttributeType
      media_type: MediaType
      discount_type: DiscountType
      cart_status: CartStatus
      order_status: OrderStatus
      movement_type: MovementType
      question_status: QuestionStatus
      review_status: ReviewStatus
      notification_audience: NotificationAudience
      proof_status: ProofStatus
      analytics_event_type: AnalyticsEventType
    }
    CompositeTypes: Record<string, never>
  }
}
