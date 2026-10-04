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
    sm: { alma: 'text-[1.1rem]', tejida: 'text-[0.6rem]', img: 34 },
    md: { alma: 'text-[1.45rem]', tejida: 'text-[0.68rem]', img: 44 },
    lg: { alma: 'text-[2.4rem]', tejida: 'text-[0.95rem]', img: 88 },
  }[size]

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={storeName}
        width={scale.img}
        height={scale.img}
        className={cn('h-auto w-auto object-contain', className)}
        priority
      />
    )
  }

  return (
    <span className={cn('inline-flex flex-col leading-none', className)}>
      <span className="sr-only">{storeName}</span>
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
