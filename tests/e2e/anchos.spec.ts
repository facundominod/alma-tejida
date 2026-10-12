import { expect, test } from '@playwright/test'

/**
 * Que nada sea más ancho ni más fino que lo que lo contiene.
 *
 * POR QUE NO ALCANZA CON LA PRUEBA DE DESBORDE QUE YA TENIAMOS
 * Esa mira si la PAGINA scrollea de costado. Un hijo de grilla que se sale de
 * su tarjeta no la hace scrollear: la tarjeta tiene `overflow-hidden` y lo
 * recorta. Se ve como texto descentrado -mas aire de un lado que del otro- y
 * la prueba pasa en verde.
 *
 * Asi se escondio durante meses el hero de la portada: la celda del texto
 * medía 359 px dentro de una tarjeta de 343 y se salía 16 px por la derecha,
 * 71 px en una pantalla de 320. El motivo es que un hijo de grilla arranca
 * con `min-width: auto` y se niega a encogerse por debajo de su contenido:
 * sin `min-w-0` no hay pantalla chica que lo convenza.
 *
 * Esta prueba mide cada hijo contra la caja de contenido de su padre, en las
 * seis pantallas que ya probamos. Corre sobre el build de produccion.
 */

const RUTAS = [
  '/',
  '/tienda',
  '/novedades',
  '/ofertas',
  '/materiales',
  '/contacto',
  '/carrito',
]

/** Lo que mide el navegador, no lo que dicen las clases. */
async function medir(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const enScroll = (el: Element) => {
      let p = el.parentElement
      while (p && p !== document.body) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll') return true
        p = p.parentElement
      }
      return false
    }

    const salidos: Array<{ el: string; padre: string; sale: number }> = []

    for (const el of document.querySelectorAll('header *, main *, footer *')) {
      const padre = el.parentElement
      if (!padre || enScroll(el)) continue

      const cs = getComputedStyle(padre)
      // Sólo grilla y flex: en el flujo normal un hijo mas ancho que el padre
      // es a veces intencional (una franja a sangre).
      if (cs.display !== 'grid' && cs.display !== 'flex') continue

      const caja = padre.getBoundingClientRect()
      const dentro = caja.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const b = el.getBoundingClientRect()

      // 1.5 px de tolerancia: los anchos fraccionarios de una grilla
      // redondean distinto en cada navegador.
      if (b.width > dentro + 1.5) {
        salidos.push({
          el: (el.tagName + '.' + (el.className || '').toString()).slice(0, 80),
          padre: (padre.tagName + '.' + (padre.className || '').toString()).slice(0, 60),
          sale: Math.round(b.width - dentro),
        })
      }
    }

    return salidos
  })
}

for (const ruta of RUTAS) {
  test(`nada se sale de su contenedor en ${ruta}`, async ({ page }) => {
    const resp = await page.goto(ruta)
    expect(resp?.status(), `${ruta} no cargó`).toBeLessThan(400)
    await page.waitForLoadState('networkidle')

    const salidos = await medir(page)

    expect(
      salidos,
      `En ${ruta} hay bloques más anchos que su contenedor:\n` +
        salidos.map((s) => `  ${s.sale}px · ${s.el}\n      dentro de ${s.padre}`).join('\n'),
    ).toEqual([])
  })
}

/**
 * Las secciones tienen que arrancar todas en la misma linea.
 *
 * Es lo que se ve al scrollear: si una seccion arranca a 16 px del borde y la
 * siguiente a 40, la pagina parece cosida con dos reglas distintas. El aire
 * de adentro de una tarjeta es otra cosa y no se mide acá: una tarjeta está
 * naturalmente mas adentro que el titulo que la anuncia.
 */
test('todas las secciones arrancan en la misma línea', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const margenes = await page.evaluate(() => {
    const vistos = new Map<number, string[]>()

    // El contenedor y no la seccion: una seccion puede ser una franja a
    // sangre a proposito -el hero vive dentro de una- y entonces arranca en 0
    // con toda la razon. Lo que tiene que coincidir es la caja de contenido.
    for (const s of document.querySelectorAll('main .at-container')) {
      const b = s.getBoundingClientRect()
      if (b.width < 200) continue
      const L = Math.round(b.left)
      if (!vistos.has(L)) vistos.set(L, [])
      vistos.get(L)!.push((s.className || '').toString().slice(0, 40))
    }

    return [...vistos.entries()].map(([L, qué]) => ({ L, qué }))
  })

  expect(
    margenes.length,
    'Las secciones de la portada arrancan en márgenes distintos:\n' +
      margenes.map((m) => `  ${m.L}px → ${m.qué.join(', ')}`).join('\n'),
  ).toBe(1)
})
