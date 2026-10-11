'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Camera,
  ImagePlus,
  Play,
  Star,
  Trash2,
  Video,
} from 'lucide-react'
import { Ovillo } from '@/components/ui/ovillo'
import { Button } from '@/components/ui/button'
import { FormError, Input } from '@/components/ui/field'
import { Badge, Overline } from '@/components/ui/primitives'
import {
  deleteMedia,
  reorderMedia,
  setCoverImage,
  updateMediaAlt,
  uploadProductImage,
} from '@/lib/actions/admin/media'
import {
  pedirPermisoDeSubida,
  registrarVideoSubido,
} from '@/lib/actions/admin/subida-directa'
import { subirDirecto } from '@/lib/subir-directo'
import { achicarEnElNavegador } from '@/lib/images/achicar-en-el-navegador'
import { formatBytes, storageUrl, UPLOAD_LIMITS } from '@/lib/images'
import { cn } from '@/lib/utils'

export type MediaItem = {
  id: string
  type: string
  storage_path: string
  thumb_path: string | null
  alt: string | null
  position: number
  is_cover: boolean
  size_bytes: number | null
}

/**
 * Fotos y video de una pieza.
 *
 * Hay DOS botones de imagen a propósito, no uno.
 *
 * `capture` no es una sugerencia: cuando está puesto, el celular abre la
 * cámara y **no ofrece la galería**. Un solo botón con `capture` deja sin
 * forma de subir una foto ya sacada, que es casi siempre lo que se quiere:
 * las fotos buenas de una pieza se sacan con calma, no mientras se carga el
 * producto.
 *
 * Entonces: "Elegir fotos" abre la galería (y en una computadora, el
 * explorador de archivos), y "Sacar foto" abre la cámara (punto 132). El
 * segundo sólo aparece en celular: en una computadora de escritorio sería un
 * botón que no hace nada útil.
 *
 * Cada imagen se procesa en el servidor: se guardan una versión de 1600px y
 * una miniatura de 480px, nunca el original.
 */
