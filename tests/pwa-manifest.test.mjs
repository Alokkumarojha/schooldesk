import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';

function load(file) {
  const source = readFileSync(new URL('../src/app/' + file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext('(function(require,module,exports){' + code + '\n})')(() => ({}), mod, mod.exports);
  return mod.exports;
}
const manifest = load('manifest.ts').default();
test('manifest exposes only public branding and stable standalone entry points', () => {
  assert.equal(manifest.name, 'SchoolDesk'); assert.equal(manifest.short_name, 'SchoolDesk');
  for (const key of ['id', 'scope', 'start_url']) assert.equal(manifest[key], '/');
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.theme_color, '#285cdd');
  assert.equal(manifest.background_color, '#f5f7fb');
  assert.deepEqual(manifest.icons.map(i => i.sizes).sort().join(','), '192x192,512x512,512x512');
});
test('manifest and Apple icons are valid opaque PNGs of the declared dimensions', async () => {
  for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]) {
    const metadata = await sharp(readFileSync(new URL('../public' + icon.src, import.meta.url))).metadata();
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(metadata.format, 'png'); assert.equal(icon.type, 'image/png');
    assert.equal(metadata.width, width); assert.equal(metadata.height, height);
    assert.equal(metadata.hasAlpha, false);
  }
});
test('maskable book artwork fits within the central 40-percent-radius safe circle', async () => {
  const icon = manifest.icons.find(icon => icon.purpose === 'maskable');
  assert.ok(icon);
  const { data, info } = await sharp(readFileSync(new URL('../public' + icon.src, import.meta.url))).raw().toBuffer({ resolveWithObject: true });
  let whitePixels = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * info.channels;
    if (data[offset] > 220 && data[offset + 1] > 220 && data[offset + 2] > 220) {
      whitePixels++;
      assert.ok(Math.hypot(x + 0.5 - 256, y + 0.5 - 256) <= 512 * 0.4);
    }
  }
  assert.ok(whitePixels > 1000);
});
test('layout keeps favicon and robots metadata, supports Apple and safe-area viewport without blocking zoom', () => {
  const { metadata, viewport } = load('layout.tsx');
  assert.equal(metadata.icons.icon, '/favicon.svg');
  assert.equal(metadata.icons.apple.url, '/icons/apple-touch-icon.png');
  assert.equal(metadata.appleWebApp.capable, true);
  assert.equal(metadata.appleWebApp.title, 'SchoolDesk');
  assert.equal(metadata.robots.index, false);
  assert.equal(viewport.width, 'device-width'); assert.equal(viewport.initialScale, 1);
  assert.equal(viewport.viewportFit, 'cover');
  assert.notEqual(viewport.userScalable, false); assert.equal(viewport.maximumScale, undefined);
});
