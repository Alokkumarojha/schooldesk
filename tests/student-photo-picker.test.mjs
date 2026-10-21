import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function harness() {
  const states = [], refs = [], cleanup = [], revoked = [], changes = [];
  let cursor = 0, refCursor = 0, sequence = 0;
  const code = ts.transpileModule(readFileSync(new URL('../src/components/student-photo-picker.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  class LocalURL extends URL {
    static createObjectURL() { return `blob:local-${++sequence}`; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const imports = id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'next/image') return { default: 'Image' };
    if (id === 'react') return {
      useId: () => 'photo', useEffect: fn => { if (!cleanup.length) cleanup.push(fn()); },
      useRef: initial => { const i = refCursor++; return refs[i] ??= { current: initial }; },
      useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    };
    throw new Error(`Forbidden import ${id}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { URL: LocalURL })(imports, mod, mod.exports);
  return { ...mod.exports, revoked, changes, cleanup,
    render() { cursor = 0; refCursor = 0; return mod.exports.StudentPhotoPicker({ imageUrl: 'https://example.test/photo.jpg', disabled: false, onDraftChange: value => changes.push(value) }); },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, text) => nodes(tree).find(n => n.type === 'button' && n.props.children === text);
const select = (tree, file) => nodes(tree).find(n => n.type === 'input').props.onChange({ currentTarget: { files: file ? [file] : [], value: '' } });

test('picker permits JPEG PNG WebP up to 2 MB and rejects empty/oversized/other types', () => {
  const { photoSelectionError: validate } = harness();
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(validate({ type, size: 2097152 }), null);
  for (const file of [{ type: 'image/gif', size: 1 }, { type: 'image/svg+xml', size: 1 }, { type: '', size: 5 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: 2097153 }]) assert.ok(validate(file));
});
test('selection, replacement, removal, reset and unmount release local URLs without uploads', () => {
  const h = harness(); let tree = h.render();
  select(tree, { type: 'image/png', size: 100 }); tree = h.render();
  assert.ok(JSON.stringify(tree).includes('blob:local-1')); assert.equal(h.changes.at(-1), true);
  select(tree, { type: 'image/webp', size: 100 }); tree = h.render();
  assert.deepEqual(h.revoked, ['blob:local-1']);
  button(tree, 'Remove photo').props.onClick(); tree = h.render();
  assert.ok(JSON.stringify(tree).includes('Photo removed from preview'));
  assert.deepEqual(h.revoked, ['blob:local-1', 'blob:local-2']);
  button(tree, 'Reset photo preview').props.onClick(); tree = h.render();
  assert.equal(h.changes.at(-1), false); assert.ok(JSON.stringify(tree).includes('https://example.test/photo.jpg'));
  select(tree, { type: 'image/jpeg', size: 100 }); h.cleanup[0]();
  assert.equal(h.revoked.at(-1), 'blob:local-3');
});
test('invalid selection and cancelled chooser preserve the current image', () => {
  const h = harness(); select(h.render(), { type: 'image/svg+xml', size: 100 });
  const tree = h.render(); assert.ok(nodes(tree).some(n => n.props?.role === 'alert'));
  assert.ok(JSON.stringify(tree).includes('https://example.test/photo.jpg'));
  select(tree, null); assert.equal(h.changes.length, 0);
});
test('profile form omits imageUrl and blocks submission for a local photo draft', () => {
  const source = readFileSync(new URL('../src/components/student-profile-form.tsx', import.meta.url), 'utf8');
  assert.match(source, /delete raw\.imageUrl/);
  assert.match(source, /if \(busy.current \|\| loading \|\| classError \|\| photoDraft\) return/);
  assert.match(source, /disabled=\{pending \|\| loading \|\| !!classError \|\| photoDraft\}/);
});
