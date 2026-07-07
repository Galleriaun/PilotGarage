/**
 * Free-tier convention (ARCHITECTURE.md §2): compress every photo to
 * ~200 KB JPEG, max 1280px, before upload. The point is mobile upload
 * speed and egress as much as storage.
 *
 * The library is imported lazily so it stays out of the main bundle —
 * it's only needed at the moment of an upload.
 */
export async function compressPhoto(file: File): Promise<File> {
  const { default: imageCompression } = await import('browser-image-compression')
  return imageCompression(file, {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  })
}
