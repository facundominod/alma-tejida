import { test, expect, type Page } from '@playwright/test'

/**
 * Cuánto tarda la tienda en RESPONDER a un toque.
 *
 * No mide el tiempo de carga de una URL —eso ya lo mide `npm run measure`—
 * sino lo que importa de verdad cuando alguien dice "está lento": el rato
 * entre que toca un enlace y que ve algo distinto en la pantalla.
 *
 * Son mediciones, no aserciones duras: fallar el build porque un día la red
 * estuvo peor no sirve. Los topes son generosos a propósito y están para
 * avisar de un empeoramiento grande, no para vigilar milisegundos.
 *
 * Correr contra la tienda publicada:
 *   E2E_BASE_URL=https://alma-tejida.netlify.app npx playwright test velocidad
 */

/** Tiempo desde el click hasta que el contenido nuevo es visible. */
async function medirToque(page: Page, enlace: RegExp, señalDestino: RegExp) {
  const inicio = Date.now()
  await page.getByRole('link', { name: enlace }).first().click()
  await expect(page.getByRole('heading', { name: señalDestino }).first()).toBeVisible({
    timeout: 20_000,
  })
  return Date.now() - inicio
}

test.describe('velocidad de respuesta', () => {
  test('tocar un enlace muestra algo enseguida', async ({ page }, info) => {
    test.skip(info.project.name !== 'notebook', 'alcanza con medirlo en un tamaño')

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const aCatalogo = await medirToque(page, /ver las piezas/i, /todas las piezas/i)
    console.log(`  portada -> catalogo: ${aCatalogo} ms`)

    await page.goto('/')
    const aContacto = await medirToque(page, /contacto/i, /contacto/i)
    console.log(`  portada -> contacto: ${aContacto} ms`)

    // Topes anchos: esto avisa de un empeoramiento, no vigila milisegundos.
    expect(aCatalogo, 'el catalogo tarda demasiado en responder').toBeLessThan(8000)
    expect(aContacto, 'contacto tarda demasiado en responder').toBeLessThan(6000)
  })

  test('la portada pinta su contenido sin esperar al servidor', async ({ page }, info) => {
    test.skip(info.project.name !== 'notebook', 'alcanza con medirlo en un tamaño')

    await page.goto('/', { waitUntil: 'commit' })

    const inicio = Date.now()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    const pintado = Date.now() - inicio

    console.log(`  primer contenido visible: ${pintado} ms`)
    expect(pintado, 'la portada tarda demasiado en pintar').toBeLessThan(5000)
  })
})
