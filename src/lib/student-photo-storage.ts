import 'server-only';
import { getCloudinary } from './cloudinary';
import { boundedBytes, PhotoError } from './student-photo-image';

export async function uploadPhoto(publicId: string, bytes: Buffer): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const stream = getCloudinary().uploader.upload_stream({
        public_id: publicId, resource_type: 'image', type: 'authenticated',
        overwrite: false, unique_filename: false, use_filename: false,
        format: 'webp', allowed_formats: ['webp'], tags: ['schooldesk-student-photo-v1'], timeout: 30_000,
      }, (error, result) => {
        if (error || !result || result.public_id !== publicId || result.type !== 'authenticated' || result.resource_type !== 'image' || result.format !== 'webp') reject(new Error('Upload failed'));
        else resolve();
      });
      stream.on('error', reject);
      stream.end(bytes);
    });
  } catch {
    // A timed-out upload may complete later. Never assume it created no asset.
    cleanupRequired(publicId, 'upload-outcome-unknown');
    throw new PhotoError(503, 'Photo storage is temporarily unavailable. Refresh before retrying.');
  }
}

export function cleanupRequired(publicId: string, reason: string) {
  // Generated non-secret identifier only; never log provider errors or signed URLs.
  console.error('student-photo-reconciliation-required', { publicId, reason });
}
export async function cleanupPhoto(publicId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result: unknown = await getCloudinary().uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated', invalidate: true });
      if (typeof result === 'object' && result !== null && 'result' in result && (result.result === 'ok' || result.result === 'not found')) return true;
    } catch { /* Bounded retry. DB state remains authoritative. */ }
  }
  cleanupRequired(publicId, 'delete-failed');
  return false;
}

export async function readPhoto(publicId: string): Promise<Buffer> {
  try {
    const url = getCloudinary().utils.private_download_url(publicId, 'webp', {
      resource_type: 'image', type: 'authenticated', attachment: false,
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    // Fetch only SDK-generated URLs, never Student.imageUrl or a client URL.
    const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== 'image/webp') {
      await response.body?.cancel(); throw new Error('Delivery failed');
    }
    return await boundedBytes(response.body);
  } catch { throw new PhotoError(503, 'Photo could not be loaded. Please retry.'); }
}
