'use client'

/**
 * Última red de contención.
 *
 * Se monta cuando falla el layout raíz, es decir cuando ni el header ni las
 * fuentes ni los estilos llegaron a existir. Por eso reemplaza el documento
 * entero —`<html>` y `<body>` propios— y por eso los estilos van en línea: si
 * la hoja de estilos es justamente lo que falló, una clase de Tailwind acá no
 * pintaría nada y la persona vería texto negro sobre blanco sin forma.
 *
 * Son los colores de Alma Tejida escritos a mano. Es el único archivo del
 * proyecto donde eso está permitido.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es-AR">
      <body
        style={{
          margin: 0,
          // `dvh` sigue el alto real de la ventana del celular; `vh` no.
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem 1.5rem',
          background: '#fbf8f4',
          color: '#453831',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: '26rem' }}>
          <p
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#b67760',
              margin: '0 0 1.5rem',
            }}
          >
            Alma Tejida
          </p>

          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 500,
              lineHeight: 1.2,
              margin: '0 0 0.75rem',
            }}
          >
            Se nos trabó el telar.
          </h1>

          <p style={{ color: '#7a6555', lineHeight: 1.6, margin: '0 0 1.75rem' }}>
            El problema es nuestro, no tuyo. Dale un minuto y volvé a intentar.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              appearance: 'none',
              border: 0,
              borderRadius: '0.625rem',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 500,
              color: '#fbf8f4',
              background: '#b67760',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>

          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#97806b' }}>
              Referencia: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
