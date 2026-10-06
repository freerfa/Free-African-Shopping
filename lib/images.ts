/** Client-side photo pipeline. This store has no upload server, so admin
 *  photos are read in the browser, downscaled on a canvas and stored inside
 *  the product record as data URLs (localStorage). Compressing here is what
 *  keeps a few photos inside the browser's ~5 MB storage quota. */

/** Longest edge we keep; plenty for the card grid and detail gallery. */
const MAX_DIMENSION = 1280;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ENCODE_QUALITY = 0.82;

/** Decodes the file into something drawImage() accepts. createImageBitmap
    honours EXIF orientation by default; the <img> fallback covers engines
    without it (or that reject the options bag in older builds). */
const loadDrawable = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to <img> decoding.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not read "${file.name}" as an image.`));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Alpha sampled on a stride — we only need "any transparency?", not a full
    pixel scan of a megapixel canvas. */
const hasTransparency = (ctx: CanvasRenderingContext2D, width: number, height: number): boolean => {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4 * 16) {
    if (data[i] < 255) return true;
  }
  return false;
};

/** Reads a picked file, shrinks it to at most MAX_DIMENSION on its longest
    edge and returns a compressed data URL. Throws a human-readable Error on
    anything the browser cannot decode. */
export const fileToImageDataUrl = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image file.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than 20 MB.`);
  }

  const drawable = await loadDrawable(file);
  try {
    const naturalWidth = 'naturalWidth' in drawable ? drawable.naturalWidth : drawable.width;
    const naturalHeight = 'naturalHeight' in drawable ? drawable.naturalHeight : drawable.height;
    if (!naturalWidth || !naturalHeight) {
      throw new Error(`Could not read the dimensions of "${file.name}".`);
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not process the photo.');
    ctx.drawImage(drawable, 0, 0, width, height);

    // WebP compresses far better than PNG and keeps transparency; Safari <16
    // silently returns a PNG from toDataURL here, so drop to JPEG for opaque
    // photos (a photo-sized PNG would blow the storage quota) and keep the PNG
    // only when there is actual alpha to preserve.
    const webp = canvas.toDataURL('image/webp', ENCODE_QUALITY);
    if (webp.startsWith('data:image/webp')) return webp;
    if (!hasTransparency(ctx, width, height)) {
      return canvas.toDataURL('image/jpeg', ENCODE_QUALITY);
    }
    return webp; // PNG fallback — kept for its transparency.
  } finally {
    if ('close' in drawable) drawable.close();
  }
};
