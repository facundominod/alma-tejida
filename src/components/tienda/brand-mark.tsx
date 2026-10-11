import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * La marca.
 *
 * Mientras el administrador no haya subido el logo, se compone
 * tipográficamente reproduciendo el gesto del sello: "alma" en la serif
 * cálida y "TEJIDA" en mayúsculas con tracking amplio. En cuanto carga su
 * archivo en Configuración, se usa ese.
 */
export function BrandMark({
  logoUrl,
  storeName = 'Alma Tejida',
  size = 'md',
  className,
}: {
  logoUrl?: string | null
  storeName?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const scale = {
    sm: {
      alma: 'text-[1.25rem]',
      tejida: 'text-[0.64rem]',
      sello: 'size-8',
      img: 'max-h-9 max-w-[30vw] sm:max-w-none',
    },
    md: {
      alma: 'text-[1.8rem]',
      tejida: 'text-[0.78rem]',
      sello: 'size-11',
      img: 'max-h-12 md:max-h-14 max-w-[40vw] sm:max-w-none',
    },
    lg: {
      alma: 'text-[3rem]',
      tejida: 'text-[1.1rem]',
      sello: 'size-20',
      img: 'max-h-28 md:max-h-36 max-w-[70vw] sm:max-w-none',
    },
  }[size]

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={storeName}
        // EL LOGO ENTRA EN UNA CAJA, no se fija por un solo lado.
        //
        // Primero se fijaba solo la altura, porque el encabezado tiene una
        // altura dada y un sello mas alto que ancho se desbordaba hacia abajo
        // -paso: 65px de logo en un encabezado de 57-.
        //
        // Pero con la altura fija y el ancho libre, MIENTRAS LA IMAGEN CARGA el
        // navegador usa el ancho del atributo para maquetar: 512px de logo en
        // un telefono de 320, y la pagina se podia correr de costado. Duraba
        // un instante, el suficiente para verse.
        //
        // Con un maximo en los dos lados la proporcion se mantiene y no se sale
        // por ninguno, ni antes ni despues de cargar.
        //
        // `width`/`height` son solo la proporcion que next/image necesita para
        // reservar el espacio; el tamano real lo ponen las clases.
        width={512}
        height={512}
        className={cn('h-auto w-auto object-contain', scale.img, className)}
        priority
      />
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5 leading-none', className)}>
      <span className="sr-only">{storeName}</span>

      {/* El sello, dibujandose. Es lo que le da el aire de cosa hecha a mano:
          una corona que aparece de golpe es un logo; una que se traza parece
          alguien dibujandola. */}
      <SelloQueSeDibuja className={cn('shrink-0 text-clay-600', scale.sello)} />

      <span className="inline-flex flex-col leading-none">
        <span
          aria-hidden="true"
          className={cn(
            'font-display font-light tracking-[-0.02em] text-clay-700',
            scale.alma,
          )}
          style={{ fontVariationSettings: '"SOFT" 40, "opsz" 32' }}
        >
          alma
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'font-semibold uppercase tracking-[0.34em] text-linen-600',
            scale.tejida,
          )}
        >
          tejida
        </span>
      </span>
    </span>
  )
}

/**
 * El sello de la marca, trazandose solo.
 *
 * Usa `stroke-dasharray` del largo de cada trazo y anima el desplazamiento
 * hasta cero: el efecto es el de una linea que se dibuja. Corre UNA vez al
 * cargar, no en bucle -un logo que se dibuja sin parar deja de ser elegante
 * a los diez segundos y pasa a ser un reclamo-.
 *
 * `vector-effect` mantiene el grosor del trazo al escalar, asi se ve igual de
 * fino en el encabezado que en la portada.
 *
 * Con `prefers-reduced-motion` aparece dibujado, sin trazarse (ver globals.css).
 */
function SelloQueSeDibuja({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      className={cn('at-sello', className)}
      aria-hidden="true"
      stroke="currentColor"
      vectorEffect="non-scaling-stroke"
    >
      <circle cx="100" cy="100" r="92" strokeWidth="3" className="at-sello-aro" />
      <circle cx="100" cy="100" r="84" strokeWidth="1.5" className="at-sello-aro-2" />

      <g className="at-sello-ramas" strokeWidth="3" strokeLinecap="round">
        <path d="M40 150 C 60 130, 70 110, 72 86" />
        <path d="M160 150 C 140 130, 130 110, 128 86" />
      </g>

      <g className="at-sello-hojas" strokeWidth="2.4">
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <ellipse
              cx={54 + i * 6}
              cy={138 - i * 15}
              rx="9"
              ry="4"
              transform={`rotate(${-38 + i * 4} ${54 + i * 6} ${138 - i * 15})`}
            />
            <ellipse
              cx={146 - i * 6}
              cy={138 - i * 15}
              rx="9"
              ry="4"
              transform={`rotate(${38 - i * 4} ${146 - i * 6} ${138 - i * 15})`}
            />
          </g>
        ))}
      </g>

      {/* La puntada del medio: lo ultimo en aparecer, como el remate. */}
      <path
        d="M76 100 C 86 88, 96 112, 106 100 S 124 88, 130 100"
        strokeWidth="3.2"
        strokeLinecap="round"
        className="at-sello-puntada"
      />
    </svg>
  )
}

/**
 * Marca de agua botanica del isologo. Se usa al 3% de opacidad en el pie y en
 * el estado vacío del carrito. Es textura, no decoración.
 */
export function BrandWatermark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      className={cn('at-watermark', className)}
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="84" stroke="currentColor" strokeWidth="0.75" />
      {/* Ramas: el gesto botanico del sello */}
      <path
        d="M40 150 C 60 130, 70 110, 72 86"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M160 150 C 140 130, 130 110, 128 86"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <ellipse
            cx={54 + i * 6}
            cy={138 - i * 15}
            rx="9"
            ry="4"
            transform={`rotate(${-38 + i * 4} ${54 + i * 6} ${138 - i * 15})`}
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <ellipse
            cx={146 - i * 6}
            cy={138 - i * 15}
            rx="9"
            ry="4"
            transform={`rotate(${38 - i * 4} ${146 - i * 6} ${138 - i * 15})`}
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </g>
      ))}
      {/* Puntada central */}
      <path
        d="M76 100 C 86 88, 96 112, 106 100 S 124 88, 130 100"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
