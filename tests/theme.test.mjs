import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
function luminance(hex) {
  const value = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
for (const selector of [':root', '.dark']) {
  test(`${selector}: text and interactive/status labels meet WCAG AA contrast`, () => {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+): (#[\da-f]+);/g)].map(m => [m[1], m[2]]));
    const pairs = [
      ...['paper', 'surface', 'subtle', 'input', 'hover'].flatMap(bg => [['ink', bg], ['muted', bg]]),
      ['on-solid', 'primary'], ['on-solid', 'primary-hover'], ['blue', 'selected'],
      ...['success', 'danger', 'warning', 'late', 'info', 'badge', 'accent', 'teal', 'purple'].map(role => [`${role}-text`, `${role}-surface`]),
      ['on-solid', 'toast'], ['nav-muted', 'nav'],
    ];
    for (const [fg, bg] of pairs) {
      const values = [luminance(tokens[fg]), luminance(tokens[bg])].sort((a, b) => b - a);
      const contrast = (values[0] + 0.05) / (values[1] + 0.05);
      assert.ok(contrast >= 4.5, `${selector} ${fg}/${bg}: ${contrast.toFixed(2)}`);
    }
  });
}
