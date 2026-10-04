'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import { UPLOAD_LIMITS } from '@/lib/images'

/**
 * Comprobante de transferencia (punto 66).
 *
 * Se sube al bucket PRIVADO `receipts`, en la carpeta orders/{order_id}/.
 * Las policies de Storage solo dejan escribir ahí a quien sea dueño de ESE
 * pedido, así que se usa el cliente con la sesión del cliente —no el de
 * servicio—: si la policy fallara, la subida falla, que es lo correcto.
 */
export async function uploadPaymentProof(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Necesitás iniciar sesión.' }

  const orderId = String(formData.get('orderId') ?? '')
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, error: 'Pedido inválido.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No llego ningun archivo.' }

  if (file.size > UPLOAD_LIMITS.proof.maxBytes) {
    return { ok: false, error: 'El archivo supera los 5 MB.' }
  }

  if (!UPLOAD_LIMITS.proof.accept.includes(file.type as (typeof UPLOAD_LIMITS.proof.accept)[number])) {
    return { ok: false, error: 'Subi una imagen o un PDF.' }
  }

  const supabase = await createClient()

  // RLS decide si este pedido es suyo. No hace falta comprobarlo aparte:
  // si no lo es, la consulta no devuelve nada.
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return { ok: false, error: 'No encontramos ese pedido.' }

  const { count } = await supabase
    .from('payment_proofs')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)

  if ((count ?? 0) >= UPLOAD_LIMITS.proof.maxPerOrder) {
    return { ok: false, error: 'Ya subiste varios comprobantes para este pedido.' }
  }

  const proofId = crypto.randomUUID()
  const extensión = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
  const path = `orders/${orderId}/${proofId}.${extensión}`

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return { ok: false, error: 'No pudimos guardar el comprobante.' }
  }

  const { error } = await supabase.from('payment_proofs').insert({
    id: proofId,
    order_id: orderId,
    storage_path: path,
    uploaded_by: profile.id,
    file_size: file.size,
    mime_type: file.type,
  })

  if (error) {
    await supabase.storage.from('receipts').remove([path])
    return { ok: false, error: 'No pudimos registrar el comprobante.' }
  }

  revalidatePath(`/cuenta/pedidos/${order.order_number}`)
  return { ok: true }
}