export function MediaManager({
  productId,
  media,
}: {
  productId: string
  media: MediaItem[]
}) {
  const router = useRouter()
  const [uploading, setUploading] = React.useState(false)
  /** Porcentaje de la subida directa del video. Null si no hay ninguna. */
  const [progreso, setProgreso] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState({ done: 0, total: 0 })
  const imageInput = React.useRef<HTMLInputElement>(null)
  const camaraInput = React.useRef<HTMLInputElement>(null)
  const videoInput = React.useRef<HTMLInputElement>(null)

  const images = media.filter((item) => item.type === 'image')
  const video = media.find((item) => item.type === 'video')
  const totalBytes = media.reduce((sum, item) => sum + (item.size_bytes ?? 0), 0)

  /**
   * Mueve una foto un lugar hacia adelante o hacia atras.
   *
   * Se manda la lista ENTERA, no "esta va en la posicion 3": asi el servidor
   * no tiene que adivinar que paso con las demas y dos cambios seguidos no
   * pueden dejar dos fotos en la misma posicion.
   *
   * La primera foto es la portada, asi que mover una al principio tambien
   * cambia cual se ve en el catalogo. Es lo que uno espera.
   */
  async function moverFoto(desde: number, paso: -1 | 1) {
    const hasta = desde + paso
    if (hasta < 0 || hasta >= images.length) return

    const orden = images.map((m) => m.id)
    ;[orden[desde], orden[hasta]] = [orden[hasta], orden[desde]]

    setError(null)
    const resultado = await reorderMedia(productId, orden)
    if (!resultado.ok) setError('No pudimos cambiar el orden.')
    router.refresh()
  }

  async function handleImages(files: FileList | null) {
    if (!files?.length) return

    setError(null)
    setUploading(true)
    setProgress({ done: 0, total: files.length })

    for (let index = 0; index < files.length; index += 1) {
      // Se achica ACA, en el telefono, antes de que salga a la red. Los 4 MB
      // de una foto de celular quedan en unos 250 KB. El servidor la procesa
      // y la valida igual; lo unico que se ahorra es la espera de la subida.
      const liviana = await achicarEnElNavegador(files[index])

      const formData = new FormData()
      formData.append('productId', productId)
      formData.append('file', liviana)

      // El `try` abarca la llamada entera a propósito.
      //
      // Si Next rechaza el cuerpo por tamaño, o se corta la conexión a mitad
      // de la subida, la promesa de la Server Action se rechaza y el error
      // ocurre FUERA de cualquier `try` que tenga la accion del lado del
      // servidor. Sin esto, la excepcion sube sin que nadie la agarre,
      // `setUploading(false)` nunca corre y el boton se queda clavado en
      // "Subiendo" para siempre, sin decir que paso. Fue exactamente lo que
      // paso.
      try {
        const result = await uploadProductImage(formData)
        setProgress({ done: index + 1, total: files.length })

        if (!result.ok) {
          setError(result.error)
          break
        }
      } catch (error) {
        const detalle = error instanceof Error ? error.message : ''
        setError(
          /body|size|exceed|payload|413/i.test(detalle)
            ? `La foto pesó demasiado para subirla (${formatBytes(liviana.size)}). Probá con otra más chica.`
            : 'Se cortó la subida. Revisá la conexión y probá de nuevo.',
        )
        break
      }
    }

    setUploading(false)
    // Los dos se limpian: sin esto, volver a elegir EXACTAMENTE el mismo
    // archivo no dispara `change` y parece que el boton dejo de andar.
    if (imageInput.current) imageInput.current.value = ''
    if (camaraInput.current) camaraInput.current.value = ''
    router.refresh()
  }

  /**
   * El video NO pasa por el servidor.
   *
   * Antes viajaba dentro de una Server Action: del telefono a la funcion de
   * Netlify -que vive en Ohio- y de ahi a Supabase, que esta en Sao Paulo.
   * Las funciones cortan la peticion alrededor de los 6 MB, asi que un video
   * de 25 MB NO LLEGABA NUNCA por mas que la aplicacion dijera aceptarlos.
   *
   * Ahora el servidor solo firma un permiso para una ruta concreta y el
   * navegador sube directo: un viaje en lugar de dos, sin tope de 6 MB, y con
   * progreso de verdad. Recien cuando el archivo esta arriba se le avisa al
   * servidor para que lo registre.
   */
  async function handleVideo(file: File | undefined) {
    if (!file) return

    setError(null)
    setUploading(true)
    setProgreso(0)

    const permiso = await pedirPermisoDeSubida({
      productId,
      tipoMime: file.type,
      tamanioBytes: file.size,
    })

    if (!permiso.ok) {
      setUploading(false)
      setProgreso(null)
      if (videoInput.current) videoInput.current.value = ''
      setError(permiso.error)
      return
    }

    const subida = await subirDirecto({
      bucket: 'catalog',
      ruta: permiso.ruta,
      token: permiso.token,
      archivo: file,
      alProgresar: setProgreso,
    })

    if (!subida.ok) {
      setUploading(false)
      setProgreso(null)
      if (videoInput.current) videoInput.current.value = ''
      setError(subida.error)
      return
    }

    const registrado = await registrarVideoSubido({ productId, ruta: permiso.ruta })

    setUploading(false)
    setProgreso(null)
    if (videoInput.current) videoInput.current.value = ''

    if (!registrado.ok) {
      setError(registrado.error ?? 'No pudimos registrar el video.')
      return
    }
    router.refresh()
  }

  return (
    <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Overline>Fotos y video</Overline>
          <p className="mt-1 text-sm text-ink-muted">
            La primera foto es la portada. Hasta {UPLOAD_LIMITS.image.maxPerProduct}{' '}
            fotos y 1 video.
          </p>
        </div>
        {totalBytes > 0 && (
          <span className="text-xs text-ink-subtle">{formatBytes(totalBytes)} usados</span>
        )}
      </div>

      <FormError>{error}</FormError>

      {/* Subida */}
      <div className="flex flex-wrap gap-2">
        {/* SIN `capture`: abre la galeria del celular o el explorador de
            archivos. Es el camino principal. */}
        <input
          ref={imageInput}
          type="file"
          accept={UPLOAD_LIMITS.image.accept.join(',')}
          multiple
          className="sr-only"
          id="subir-fotos"
          onChange={(e) => handleImages(e.target.files)}
          disabled={uploading || images.length >= UPLOAD_LIMITS.image.maxPerProduct}
        />
        <Button
          asChild
          variant="secondary"
          disabled={uploading || images.length >= UPLOAD_LIMITS.image.maxPerProduct}
        >
          <label htmlFor="subir-fotos" className="cursor-pointer">
            {uploading ? <Ovillo /> : <ImagePlus />}
            {uploading && progress.total > 0
              ? `Subiendo ${progress.done}/${progress.total}`
              : 'Elegir fotos'}
          </label>
        </Button>

        {/* CON `capture`: abre la camara. Solo en celular (punto 132). */}
        <input
          ref={camaraInput}
          type="file"
          accept={UPLOAD_LIMITS.image.accept.join(',')}
          capture="environment"
          className="sr-only"
          id="sacar-foto"
          onChange={(e) => handleImages(e.target.files)}
          disabled={uploading || images.length >= UPLOAD_LIMITS.image.maxPerProduct}
        />
        <Button
          asChild
          variant="secondary"
          className="md:hidden"
          disabled={uploading || images.length >= UPLOAD_LIMITS.image.maxPerProduct}
        >
          <label htmlFor="sacar-foto" className="cursor-pointer">
            <Camera />
            Sacar foto
          </label>
        </Button>

        <input
          ref={videoInput}
          type="file"
          accept={UPLOAD_LIMITS.video.accept.join(',')}
          className="sr-only"
          id="subir-video"
          onChange={(e) => handleVideo(e.target.files?.[0])}
          disabled={uploading || Boolean(video)}
        />
        <Button asChild variant="ghost" disabled={uploading || Boolean(video)}>
          <label htmlFor="subir-video" className="cursor-pointer">
            <Video />
            {progreso !== null
              ? `Subiendo video ${progreso}%`
              : video
                ? 'Ya hay un video'
                : 'Agregar video'}
          </label>
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-ink-subtle">
        Las fotos se optimizan al subirlas: de una foto de celular de 4 MB quedan unos
        200 KB. El video tiene un límite de {formatBytes(UPLOAD_LIMITS.video.maxBytes)} y{' '}
        {UPLOAD_LIMITS.video.maxSeconds} segundos, y no se descarga hasta que alguien
        toca play.
      </p>

      {/* Grilla */}
      {images.length === 0 && !video ? (
        <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-border-soft py-10 text-center">
          <Camera className="size-8 text-linen-300" strokeWidth={1.3} />
          <p className="text-sm text-ink-muted">
            Sin fotos, la pieza no se puede publicar bien.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((item, i) => (
            <MediaCard
              key={item.id}
              item={item}
              primera={i === 0}
              ultima={i === images.length - 1}
              onMover={(paso) => moverFoto(i, paso)}
              onChanged={() => router.refresh()}
              onError={setError}
            />
          ))}

          {video && (
            <li className="relative aspect-square overflow-hidden rounded-lg border border-border-soft bg-linen-900">
              {video.thumb_path && (
                <Image
                  src={storageUrl(video.thumb_path)!}
                  alt=""
                  fill
                  sizes="200px"
                  className="object-cover opacity-60"
                />
              )}
              <span className="absolute inset-0 grid place-items-center text-white">
                <Play className="size-8 fill-current" />
              </span>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-linen-900/70 px-2 py-1.5">
                <span className="text-xs text-white">Video</span>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await deleteMedia(video.id)
                    if (!result.ok) setError(result.error ?? 'No pudimos borrar el video.')
                    else router.refresh()
                  }}
                  className="grid size-7 place-items-center rounded text-white/80 hover:text-white"
                  aria-label="Borrar video"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function MediaCard({
  item,
  primera,
  ultima,
  onMover,
  onChanged,
  onError,
}: {
  item: MediaItem
  primera: boolean
  ultima: boolean
  onMover: (paso: -1 | 1) => void
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [alt, setAlt] = React.useState(item.alt ?? '')
  const [busy, setBusy] = React.useState(false)
  const url = storageUrl(item.thumb_path ?? item.storage_path)

  return (
    <li
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-surface-muted',
        item.is_cover ? 'border-clay-400' : 'border-border-soft',
      )}
    >
      <div className="relative aspect-square">
        {url && (
          <Image src={url} alt={item.alt ?? ''} fill sizes="200px" className="object-cover" />
        )}

        {item.is_cover && (
          <Badge tone="primary" size="sm" className="absolute left-2 top-2">
            <Star className="size-3 fill-current" />
            Portada
          </Badge>
        )}

        {/* SIEMPRE visible.
            Antes era `opacity-0 group-hover:opacity-100`: en un celular no
            hay hover, asi que estos botones no existian. Desde el telefono no
            se podia ni borrar una foto ni cambiar la portada, y el panel esta
            pensado para usarse desde el telefono (punto 130). */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linen-900/70 px-1.5 py-1.5">
          {/* Mover: flechas y no arrastrar. Arrastrar en una pantalla tactil
              pelea con el scroll de la pagina y falla justo cuando la lista
              es larga, que es cuando hace falta ordenar. */}
          <button
            type="button"
            disabled={busy || primera}
            onClick={() => onMover(-1)}
            className="grid size-7 shrink-0 place-items-center rounded text-white/85 transition-colors hover:text-white disabled:opacity-30"
            aria-label="Mover antes"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={busy || ultima}
            onClick={() => onMover(1)}
            className="grid size-7 shrink-0 place-items-center rounded text-white/85 transition-colors hover:text-white disabled:opacity-30"
            aria-label="Mover despues"
          >
            <ChevronRight className="size-4" />
          </button>

          {!item.is_cover && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const result = await setCoverImage(item.id)
                setBusy(false)
                if (!result.ok) onError(result.error ?? 'No pudimos cambiar la portada.')
                else onChanged()
              }}
              className="truncate px-1 text-xs font-medium text-white hover:underline"
            >
              Portada
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const result = await deleteMedia(item.id)
              setBusy(false)
              if (!result.ok) onError(result.error ?? 'No pudimos borrar la imagen.')
              else onChanged()
            }}
            className="ml-auto grid size-7 place-items-center rounded text-white/85 hover:text-white"
            aria-label="Borrar imagen"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* El texto alternativo es parte del trabajo, no un extra */}
      <Input
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        onBlur={() => updateMediaAlt(item.id, alt)}
        placeholder="Describi la foto"
        aria-label="Texto alternativo de la imagen"
        maxLength={200}
        className="h-9 rounded-none border-0 border-t border-border-soft text-xs"
      />
    </li>
  )
}
