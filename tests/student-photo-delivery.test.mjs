import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('authenticated display revokes URLs on reload/unmount and hides previous-school results immediately', async () => {
  const state = []; let cursor = 0, dependencies, pending, cleanup, sequence = 0;
  const revoked = [], calls = [];
  const code = ts.transpileModule(readFileSync(new URL('../src/components/use-student-photo.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const imports = id => {
    if (id === 'react') return {
      useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
      useEffect: (fn, deps) => {
        if (!dependencies || deps.some((dep, i) => dep !== dependencies[i])) { dependencies = deps; pending = fn; }
      },
    };
    if (id === '@/lib/student-photo-client') return {
      legacyPhotoUrl: () => null,
      loadPhotoState: async (school, id) => { calls.push([school, id]); return { imageUrl: 'cld-auth:v1:managed', version: 'token' }; },
      loadPhotoBlob: async () => new Blob(['image'], { type: 'image/webp' }),
    };
    throw new Error(`Forbidden import ${id}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    AbortController, URL: { createObjectURL: () => `blob:${++sequence}`, revokeObjectURL: url => revoked.push(url) },
  })(imports, mod, mod.exports);
  function render(school = 'a') { cursor = 0; return mod.exports.useStudentPhoto(school, 'student', 'cld-auth:v1:managed'); }
  async function effect() { cleanup?.(); cleanup = pending(); pending = null; await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(render().loading, true); await effect();
  const initial = render(); assert.equal(initial.src, 'blob:1');
  initial.reload(); assert.equal(render().src, null); await effect(); assert.equal(render().src, 'blob:2');
  assert.deepEqual(revoked, ['blob:1']);
  assert.equal(render('b').src, null); await effect(); assert.equal(render('b').src, 'blob:3');
  cleanup(); assert.deepEqual(revoked, ['blob:1', 'blob:2', 'blob:3']);
  assert.deepEqual(calls, [['a', 'student'], ['a', 'student'], ['b', 'student']]);
});
