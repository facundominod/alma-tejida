'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import {
  Camera,
  ImagePlus,
  Loader2,
  Play,
  Star,
  Trash2,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError, Input } from '@/components/ui/field'
import { Badge, Overline } from '@/components/ui/primitives'
import {
  deleteMedia,
  setCoverImage,
  updateMediaAlt,
  uploadProductImage,
  uploadProductVideo,
} from '@/lib/actions/admin/media'
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
 * El `capture` del input deja que en el celular se pueda sacar la foto en el
 * momento (punto 132). Cada imagen se procesa en el servidor: se guardan una
 * versión de 1600px y una miniatura de 480px, nunca el original.
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
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState({ done: 0, total: 0 })
  const imageInput = React.useRef<HTMLInputElement>(null)
  const videoInput = React.useRef<HTMLInputElement>(null)

  const images = media.filter((item) => item.type === 'image')
  const video = media.find((item) => item.type === 'video')
  const totalBytes = media.reduce((sum, item) => sum + (item.size_bytes ?? 0), 0)

  async function handleImages(files: FileList | null) {
    if (!files?.length) return

    setError(null)
    setUploading(true)
    setProgress({ done: 0, total: files.length })

    for (let index = 0; index < files.length; index += 1) {
      const formData = new FormData()
      formData.append('productId', productId)
      formData.append('file', files[index])

      const result = await uploadProductImage(formData)
      setProgress({ done: index + 1, total: files.length })

      if (!result.ok) {
        setError(result.error)
        break
      }
    }

    setUploading(false)
    if (imageInput.current) imageInput.current.value = ''
    router.refresh()
  }

  async function handleVideo(file: File | undefined) {
    if (!file) return

    setError(null)
    setUploading(true)

    const formData = new FormData()
    formData.append('productId', productId)
    formData.append('file', file)

    const result = await uploadProductVideo(formData)

    setUploading(false)
    if (videoInput.current) videoInput.current.value = ''

    if (!result.ok) {
      setError(result.error)
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
        <input
          ref={imageInput}
          type="file"
          accept={UPLOAD_LIMITS.image.accept.join(',')}
          multiple
          // `capture` abre la camara directamente en el celular
          capture="environment"
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
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {uploading && progress.total > 0
              ? `Subiendo ${progress.done}/${progress.total}`
              : 'Agregar fotos'}
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
            {video ? 'Ya hay un video' : 'Agregar video'}
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
          {images.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
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
  onChanged,
  onError,
}: {
  item: MediaItem
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

        <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-linen-900/65 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
              className="text-xs font-medium text-white hover:underline"
            >
              Usar de portada
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
