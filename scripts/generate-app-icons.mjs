import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Reuse the existing vector brand; Sharp is already a project dependency.
const source = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const destination = new URL('../public/icons/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const [filename, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(Buffer.from(source)).resize(size, size).flatten({ background: '#285cdd' })
    .png().toFile(fileURLToPath(new URL(filename, destination)));
}
// Inset the source to keep the book inside the maskable 40%-radius safe circle.
const maskable = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 32 32">'
  + '<rect width="32" height="32" fill="#285cdd"/><g transform="translate(3.2 3.2) scale(0.8)">'
  + source.replace(/<svg[^>]*>|<\/svg>/g, '') + '</g></svg>';
await sharp(Buffer.from(maskable)).flatten({ background: '#285cdd' }).png()
  .toFile(fileURLToPath(new URL('icon-maskable-512.png', destination)));
