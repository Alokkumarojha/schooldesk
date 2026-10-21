import 'server-only';
import sharp from 'sharp';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export class PhotoError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function boundedBytes(stream: ReadableStream<Uint8Array> | null, limit = MAX_PHOTO_BYTES) {
  if (!stream) throw new PhotoError(400, 'An image is required.');
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new PhotoError(413, 'Photo must be no larger than 2 MB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new PhotoError(400, 'An image is required.');
  return Buffer.concat(chunks);
}
export async function validatePhoto(request: Request): Promise<Buffer> {
  const mime = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  const format = mime === 'image/jpeg' ? 'jpeg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : null;
  if (!format) throw new PhotoError(415, 'Use JPEG, PNG or WebP.');
  const size = request.headers.get('Content-Length');
  if (size && Number(size) > MAX_PHOTO_BYTES) throw new PhotoError(413, 'Photo must be no larger than 2 MB.');
  const bytes = await boundedBytes(request.body);
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages ?? 1) !== 1) {
      throw new Error('Invalid image');
    }
    // Full decoding rejects corrupt payloads; re-encoding strips EXIF/location data.
    const sanitized = await image.timeout({ seconds: 5 }).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (sanitized.length > MAX_PHOTO_BYTES) throw new Error('Output too large');
    return sanitized;
  } catch { throw new PhotoError(400, 'Use a valid, non-animated image up to 4096 × 4096 pixels and 16 megapixels.'); }
}
