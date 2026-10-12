import type { MetadataRoute } from 'next'

/**
 * Lo que lee el teléfono al "Agregar a la pantalla de inicio".
 *
 * POR QUÉ HACE FALTA
 * Sin esto, Android inventa el acceso directo: usa la dirección como nombre
 * —"alma-tejida-tienda.netlify.app"— y una miniatura recortada de la página
 * como ícono. Con esto, queda "Alma Tejida" y el sello.
 *
 * `display: standalone` hace que se abra sin la barra del navegador, como una
 * aplicación. Es lo que convierte un favorito en algo que se usa.
 *
 * LOS ÍCONOS NO SE DECLARAN ACÁ
 * Next encuentra `icon.png` y `apple-icon.png` por el nombre del archivo y los
 * inyecta en cada página, incluido este manifiesto. Repetirlos sería mantener
 * la misma lista en dos lugares. Se generan con `npm run iconos`.
 *
 * `start_url` es la portada y no el catálogo: quien lo abre desde el teléfono
 * viene a mirar, y la portada es la que muestra piezas distintas cada vez.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Alma Tejida',
    short_name: 'Alma Tejida',
    description:
      'Piezas de macramé y encordado hechas a mano, nudo a nudo. Respaldos a medida, espejos, tapices y lámparas.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // El crudo de la casa y la terracota: --color-linen-50 y --color-clay-600.
    // El de fondo es el que pinta la pantalla mientras abre, así que tiene que
    // ser el mismo del sitio o se ve un destello blanco al arrancar.
    background_color: '#fbf8f4',
    theme_color: '#9c6350',
    lang: 'es-AR',
    categories: ['shopping', 'lifestyle'],
  }
}
