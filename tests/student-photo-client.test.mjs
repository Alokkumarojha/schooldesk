import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as zod from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib');
const version = `"photo-${'a'.repeat(64)}"`;
const newVersion = `"photo-${'b'.repeat(64)}"`;
const input = { name: 'Synthetic', classId: 'class-a', guardianName: 'Guardian', guardianPhone: '+919876543210', status: 'ACTIVE' };
const optional = ['firstName', 'middleName', 'lastName', 'gender', 'dateOfBirth', 'bloodGroup', 'imageUrl', 'admissionDate', 'rollNumber', 'academicYear', 'guardianRelation', 'alternateGuardianPhone', 'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'country'];
const student = { ...Object.fromEntries(optional.map(key => [key, null])), ...input, id: 'student-a', studentId: 'SD001', guardianEmail: null,
  class: { id: 'class-a', code: '6a', name: 'Class 6 A', room: '1', capacity: 30 } };
function harness(responses) {
  const calls = [], cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    function imports(id) {
      if (id === 'zod') return zod;
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), `${id}.ts`));
      throw new Error(`Forbidden import ${id}`);
    }
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { URL, Headers, Response,
      fetch: async (url, init) => { calls.push({ url, init }); assert.ok(responses.length, 'Unexpected request'); const next = responses.shift(); if (next instanceof Error) throw next; return next; },
    })(imports, mod, mod.exports);
    return mod.exports;
  }
  return { api: load(path.join(root, 'student-photo-client.ts')), calls };
}
const file = () => new File(['synthetic mocked bytes'], 'photo.png', { type: 'image/png' });
const savedPhoto = (imageUrl = 'cld-auth:v1:server-confirmed', cleanupPending = false) => Response.json({ photo: { imageUrl, version: newVersion }, cleanupPending });

test('photo metadata uses scoped no-store request without following legacy redirects', async () => {
  const h = harness([Response.json({ photo: { imageUrl: 'https://legacy.test/photo.jpg', version } })]);
  const result = await h.api.loadPhotoState('school-a', 'student-a');
  assert.equal(result.version, version); assert.equal(h.calls[0].init.redirect, 'error');
  assert.equal(h.calls[0].init.headers.get('X-School-Id'), 'school-a'); assert.equal(h.calls[0].init.cache, 'no-store');
  assert.equal(h.calls[0].init.credentials, 'same-origin'); assert.match(h.calls[0].url, /metadata=1/);
  assert.equal(h.api.legacyPhotoUrl(result.imageUrl), result.imageUrl);
  assert.equal(h.api.legacyPhotoUrl('cld-auth:v1:asset'), null); assert.equal(h.api.legacyPhotoUrl('javascript:alert(1)'), null);
});
test('managed delivery consumes bytes only when ETag matches and never redirects to Cloudinary', async () => {
  const h = harness([new Response('image', { headers: { 'Content-Type': 'image/webp', ETag: version } }),
    new Response('image', { headers: { 'Content-Type': 'image/webp', ETag: newVersion } })]);
  assert.equal((await h.api.loadPhotoBlob('school-a', 'student-a', version)).type, 'image/webp');
  assert.equal(h.calls[0].init.redirect, 'error');
  await assert.rejects(h.api.loadPhotoBlob('school-a', 'student-a', version), error => error.status === 409);
});
test('upload and replacement send the File itself with Content-Type and If-Match', async () => {
  for (const token of [version, newVersion]) {
    const h = harness([savedPhoto()]); const selected = file();
    await h.api.savePhoto('school-a', 'student-a', { type: 'upload', file: selected }, token);
    assert.equal(h.calls[0].init.body, selected); assert.equal(h.calls[0].init.method, 'PUT');
    assert.equal(h.calls[0].init.headers.get('If-Match'), token); assert.equal(h.calls[0].init.headers.get('Content-Type'), 'image/png');
  }
});
test('remove sends no body and returns the server-confirmed null reference', async () => {
  const h = harness([savedPhoto(null)]);
  const result = await h.api.savePhoto('school-a', 'student-a', { type: 'remove' }, version);
  assert.equal(h.calls[0].init.method, 'DELETE'); assert.equal(h.calls[0].init.body, undefined); assert.equal(result.photo.imageUrl, null);
});
test('complete save strips imageUrl from ordinary PUT and returns confirmed photo with cleanup warning', async () => {
  const h = harness([Response.json({ student }), savedPhoto('cld-auth:v1:new', true)]); let checkpoint;
  const result = await h.api.saveProfileWithPhoto('school-a', 'student-a', { ...input, imageUrl: 'blob:do-not-send' }, { type: 'upload', file: file() }, version, null, value => { checkpoint = value; });
  assert.equal(JSON.parse(h.calls[0].init.body).imageUrl, undefined); assert.equal(result.student.imageUrl, 'cld-auth:v1:new');
  assert.equal(result.cleanupPending, true); assert.equal(checkpoint.student.id, student.id);
});
test('failed profile save never attempts upload and reset/no-photo saves only normal fields', async () => {
  const h = harness([Response.json({ error: 'PRIVATE' }, { status: 403 })]);
  await assert.rejects(h.api.saveProfileWithPhoto('school-a', 'student-a', input, { type: 'upload', file: file() }, version, null, () => {}));
  assert.equal(h.calls.length, 1);
  const reset = harness([Response.json({ student })]);
  await reset.api.saveProfileWithPhoto('school-a', 'student-a', input, null, null, null, () => {});
  assert.equal(reset.calls.length, 1);
});
test('partial failure retains checkpoint and file for retry without repeating confirmed profile PUT', async () => {
  const h = harness([Response.json({ student }), Response.json({ error: 'PRIVATE' }, { status: 503 }), savedPhoto()]);
  let checkpoint; const draft = { type: 'upload', file: file() };
  await assert.rejects(h.api.saveProfileWithPhoto('school-a', 'student-a', input, draft, version, null, value => { checkpoint = value; }), error => {
    assert.equal(error.student.id, student.id); assert.match(error.message, /Profile details were saved/); assert.doesNotMatch(error.message, /PRIVATE/); return true;
  });
  const result = await h.api.saveProfileWithPhoto('school-a', 'student-a', input, draft, version, checkpoint, () => {});
  assert.equal(h.calls.length, 3); assert.equal(h.calls[2].init.body, draft.file); assert.equal(result.student.imageUrl, 'cld-auth:v1:server-confirmed');
});
test('changed fields after partial success are saved again before photo retry', async () => {
  const h = harness([Response.json({ student: { ...student, name: 'Changed' } }), savedPhoto(null)]);
  const checkpoint = { fingerprint: JSON.stringify(input), student };
  const result = await h.api.saveProfileWithPhoto('school-a', 'student-a', { ...input, name: 'Changed' }, { type: 'remove' }, version, checkpoint, () => {});
  assert.equal(h.calls.length, 2); assert.equal(result.student.name, 'Changed');
});
test('permission, validation, conflict and uncertain network failures remain safe and explicit', async () => {
  for (const status of [400, 401, 403, 409, 413, 415, 428, 500, 503]) {
    const h = harness([Response.json({ error: 'PRIVATE provider credentials' }, { status })]);
    await assert.rejects(h.api.savePhoto('school-a', 'student-a', { type: 'remove' }, version), error => error.status === status && !error.message.includes('PRIVATE'));
  }
  const h = harness([new Error('PRIVATE network')]);
  await assert.rejects(h.api.savePhoto('school-a', 'student-a', { type: 'upload', file: file() }, version), /could not be confirmed/);
});
