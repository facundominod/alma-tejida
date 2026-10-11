import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

/**
 * Preguntar sin tener cuenta (migración 0023).
 *
 * Lo que hay que demostrar es que abrir la puerta no la dejó sin llave: que la
 * función pone ella el estado, que no deja preguntar sobre una pieza que no
 * está a la venta, y que la respuesta puede quedarse en privado aunque la
 * pregunta se publique.
 */
describe('preguntar sin cuenta', () => {
  let pg: Db
  let ids: Awaited<ReturnType<typeof seedBasics>>

  beforeEach(async () => {
    pg = await createTestDb()
    ids = await seedBasics(pg)
    await pg.asService()
    await pg.query(`update public.products set status = 'published' where id = $1`, [
      ids.productId,
    ])
  })

  afterEach(async () => {
    await pg?.close()
  })

  const preguntar = (texto: string, visitante = 'v-1', nombre: string | null = 'Ana') =>
    pg.query(`select public.preguntar($1::uuid, $2::text, $3::text, null, $4::text)`, [
      ids.productId,
      texto,
      nombre,
      visitante,
    ])

  it('una visitante sin cuenta puede preguntar', async () => {
    await preguntar('¿Entra en una cama de 1,60?')

    const fila = await pg.one<{ body: string; status: string; user_id: string | null }>(
      `select body, status, user_id from public.questions where product_id = $1`,
      [ids.productId],
    )

    expect(fila!.body).toBe('¿Entra en una cama de 1,60?')
    expect(fila!.status).toBe('pending')
    expect(fila!.user_id).toBeNull()
  })

  /** LA PRUEBA QUE IMPORTA: ninguna pregunta nace publicada. */
  it('la pregunta nace privada, la decida quien la decida', async () => {
    await preguntar('¿Hacés envíos?')

    const n = await pg.one<{ n: string }>(
      `select count(*) as n from public.questions where status <> 'pending'`,
    )
    expect(Number(n!.n)).toBe(0)
  })

  it('no se puede preguntar sobre una pieza que no está a la venta', async () => {
    await pg.query(`update public.products set status = 'draft' where id = $1`, [
      ids.productId,
    ])
    await expect(preguntar('¿Y esta?')).rejects.toThrow(/PIEZA_INEXISTENTE/)
  })

  it('rechaza una pregunta vacía o enorme', async () => {
    await expect(preguntar('no')).rejects.toThrow(/PREGUNTA_INVALIDA/)
    await expect(preguntar('x'.repeat(1001))).rejects.toThrow(/PREGUNTA_INVALIDA/)
  })

  it('corta a la sexta pregunta del mismo visitante', async () => {
    for (let i = 0; i < 5; i += 1) await preguntar(`Consulta número ${i}`, 'v-insistente')
    await expect(preguntar('Una más', 'v-insistente')).rejects.toThrow(
      /DEMASIADAS_PREGUNTAS/,
    )
  })

  it('cambiar de token no saltea el tope de la tienda', async () => {
    // El token lo manda el navegador: si fuera el único límite, rotarlo dejaría
    // escribir sin freno.
    let cortada = false
    for (let i = 0; i < 70; i += 1) {
      try {
        await preguntar(`Consulta ${i}`, `token-${i}`)
      } catch (error) {
        cortada = String(error).includes('DEMASIADAS_PREGUNTAS')
        break
      }
    }
    expect(cortada).toBe(true)
  })

  /* =========================================================================
     QUE SE VE Y QUE NO
     ====================================================================== */

  async function conRespuesta(publicaPregunta: boolean, publicaRespuesta: boolean) {
    await preguntar('¿De qué hilo es?')
    await pg.query(
      `update public.questions
          set answer = 'De hilo Kraft.',
              answered_at = now(),
              answer_is_public = $1,
              status = $2`,
      [publicaRespuesta, publicaPregunta ? 'published' : 'answered'],
    )
    return pg.rows<{ body: string; answer: string | null; fue_respondida: boolean }>(
      `select body, answer, fue_respondida from public.v_public_questions`,
    )
  }

  it('sin publicar, la pregunta no aparece', async () => {
    expect(await conRespuesta(false, false)).toHaveLength(0)
  })

  it('publicada con la respuesta, se ven las dos', async () => {
    const filas = await conRespuesta(true, true)
    expect(filas).toHaveLength(1)
    expect(filas[0]!.answer).toBe('De hilo Kraft.')
  })

  /**
   * LA OTRA PRUEBA QUE IMPORTA.
   *
   * RLS filtra filas, no columnas. Si la vista no vaciara la respuesta, una
   * pregunta publicada arrastraria a la ficha una respuesta que se decidio
   * dejar en privado —un precio especial, una fecha concreta— y nadie se
   * enteraria hasta verla publicada.
   */
  it('publicada con la respuesta en privado, la respuesta NO sale', async () => {
    const filas = await conRespuesta(true, false)

    expect(filas).toHaveLength(1)
    expect(filas[0]!.body).toBe('¿De qué hilo es?')
    expect(filas[0]!.answer).toBeNull()
    // Pero se avisa que ya fue contestada: una pregunta publicada sin ninguna
    // senial de respuesta parece abandonada.
    expect(filas[0]!.fue_respondida).toBe(true)
  })

  it('no se puede publicar una respuesta que no existe', async () => {
    await preguntar('¿Cuánto tarda?')
    await expect(
      pg.query(`update public.questions set answer_is_public = true`),
    ).rejects.toThrow(/respuesta_publica_necesita_respuesta|violates check/i)
  })

  it('guarda el contacto de quien no tiene cuenta', async () => {
    await pg.query(
      `select public.preguntar($1::uuid, 'Hola', 'Ana', '351 123 4567', 'v-2')`,
      [ids.productId],
    )
    const fila = await pg.one<{ author_contact: string }>(
      `select author_contact from public.questions`,
    )
    expect(fila!.author_contact).toBe('351 123 4567')
  })

  it('el contacto nunca sale en la vista publica', async () => {
    const columnas = await pg.rows<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'v_public_questions'`,
    )
    const nombres = columnas.map((c) => c.column_name)
    expect(nombres).not.toContain('author_contact')
    expect(nombres).not.toContain('user_id')
  })
})
