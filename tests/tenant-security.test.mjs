import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as zod from 'zod';
import * as crypto from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = {
  students: ['GET', 'POST'], 'students/[id]': ['GET', 'PUT', 'DELETE'],
  classes: ['GET', 'POST'], 'classes/[id]': ['PUT', 'DELETE'],
  teachers: ['GET', 'POST'], 'teachers/[id]': ['PUT', 'DELETE'],
  notices: ['GET', 'POST'], 'notices/[id]': ['PUT', 'DELETE'],
  attendance: ['GET', 'PUT'], dashboard: ['GET'],
  'school/settings': ['GET', 'PATCH'],
  'students/[id]/history': ['GET'], 'students/[id]/remarks': ['POST'],
  'students/[id]/photo': ['GET', 'PUT', 'DELETE'],
};
class KnownError extends Error { constructor(code) { super('PRIVATE DRIVER DETAILS'); this.code = code; } }
class InitError extends Error {}
const enumValues = values => Object.fromEntries(values.map(v => [v, v]));
const prismaExports = {
  Prisma: { PrismaClientKnownRequestError: KnownError, PrismaClientInitializationError: InitError,
    TransactionIsolationLevel: enumValues(['Serializable', 'RepeatableRead']) },
  StudentStatus: enumValues(['ACTIVE', 'INACTIVE']),
  AttendanceStatus: enumValues(['PRESENT', 'ABSENT', 'LATE']),
  NoticeAudience: enumValues(['EVERYONE', 'TEACHERS', 'PARENTS', 'STUDENTS']),
};
const compiled = new Map();

// Execute the actual helpers/handlers with an allowlisted module loader. The VM
// has no process, network, real Clerk or real Prisma modules. Unexpected imports
// and academic queries fail closed, so these tests cannot reach Neon.
function harness(options = {}, models = {}) {
  const calls = [];
  const transactions = [];
  let membershipReads = 0;
  const member = { schoolId: 'school-a', userId: 'user-a', role: options.role ?? 'OWNER',
    isActive: options.memberActive ?? true, school: { isActive: options.schoolActive ?? true } };
  const db = {
    school: { async findUnique(args) {
      if (models.school?.findUnique) { calls.push({ model: 'school', method: 'findUnique', args }); return models.school.findUnique(args); }
      const { where, select } = args;
      assert.equal(where.id, 'school-a'); assert.equal(where.isActive, true);
      assert.equal(select.name, true); assert.equal(select.id, true);
      return options.schoolGone ? null : { id: 'school-a', name: 'Verified School', academicYear: '2026-2027' };
    }, async update(args) {
      calls.push({ model: 'school', method: 'update', args });
      assert.ok(models.school?.update, 'Unexpected School write'); return models.school.update(args);
    } },
    user: { async findUnique({ where }) {
      assert.equal(where.clerkId, 'verified-clerk');
      if (options.dbDown) throw new Error('PRIVATE CONNECTION STRING');
      return options.noUser ? null : { id: 'user-a' };
    } },
    schoolMember: {
      async findUnique({ where }) {
        membershipReads++;
        assert.equal(where.schoolId_userId.userId, 'user-a');
        if (membershipReads > 1 && options.revokeInTransaction) return { ...member, isActive: false };
        return options.noMember || where.schoolId_userId.schoolId !== 'school-a' ? null : member;
      },
      async findMany({ where, take }) {
        assert.equal(where.userId, 'user-a'); assert.equal(where.isActive, true);
        assert.equal(where.school.isActive, true); assert.equal(take, 2);
        return options.multiple ? [member, { ...member, schoolId: 'school-b' }] : options.noMember ? [] : [member];
      },
    },
    async $transaction(work, settings) {
      transactions.push(settings);
      if (options.retry && transactions.length === 1) throw new KnownError('P2034');
      const snapshot = options.snapshot?.();
      try { return await (typeof work === 'function' ? work(db) : Promise.all(work)); }
      catch (error) { options.rollback?.(snapshot); throw error; }
    },
    async $queryRaw(strings, ...values) {
      const sql = strings.join('?');
      calls.push({ model: '$queryRaw', sql, values });
      if (sql.includes('AS highest')) return [{ highest: '12' }];
      assert.match(sql, /s\."schoolId" = \?/);
      assert.match(sql, /a\."schoolId" = \?/);
      assert.deepEqual(values, ['school-a', 'school-a', '2026-09-22']);
      return [{ count: 0 }];
    },
  };
  for (const model of ['student', 'studentHistory', 'teacher', 'class', 'notice', 'attendance', 'attendanceRecord']) {
    db[model] = {};
    for (const method of ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findMany', 'count', 'create', 'createMany', 'update', 'updateMany', 'delete']) {
      db[model][method] = async args => {
        calls.push({ model, method, args });
        const implementation = models[model]?.[method];
        assert.ok(implementation, `Unexpected ${model}.${method}`);
        return implementation(args);
      };
    }
  }
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    if (!compiled.has(filename)) compiled.set(filename, ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText);
    function mockImport(id) {
      if (id === 'node:crypto') return crypto;
      if (id === 'sharp') return { default: sharp };
      if (id === 'server-only') return {};
      if (id === 'zod') return zod;
      if (id === '@clerk/nextjs/server') return { currentUser: async () => {
        if (options.profileDown) throw new Error('PRIVATE CLERK PROFILE ERROR');
        return options.profile === undefined ? {
          id: 'verified-clerk', fullName: 'Real Account', username: null,
          primaryEmailAddress: { emailAddress: 'account@example.test' },
          hasImage: true, imageUrl: 'https://img.clerk.com/test-avatar',
          privateMetadata: { secret: 'PRIVATE' },
        } : options.profile;
      }, auth: async () => {
        if (options.authDown) throw new Error('PRIVATE CLERK ERROR');
        return { userId: options.signedOut ? null : 'verified-clerk' };
      } };
      if (id.includes('generated/prisma')) return prismaExports;
      const resolved = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id.startsWith('.') ? path.resolve(path.dirname(filename), id) : null;
      if (!resolved) throw new Error(`Disallowed test import: ${id}`);
      if (resolved === path.join(root, 'src/lib/prisma')) return { getPrisma: () => db };
      if (resolved === path.join(root, 'src/lib/cloudinary')) return { getCloudinary: () => {
        assert.ok(options.cloudinary, 'Cloudinary access must be explicitly mocked'); return options.cloudinary;
      } };
      return load(resolved + '.ts');
    }
    vm.runInNewContext(`(function(require, module, exports) {${compiled.get(filename)}\n})`, {
      Request, Response, Headers, URL, URLSearchParams, Date, Buffer, AbortSignal,
      console: { error: (...args) => options.log?.(...args) },
      fetch: options.fetch ?? (() => { throw new Error('Network access is forbidden in tests.'); }),
    }, { filename })(mockImport, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return { calls, transactions, db, route: name => load(path.join(root, `src/app/api/${name}/route.ts`)),
    access: () => load(path.join(root, 'src/lib/school-access.ts')),
    client: name => load(path.join(root, `src/lib/${name}.ts`)) };
}
function request(method, body, school = 'school-a', extraHeaders = {}, query = '') {
  return new Request(`https://schooldesk.test/api/test${query}`, {
    method, headers: { ...(school === null ? {} : { 'X-School-Id': school }), ...extraHeaders },
    ...(method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}
const context = id => ({ params: Promise.resolve({ id }) });
const remarkInput = { title: 'Synthetic remark', category: 'POSITIVE', description: 'Synthetic description' };

test('remark preflight validates and scopes requests but cannot write categoryless history', async () => {
  for (const role of ['OWNER', 'ADMIN']) {
    const h = harness({ role }, { student: { findUnique: ({ where }) => {
      assert.equal(where.schoolId, 'school-a'); assert.equal(where.class.schoolId, 'school-a');
      return where.id === 'student-a' ? { id: 'student-a' } : null;
    } } });
    const post = h.route('students/[id]/remarks').POST;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await post(request('POST', remarkInput), context('student-a'));
      assert.equal(response.status, 501);
      assert.equal((await response.json()).code, 'REMARK_STORAGE_NOT_READY');
    }
    assert.equal((await post(request('POST', remarkInput), context('foreign-id'))).status, 404);
    assert.ok(h.calls.every(call => call.model === 'student' && call.method === 'findUnique'));
    assert.equal(h.transactions.length, 0);
  }
});

test('remark payloads reject invalid categories, lengths and forged audit fields before record access', async () => {
  const h = harness(); const post = h.route('students/[id]/remarks').POST;
  for (const patch of [
    { title: ' ' }, { title: 'x'.repeat(161) }, { description: '' }, { description: 'x'.repeat(3001) },
    { category: 'OTHER' }, { category: null }, { schoolId: 'foreign' },
    { createdById: 'attacker' }, { fromClassId: 'foreign' }, { logType: 'PROMOTION' },
  ]) assert.equal((await post(request('POST', { ...remarkInput, ...patch }), context('student-a'))).status, 400);
  assert.equal((await post(new Request('https://schooldesk.test/api/test', {
    method: 'POST', headers: { 'X-School-Id': 'school-a' }, body: '{',
  }), context('student-a'))).status, 400);
  assert.equal((await post(request('POST', remarkInput, 'school-a', { Origin: 'https://foreign.test' }), context('student-a'))).status, 403);
  assert.equal(h.calls.length, 0);
  const parsed = h.client('student-remarks').remarkSchema.parse({ ...remarkInput, title: '  Trim me  ' });
  assert.equal(parsed.title, 'Trim me');
});

test('teacher role cannot substitute for a verified Teacher identity or assignment', async () => {
  const h = harness({ role: 'TEACHER' });
  const result = await h.route('students/[id]/remarks').POST(request('POST', {
    ...remarkInput, teacherId: 'T01', classId: 'class-a',
  }), context('student-a'));
  assert.equal(result.status, 403);
  assert.equal(h.calls.length, 0); // No email/name matching and no guessed Teacher queries.
});

test('single student GET scopes reads and returns explicit edit permissions', async () => {
  for (const role of ['OWNER', 'ADMIN', 'TEACHER', 'STAFF', 'ACCOUNTANT']) {
    const h = harness({ role }, { student: { findUnique: ({ where, select }) => {
      assert.equal(where.schoolId, 'school-a'); assert.equal(where.class.schoolId, 'school-a');
      assert.equal(select.firstName, true);
      return where.id === 'student-a' ? { id: 'student-a', status: 'GRADUATED', dateOfBirth: null, admissionDate: null } : null;
    } } });
    const get = h.route('students/[id]').GET;
    const response = await get(request('GET'), context('student-a'));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.student.status, 'GRADUATED');
    assert.equal(data.permissions.canEdit, ['OWNER', 'ADMIN'].includes(role));
    assert.equal(data.permissions.canAddRemark, false);
    assert.equal((await get(request('GET'), context('foreign-id'))).status, 404);
  }
});

test('profile client validates identity, nullable fields, errors and scoped history pagination', async () => {
  const optional = ['firstName', 'middleName', 'lastName', 'gender', 'dateOfBirth', 'bloodGroup', 'imageUrl',
    'admissionDate', 'rollNumber', 'academicYear', 'guardianRelation', 'alternateGuardianPhone',
    'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'country'];
  const student = { ...Object.fromEntries(optional.map(key => [key, null])), ...studentInput,
    id: 'student-a', studentId: 'SD001', guardianEmail: null, class: studentClass, status: 'TRANSFERRED' };
  let responseBody = { student, permissions: { canEdit: true, canAddRemark: false } };
  let status = 200; const requests = [];
  const h = harness({ fetch: async (url, init) => {
    requests.push({ url, init }); return Response.json(responseBody, { status });
  } });
  const client = h.client('student-profile-client');
  assert.equal((await client.loadStudentProfile('school-a', 'student-a')).student.status, 'TRANSFERRED');
  assert.equal(new Headers(requests[0].init.headers).get('X-School-Id'), 'school-a');
  assert.equal(requests[0].init.cache, 'no-store');
  responseBody = { ...responseBody, student: { ...student, id: 'foreign' } };
  await assert.rejects(client.loadStudentProfile('school-a', 'student-a'), /Unexpected/);
  status = 404; responseBody = { error: 'PRIVATE DATABASE MESSAGE' };
  await assert.rejects(client.loadStudentProfile('school-a', 'student-a'), error => !error.message.includes('PRIVATE'));
  status = 200; responseBody = { history: [], limit: 20, nextCursor: null };
  assert.equal((await client.loadStudentHistory('school-a', 'student-a', 'cursor +')).nextCursor, null);
  assert.match(requests.at(-1).url, /cursor=cursor\+%2B/);
});
const studentInput = { name: 'Synthetic student', classId: 'class-a', guardianName: 'Synthetic guardian', guardianPhone: '+919876543210', status: 'ACTIVE' };
const teacherInput = { name: 'Synthetic teacher', subject: 'Math', email: 'synthetic@example.test', phone: '+919876543210', classId: null };
const studentClass = { id: 'class-a', name: 'Class 6 · A', code: '6a', capacity: 30, room: 'R' };
const classInput = { code: 'test', name: 'Test', room: 'R', capacity: 10, classTeacherId: null };
const noticeInput = { title: 'Synthetic', body: 'Synthetic notice', audience: 'EVERYONE', date: '2026-10-19' };
const inputs = { students: studentInput, teachers: teacherInput, classes: classInput, notices: noticeInput, attendance: { classId: 'class-a', date: '2026-10-19', records: [] } };

for (const [route, methods] of Object.entries(routes)) {
  for (const method of methods) {
    test(`${method} ${route}: authentication, membership, school and role gates precede record access`, async () => {
      for (const [options, school, status] of [
        [{ signedOut: true }, 'school-a', 401], [{ memberActive: false }, 'school-a', 403],
        [{ schoolActive: false }, 'school-a', 403], [{ noUser: true }, 'school-a', 403],
        [{ noMember: true }, 'school-a', 403], [{}, 'school-b', 403], [{}, null, 400],
        [{ authDown: true }, 'school-a', 503], [{ dbDown: true }, 'school-a', 503],
        [{ role: 'PARENT' }, 'school-a', 403], [{ role: 'STUDENT' }, 'school-a', 403],
        ...(method === 'GET' ? [] : ['TEACHER', 'STAFF', 'ACCOUNTANT'].map(role => [{ role }, 'school-a', 403])),
      ]) {
        const h = harness(options);
        const response = await h.route(route)[method](request(method, {}, school), context('foreign-id'));
        assert.equal(response.status, status, JSON.stringify({ options, route, method }));
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.doesNotMatch(await response.text(), /PRIVATE/);
        assert.equal(h.calls.length, 0);
      }
    });
  }
}

test('active school never chooses an arbitrary membership', async () => {
  for (const options of [{ multiple: true }, { noMember: true }, { signedOut: true }]) {
    const h = harness(options);
    await assert.rejects(h.access().requireActiveSchool(), error => error.status === (options.signedOut ? 401 : 403));
  }
  const access = await harness().access().requireActiveSchool();
  assert.equal(access.schoolId, 'school-a');
});

for (const [resource, model] of [['students', 'student'], ['teachers', 'teacher'], ['classes', 'class'], ['notices', 'notice']]) {
  test(`${resource}: foreign internal IDs cannot be updated or deleted`, async () => {
    const notFound = ({ where }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(where.id, 'foreign-id'); return null; };
    const missing = args => { notFound(args); throw new KnownError('P2025'); };
    const h = harness({}, { [model]: { findUnique: notFound, update: missing, delete: missing } });
    for (const method of ['PUT', 'DELETE']) {
      const response = await h.route(`${resource}/[id]`)[method](request(method, inputs[resource]), context('foreign-id'));
      assert.equal(response.status, 404);
    }
    assert.equal(h.calls.filter(c => c.method === 'create' || c.method === 'updateMany').length, 0);
  });
}

test('list queries and nested class teacher/count projections are school-scoped', async () => {
  const group = { id: 'class-a', code: '6a', name: 'Class 6 · A', room: 'R', capacity: 10, classTeacher: null, _count: { students: 0 } };
  const h = harness({}, {
    student: { findMany: ({ where }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(where.class.schoolId, 'school-a'); return []; } },
    teacher: { findMany: ({ where, select }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(select.class.where.schoolId, 'school-a'); return []; } },
    class: { findMany: ({ where, select }) => {
      assert.equal(where.schoolId, 'school-a'); assert.equal(select.classTeacher.where.schoolId, 'school-a');
      assert.equal(select._count.select.students.where.schoolId, 'school-a'); return [group];
    } },
    notice: { findMany: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return []; } },
  });
  for (const route of ['students', 'teachers', 'classes', 'notices']) {
    const response = await h.route(route).GET(request('GET'));
    assert.equal(response.status, 200);
    if (route === 'classes') {
      const body = await response.json(); assert.equal(body.classes[0].studentCount, 0); assert.equal(body.classes[0].classTeacher, null);
    }
  }
});

test('student create/update reject a foreign class before any write', async () => {
  const h = harness({}, {
    student: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return { classId: 'class-a' }; } },
    class: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(where.id, 'class-b'); return null; } },
  });
  for (const [route, method] of [['students', 'POST'], ['students/[id]', 'PUT']]) {
    assert.equal((await h.route(route)[method](request(method, { ...studentInput, classId: 'class-b' }), context('student-a'))).status, 404);
  }
  assert.ok(h.calls.every(c => !['create', 'update'].includes(c.method)));
});

test('student capacity, serializable retry, server-owned school and stable public ID', async () => {
  let stored;
  const h = harness({ retry: true }, {
    class: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return { capacity: 2 }; } },
    student: {
      count: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return 1; },
      create: ({ data }) => { assert.equal(data.schoolId, 'school-a'); stored = { ...data, id: 'new-id', class: studentClass }; return stored; },
      findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return stored; },
      update: ({ where, data }) => {
        assert.equal(where.schoolId, 'school-a'); assert.ok(!('studentId' in data));
        stored = { ...stored, ...data }; return stored;
      },
      delete: ({ where }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(where.id, stored.id); const old = stored; stored = null; return old; },
    },
    studentHistory: { create: ({ data }) => data },
  });
  const created = await h.route('students').POST(request('POST', { ...studentInput, schoolId: 'school-b', role: 'OWNER' }));
  assert.equal(created.status, 201); assert.equal((await created.json()).student.studentId, 'SD013');
  const updated = await h.route('students/[id]').PUT(request('PUT', { ...studentInput, name: 'Updated' }), context('new-id'));
  assert.equal(updated.status, 200); assert.equal((await updated.json()).student.studentId, 'SD013');
  assert.equal(stored.name, 'Updated');
  assert.equal((await h.route('students/[id]').DELETE(request('DELETE'), context('new-id'))).status, 204);
  assert.equal(stored, null);
  assert.ok(h.transactions.every(t => t.isolationLevel === 'Serializable')); assert.ok(h.transactions.length >= 3);
  const full = harness({}, { class: { findUnique: () => ({ capacity: 1 }) }, student: { count: () => 1 } });
  assert.equal((await full.route('students').POST(request('POST', studentInput))).status, 409);
});

test('student PUT rejects identifier changes and malformed input', async () => {
  const h = harness();
  for (const input of [{ ...studentInput, studentId: 'SD999' }, { ...studentInput, id: 'foreign' }, { ...studentInput, name: '' }, { ...studentInput, status: 'OWNER' }]) {
    assert.equal((await h.route('students/[id]').PUT(request('PUT', input), context('student-a'))).status, 400);
  }
  assert.equal(h.calls.length, 0);
});

test('class create/update reject foreign teacher assignments', async () => {
  const h = harness({}, {
    class: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return where.id ? { _count: { students: 0 } } : null; } },
    teacher: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(where.id, 'teacher-b'); return null; } },
  });
  for (const [route, method] of [['classes', 'POST'], ['classes/[id]', 'PUT']]) {
    assert.equal((await h.route(route)[method](request(method, { ...classInput, classTeacherId: 'teacher-b' }), context('class-a'))).status, 404);
  }
});

test('teacher create/update reject foreign class assignments', async () => {
  const h = harness({}, {
    teacher: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return { id: 'teacher-a' }; }, findFirst: () => null },
    class: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(where.id, 'class-b'); return null; } },
  });
  for (const [route, method] of [['teachers', 'POST'], ['teachers/[id]', 'PUT']]) {
    assert.equal((await h.route(route)[method](request(method, { ...teacherInput, classId: 'class-b' }), context('teacher-a'))).status, 404);
  }
});

test('attendance rejects foreign classes for reads and saves', async () => {
  const h = harness({}, { class: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return null; } } });
  assert.equal((await h.route('attendance').GET(request('GET', null, 'school-a', {}, '?classId=class-b&date=2026-10-19'))).status, 404);
  assert.equal((await h.route('attendance').PUT(request('PUT', { ...inputs.attendance, classId: 'class-b' }))).status, 404);
});

test('dashboard scopes every aggregate, directory, notice and attendance query', async () => {
  const scoped = ({ where }) => { assert.equal(where.schoolId, 'school-a'); return 0; };
  const scopedList = args => { scoped(args); return []; };
  const h = harness({}, { student: { count: scoped, findMany: scopedList }, class: { count: scoped, findMany: scopedList }, teacher: { count: scoped }, notice: { count: scoped, findMany: scopedList } });
  const response = await h.route('dashboard').GET(request('GET'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).students.total, 0);
});

test('connection failures are safe 503; cross-site mutations are rejected', async () => {
  const h = harness({}, { student: { findMany: () => { throw new KnownError('P1001'); } } });
  const response = await h.route('students').GET(request('GET'));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE/);
  const crossSite = harness();
  assert.equal((await crossSite.route('students').POST(request('POST', studentInput, 'school-a', { Origin: 'https://attacker.test' }))).status, 403);
  assert.equal(crossSite.calls.length, 0);
});

test('ADMIN is explicitly permitted, and a body role cannot elevate a TEACHER', async () => {
  const admin = harness({ role: 'ADMIN' });
  assert.equal((await admin.route('students').POST(request('POST', {}))).status, 400);
  const teacher = harness({ role: 'TEACHER' });
  assert.equal((await teacher.route('students').POST(request('POST', { ...studentInput, role: 'OWNER' }))).status, 403);
  assert.equal(teacher.calls.length, 0);
});

test('student same-class edits keep their seat even when capacity is full', async () => {
  const h = harness({}, {
    student: {
      findUnique: () => ({ ...studentInput, name: 'Before', id: 'student-a', studentId: 'SD001', class: studentClass }),
      update: ({ where, data }) => { assert.equal(where.schoolId, 'school-a'); return { ...data, id: 'student-a', studentId: 'SD001', class: studentClass }; },
    },
    class: { findUnique: () => ({ capacity: 1 }) },
    studentHistory: { create: ({ data }) => data },
  });
  const response = await h.route('students/[id]').PUT(request('PUT', studentInput), context('student-a'));
  assert.equal(response.status, 200);
  // A same-class edit must not fail a fresh admission count check.
  assert.ok(!h.calls.some(c => c.method === 'count'));
});

test('class capacity cannot shrink below enrolment; related-record deletion remains blocked', async () => {
  const h = harness({}, { class: { findUnique: ({ where }) => {
    assert.equal(where.schoolId, 'school-a'); return { _count: { students: 12, attendanceSessions: 0 } };
  } } });
  assert.equal((await h.route('classes/[id]').PUT(request('PUT', classInput), context('class-a'))).status, 409);
  assert.equal((await h.route('classes/[id]').DELETE(request('DELETE'), context('class-a'))).status, 409);
  const related = harness({}, { student: { delete: () => { throw new KnownError('P2003'); } } });
  assert.equal((await related.route('students/[id]').DELETE(request('DELETE'), context('student-a'))).status, 409);
});

test('attendance cannot save foreign students or corrupt a historical school roster', async () => {
  const h = harness({}, {
    class: { findUnique: () => ({ id: 'class-a' }) },
    attendance: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return null; } },
    student: { findMany: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return [{ id: 'student-a' }]; } },
  });
  const input = { ...inputs.attendance, records: [{ studentId: 'student-b', status: 'PRESENT' }] };
  assert.equal((await h.route('attendance').PUT(request('PUT', input))).status, 400);
  const corrupt = harness({}, {
    class: { findUnique: () => ({ id: 'class-a' }) },
    attendance: { findUnique: () => ({ id: 'session-a', records: [{ id: 'record-b', studentId: 'student-b', status: 'PRESENT', student: { schoolId: 'school-b' } }] }) },
  });
  const denied = await corrupt.route('attendance').PUT(request('PUT', input));
  assert.equal(denied.status, 500); assert.doesNotMatch(await denied.text(), /student-b|school-b/);
  assert.ok(corrupt.calls.every(c => !['update', 'create', 'createMany'].includes(c.method)));
});

test('client school header is per-call, no-store and preserved for student CRUD', async () => {
  const calls = [];
  const group = { id: 'class-a', code: '6a', name: 'Class 6 · A', room: 'R', capacity: 10 };
  const student = { ...studentInput, id: 'student-a', studentId: 'SD001', guardianEmail: null, class: group };
  const h = harness({ fetch: async (url, options) => {
    assert.equal(options.headers.get('X-School-Id'), 'school-a');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin');
    calls.push({ url, options });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (options.method) { assert.equal(JSON.parse(options.body).classId, 'class-a'); return Response.json({ student }); }
    return Response.json(url.includes('classes') ? { classes: [{ ...group, studentCount: 0 }] } : { students: [student] });
  } });
  const client = h.client('students-client'); const controller = new AbortController();
  const classes = await client.loadClasses('school-a', controller.signal);
  assert.equal(classes[0].studentCount, 0); assert.equal(classes[0].id, 'class-a');
  const students = await client.loadStudents('school-a', controller.signal);
  assert.equal(client.studentRow(students[0]).classId, '6a'); assert.equal(client.studentRow(students[0]).status, 'Active');
  await client.saveStudent('school-a', studentInput);
  await client.saveStudent('school-a', studentInput, 'student-a');
  await client.deleteStudent('school-a', 'student-a');
  assert.equal(calls.length, 5);
  assert.equal(calls[0].options.signal, controller.signal);
  assert.match(calls[3].url, /student-a/);
});

test('Dashboard identity returns only verified school and minimal Clerk profile without writes', async () => {
  const h = harness();
  const result = await h.client('dashboard-identity').requireDashboardIdentity();
  assert.equal(JSON.stringify(result), JSON.stringify({
    school: { id: 'school-a', name: 'Verified School', academicYear: '2026-2027' },
    user: { name: 'Real Account', email: 'account@example.test', imageUrl: 'https://img.clerk.com/test-avatar' },
  }));
  assert.equal(h.calls.length, 0);
});

test('Dashboard identity handles missing name, email and uploaded image', async () => {
  for (const [profile, name, email] of [
    [{ fullName: '  ', username: 'school-owner' }, 'school-owner', null],
    [{ primaryEmailAddress: { emailAddress: 'owner@example.test' } }, 'owner@example.test', 'owner@example.test'],
    [{}, 'Signed-in user', null],
  ]) {
    const h = harness({ profile: { id: 'verified-clerk', hasImage: false, imageUrl: 'https://img.clerk.com/default', ...profile } });
    const result = await h.client('dashboard-identity').requireDashboardIdentity();
    assert.equal(result.user.name, name); assert.equal(result.user.email, email); assert.equal(result.user.imageUrl, null);
  }
});

test('Dashboard identity fails closed for inaccessible school or mismatched Clerk identity', async () => {
  for (const [options, status] of [
    [{ signedOut: true }, 401], [{ noMember: true }, 403], [{ multiple: true }, 403],
    [{ role: 'PARENT' }, 403], [{ schoolGone: true }, 403],
    [{ profile: null }, 401], [{ profile: { id: 'unverified-clerk' } }, 401], [{ profileDown: true }, 503],
  ]) {
    const h = harness(options);
    await assert.rejects(h.client('dashboard-identity').requireDashboardIdentity(), error => error.status === status && !error.message.includes('PRIVATE'));
    assert.equal(h.calls.length, 0);
  }
});

const schoolProfile = {
  id: 'school-a', name: 'Verified School', code: 'TEST-SCHOOL', logoUrl: null,
  addressLine: null, city: null, state: null, pincode: null, board: null,
  academicYear: '2026-2027', email: null, phone: null,
};

test('school settings reads use verified context and expose edit permission accurately', async () => {
  for (const role of ['OWNER', 'ADMIN', 'TEACHER', 'STAFF', 'ACCOUNTANT']) {
    const h = harness({ role }, { school: { findUnique: ({ where, select }) => {
      assert.equal(where.id, 'school-a'); assert.equal(where.isActive, true);
      assert.equal(where.members.some.userId, 'user-a'); assert.equal(where.members.some.isActive, true);
      assert.equal(select.phone, true); assert.equal(select.email, true); assert.equal(select.academicYear, true);
      assert.equal(select.members, undefined); assert.equal(select.slug, undefined);
      return schoolProfile;
    } } });
    const response = await h.route('school/settings').GET(request('GET'));
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const result = await response.json(); assert.equal(result.school.id, 'school-a');
    assert.equal(result.canEdit, role === 'OWNER' || role === 'ADMIN');
  }
});

test('school settings PATCH updates only supplied supported fields within verified membership', async () => {
  for (const role of ['OWNER', 'ADMIN']) {
    let updated;
    const h = harness({ role }, { school: { update: ({ where, data }) => {
      assert.equal(where.id, 'school-a'); assert.equal(where.isActive, true);
      assert.equal(where.members.some.userId, 'user-a'); assert.equal(where.members.some.isActive, true);
      assert.equal(Array.from(where.members.some.role.in).join(','), 'OWNER,ADMIN');
      assert.equal(JSON.stringify(data), JSON.stringify({ name: 'Updated School', academicYear: '2027-2028', phone: null }));
      updated = { ...schoolProfile, ...data }; return updated;
    } } });
    const response = await h.route('school/settings').PATCH(request('PATCH', { name: ' Updated School ', academicYear: '2027-2028', phone: '' }));
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.school.academicYear, '2027-2028'); assert.equal(body.school.phone, null);
    assert.equal(updated.code, schoolProfile.code);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].model, 'school');
  }
});

test('school settings rejects invalid input and mass assignment without writing', async () => {
  const cases = [null, [], {}, 'invalid', { name: '' }, { name: 'x'.repeat(161) },
    { id: 'school-b', name: 'Other' }, { schoolId: 'school-b' }, { slug: 'new-slug' }, { isActive: false },
    { role: 'OWNER' }, { members: { create: {} } }, { createdAt: '2026-01-01' },
    { email: 'bad-email' }, { phone: 1234567890 }, { phone: 'words' }, { phone: '1-----' }, { board: 'INVALID' },
    { academicYear: '2026-2028' }, { academicYear: '2026-27' }, { academicYear: '0000-0001' },
    { academicYear: '2026–2027' }, { logoUrl: 'javascript:alert(1)' }, { logoUrl: 'http://example.test/logo.png' },
    { logoUrl: 'https://user:password@example.test/logo.png' }, { city: 'x'.repeat(101) }, { pincode: 'x'.repeat(13) },
    { code: 'invalid code!' }, { name: null }];
  for (const body of cases) {
    const h = harness();
    const response = await h.route('school/settings').PATCH(request('PATCH', body));
    assert.equal(response.status, 400, JSON.stringify(body)); assert.equal(h.calls.length, 0);
  }
  const h = harness();
  const response = await h.route('school/settings').PATCH(new Request('https://schooldesk.test/api/school/settings', {
    method: 'PATCH', headers: { 'X-School-Id': 'school-a' }, body: '{broken',
  }));
  assert.equal(response.status, 400); assert.equal(h.calls.length, 0);
});

test('school settings handles uniqueness, revoked membership and database errors safely', async () => {
  for (const [code, status] of [['P2002', 409], ['P2025', 404], ['P1001', 503]]) {
    const h = harness({}, { school: { update: () => { throw new KnownError(code); } } });
    const response = await h.route('school/settings').PATCH(request('PATCH', { code: 'SCHOOL' }));
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
  const missing = harness({}, { school: { findUnique: () => null } });
  assert.equal((await missing.route('school/settings').GET(request('GET'))).status, 404);
  const broken = harness({}, { school: { update: () => { throw new Error('PRIVATE connection details'); } } });
  const failure = await broken.route('school/settings').PATCH(request('PATCH', { name: 'School' }));
  assert.equal(failure.status, 500); assert.doesNotMatch(await failure.text(), /PRIVATE/);
});

test('onboarding is derived from saved profile fields, with optional logo and no default year', () => {
  const settings = harness().client('school-settings');
  const checklist = settings.schoolSetupChecklist(schoolProfile);
  assert.equal(checklist.find(step => step.id === 'identity').missing.length, 0);
  assert.equal(checklist.find(step => step.id === 'academics').missing.join(','), 'board');
  assert.equal(checklist.find(step => step.id === 'branding').optional, true);
  assert.equal(settings.academicSessionLabel(null), 'Not configured');
  assert.equal(settings.academicSessionLabel('2028-2029'), '2028-2029');
  assert.equal(settings.academicYearSchema.safeParse('2028-2029').success, true);
  const complete = settings.schoolSetupChecklist({ ...schoolProfile, board: 'CBSE', email: 'school@example.test', phone: '+91 1234567890', addressLine: '1 Example Road', city: 'City', state: 'State', pincode: '123456' });
  assert.ok(complete.filter(step => !step.optional).every(step => !step.missing.length));
});

test('settings client attaches school context, handles field errors and rejects another school response', async () => {
  const h = harness({ fetch: async (url, init) => {
    assert.equal(url, '/api/school/settings/'); assert.equal(init.headers.get('X-School-Id'), 'school-a');
    assert.equal(init.cache, 'no-store');
    if (init.method === 'PATCH') return Response.json({ error: 'Code unavailable.', fields: { code: 'Choose another code.' } }, { status: 409 });
    return Response.json({ school: schoolProfile, canEdit: true });
  } });
  const client = h.client('school-settings-client');
  assert.equal((await client.loadSchoolSettings('school-a', new AbortController().signal)).school.id, 'school-a');
  await assert.rejects(client.saveSchoolSettings('school-a', { code: 'DUPLICATE' }), error => error.fields.code === 'Choose another code.');
  const foreign = harness({ fetch: async () => Response.json({ school: { ...schoolProfile, id: 'school-b' }, canEdit: true }) });
  await assert.rejects(foreign.client('school-settings-client').loadSchoolSettings('school-a', new AbortController().signal));
});

test('settings ignores unverified URL selectors and rejects cross-origin PATCH before a write', async () => {
  const h = harness({}, { school: { findUnique: ({ where }) => {
    assert.equal(where.id, 'school-a'); return schoolProfile;
  } } });
  const response = await h.route('school/settings').GET(request('GET', undefined, 'school-a', {}, '?schoolId=school-b'));
  assert.equal(response.status, 200); assert.equal((await response.json()).school.id, 'school-a');
  const blocked = harness();
  const denied = await blocked.route('school/settings').PATCH(request('PATCH', { name: 'Changed' }, 'school-a', { Origin: 'https://attacker.test' }));
  assert.equal(denied.status, 403); assert.equal(blocked.calls.length, 0);
});

test('settings accepts all supported fields and clears optional values without touching other models', async () => {
  const supported = {
    name: 'Test School', code: 'TEST-02', logoUrl: 'https://example.test/logo.png',
    addressLine: '1 Test Road', city: 'Test City', state: 'Test State', pincode: '123456',
    board: 'CBSE', academicYear: '2028-2029', phone: '+91 1234567890', email: 'school@example.test',
  };
  const h = harness({}, { school: { update: ({ where, data }) => {
    assert.equal(where.id, 'school-a');
    return { ...schoolProfile, ...data };
  } } });
  const updated = await h.route('school/settings').PATCH(request('PATCH', supported));
  assert.equal(updated.status, 200);
  assert.deepEqual((await updated.json()).school, { id: 'school-a', ...supported });
  const clear = Object.fromEntries(Object.keys(supported).filter(key => key !== 'name').map(key => [key, null]));
  const cleared = await h.route('school/settings').PATCH(request('PATCH', clear));
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).school.academicYear, null);
  assert.ok(h.calls.every(call => call.model === 'school' && call.method === 'update'));
});

test('shared management validation rejects invalid create/update fields before database access', async () => {
  const cases = {
    students: [{ name: ' ' }, { guardianName: '' }, { guardianEmail: 'bad' }, { guardianPhone: '1-----' }, { guardianPhone: 123456 }, { status: 'bad' }, { classId: '' }, { studentId: 'SD001' }, { name: 'x'.repeat(81) }],
    teachers: [{ subject: '' }, { subject: 'x'.repeat(101) }, { email: 'bad' }, { phone: 'javascript:alert(1)' }, { phone: '' }, { teacherId: 'T01' }, { classId: 1 }],
    classes: [{ capacity: '30' }, { capacity: 0 }, { capacity: 1.5 }, { capacity: 1001 }, { room: '' }, { code: 'x'.repeat(41) }, { classTeacherId: 1 }],
  };
  for (const [resource, invalid] of Object.entries(cases)) {
    for (const method of ['POST', 'PUT']) for (const patch of invalid) {
      const h = harness();
      const result = await h.route(resource + (method === 'PUT' ? '/[id]' : ''))[method](request(method, { ...inputs[resource], ...patch }), context('record-a'));
      assert.equal(result.status, 400, `${resource} ${method} ${JSON.stringify(patch)}`);
      assert.ok(Object.keys((await result.json()).fields).length); assert.equal(h.calls.length, 0);
    }
  }
});

test('shared schemas normalize fields, optional email and status without accepting IDs', () => {
  const s = harness().client('management-validation');
  const student = s.studentCreateSchema.parse({ ...studentInput, name: ' A ', guardianEmail: ' ', status: undefined, schoolId: 'foreign' });
  assert.equal(student.name, 'A'); assert.equal(student.guardianEmail, null); assert.equal(student.status, 'ACTIVE'); assert.equal(student.schoolId, undefined);
  assert.equal(s.studentUpdateSchema.safeParse({ ...studentInput, status: undefined }).success, false);
  const teacher = s.teacherCreateSchema.parse({ ...teacherInput, email: ' NAME@EXAMPLE.TEST ', classId: undefined });
  assert.equal(teacher.email, 'name@example.test'); assert.equal(teacher.classId, null);
  assert.equal(s.phoneHref('+919876543210'), 'tel:+919876543210');
  for (const value of [null, undefined, '', 'DEMO', '1-----', '123456;ext=12', 'javascript:123456']) assert.equal(s.phoneHref(value), null);
});

test('student and teacher ID collisions retry allocation and exhaust safely', async () => {
  for (const resource of ['students', 'teachers']) for (const exhaust of [false, true]) {
    let attempts = 0;
    const create = ({ data }) => {
      attempts++;
      assert.equal(data.schoolId, 'school-a');
      assert.equal(data[resource === 'students' ? 'studentId' : 'teacherId'], resource === 'students' ? 'SD013' : 'T13');
      if (exhaust || attempts === 1) throw new KnownError('P2002');
      return { ...data, id: 'temporary', class: studentClass };
    };
    const h = harness({}, {
      class: { findUnique: () => ({ capacity: 30 }) },
      student: { count: () => 0, create },
      teacher: { findFirst: () => null, create, findUniqueOrThrow: () => ({ id: 'temporary', teacherId: 'T13', class: null }) },
      studentHistory: { create: ({ data }) => data },
    });
    const result = await h.route(resource).POST(request('POST', inputs[resource]));
    assert.equal(result.status, exhaust ? 409 : 201); assert.equal(attempts, exhaust ? 5 : 2);
    assert.equal(h.calls.filter(call => call.model === '$queryRaw').length, attempts);
    assert.ok(h.transactions.every(t => t.isolationLevel === 'Serializable'));
    assert.doesNotMatch(await result.text(), /PRIVATE/);
  }
});

test('settings GET failures never expose provider or database details', async () => {
  for (const [error, status] of [[new KnownError('P1001'), 503], [new Error('PRIVATE connection details'), 500]]) {
    const h = harness({}, { school: { findUnique: () => { throw error; } } });
    const response = await h.route('school/settings').GET(request('GET'));
    assert.equal(response.status, status); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
});

// Transactional in-memory fixture: failed callbacks restore both Student and History.
// Real handler/helper code runs, but the Prisma transport is never loaded.
function studentHistoryHarness(options = {}) {
  let stored = options.empty ? null : {
    ...studentInput, id: 'student-a', studentId: 'SD001', schoolId: 'school-a',
    guardianEmail: null, firstName: 'Synthetic', middleName: null, lastName: null,
    dateOfBirth: new Date('2012-02-29T00:00:00.000Z'), admissionDate: null,
    academicYear: '2026-2027', class: studentClass,
  };
  let history = [];
  const groups = [studentClass, { ...studentClass, id: 'class-next', name: 'Unranked destination', code: 'unknown' }];
  let historyAttempts = 0;
  const h = harness({
    ...options,
    snapshot: () => ({ stored: stored && { ...stored }, history: [...history] }),
    rollback: snapshot => { stored = snapshot.stored; history = snapshot.history; },
  }, {
    student: {
      findUnique: ({ where }) => {
        assert.equal(where.schoolId, 'school-a');
        return stored?.id === where.id ? stored : null;
      },
      findMany: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return stored ? [stored] : []; },
      count: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return options.full ? 30 : 0; },
      create: ({ data }) => { stored = { ...data, id: 'student-a', class: groups.find(g => g.id === data.classId) }; return stored; },
      update: ({ where, data }) => {
        assert.equal(where.schoolId, 'school-a'); assert.equal(where.id, stored.id);
        const supplied = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
        stored = { ...stored, ...supplied, class: groups.find(g => g.id === data.classId) }; return stored;
      },
      delete: () => { throw new KnownError('P2003'); },
    },
    class: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return groups.find(g => g.id === where.id) ?? null; } },
    studentHistory: {
      create: ({ data }) => {
        historyAttempts++;
        assert.equal(data.schoolId, 'school-a'); assert.equal(data.createdById, 'user-a');
        assert.equal(data.studentId, stored.id);
        history.push({ ...data });
        if (options.historyFails || options.historyFailsAt === historyAttempts) throw new Error('PRIVATE history failure');
        if (options.historyRetry && historyAttempts === 1) throw new KnownError('P2034');
        return data;
      },
    },
  });
  return { ...h, state: () => ({ stored, history: [...history] }) };
}

test('student profile validation covers nullable fields, real dates, URLs and expanded statuses', () => {
  const schemas = harness().client('management-validation');
  for (const status of ['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED', 'TRANSFERRED']) {
    assert.equal(schemas.studentUpdateSchema.safeParse({ ...studentInput, status }).success, true);
  }
  for (const patch of [
    { dateOfBirth: '2026-02-30' }, { dateOfBirth: '0000-01-01' }, { admissionDate: 'yesterday' },
    { dateOfBirth: '2012-02-29T00:00:00Z' }, { gender: 'invalid' }, { bloodGroup: 'invalid' },
    { academicYear: '2026-2028' }, { imageUrl: 'javascript:alert(1)' },
    { imageUrl: 'https://user:pass@example.test/a.png' }, { firstName: 'a'.repeat(81) },
    { addressLine1: 'a'.repeat(241) }, { rollNumber: 42 }, { alternateGuardianPhone: 'bad' },
    { operation: { type: 'ADMISSION', fromClassId: 'class-a' } },
  ]) assert.equal(schemas.studentUpdateSchema.safeParse({ ...studentInput, ...patch }).success, false, JSON.stringify(patch));
  assert.equal(schemas.studentCreateSchema.safeParse({ ...studentInput, operation: { type: 'PROMOTION', fromClassId: 'class-a' } }).success, false);
});

test('ADMISSION atomically stores optional profile and trusted snapshots; GET retains the old envelope', async () => {
  const h = studentHistoryHarness({ empty: true });
  const profile = {
    firstName: ' Synthetic ', middleName: 'Middle', lastName: 'Last', gender: 'OTHER',
    dateOfBirth: '2012-02-29', bloodGroup: 'O+', imageUrl: 'https://example.test/a.png',
    admissionDate: '2026-04-01', rollNumber: '07', academicYear: '2026-2027',
    guardianRelation: 'Parent', alternateGuardianPhone: '9876543210',
    addressLine1: '1 Test Road', addressLine2: 'Floor 1', city: 'Test City',
    state: 'Test State', pincode: '123456', country: 'India',
  };
  const response = await h.route('students').POST(request('POST', {
    ...studentInput, ...profile, schoolId: 'school-b', createdById: 'attacker',
    history: [{ logType: 'FEE_RECORD' }], fromClassNameSnapshot: 'Forged',
  }));
  assert.equal(response.status, 201);
  const { student } = await response.json();
  assert.equal(student.studentId, 'SD013'); assert.equal(student.firstName, 'Synthetic');
  for (const [key, value] of Object.entries(profile)) assert.equal(student[key], value.trim(), key);
  assert.equal(student.class.id, 'class-a'); assert.equal(student.status, 'ACTIVE');
  const [event] = h.state().history;
  assert.equal(event.logType, 'ADMISSION'); assert.equal(event.fromClassId, null);
  assert.equal(event.toClassNameSnapshot, studentClass.name); assert.equal(event.toClassCodeSnapshot, '6a');
  assert.equal(event.studentNameSnapshot, studentInput.name); assert.equal(event.createdById, 'user-a');
  assert.equal(h.state().history.length, 1);
  const listed = await h.route('students').GET(request('GET'));
  assert.equal(listed.status, 200); assert.equal((await listed.json()).students[0].dateOfBirth, '2012-02-29');
});

test('legacy PUT preserves omitted profile values; no-op creates no write/history; explicit null clears', async () => {
  const h = studentHistoryHarness();
  const noChange = await h.route('students/[id]').PUT(request('PUT', studentInput), context('student-a'));
  assert.equal(noChange.status, 200); assert.equal(h.state().history.length, 0);
  assert.ok(!h.calls.some(c => c.method === 'update'));
  assert.equal(h.state().stored.firstName, 'Synthetic');
  const identicalDate = await h.route('students/[id]').PUT(request('PUT', { ...studentInput, dateOfBirth: '2012-02-29' }), context('student-a'));
  assert.equal(identicalDate.status, 200); assert.equal(h.state().history.length, 0);
  const cleared = await h.route('students/[id]').PUT(request('PUT', { ...studentInput, firstName: null, dateOfBirth: '' }), context('student-a'));
  assert.equal(cleared.status, 200);
  assert.equal(h.state().stored.firstName, null); assert.equal(h.state().stored.dateOfBirth, null);
  assert.equal(h.state().history[0].logType, 'PROFILE_UPDATED'); assert.equal(h.state().stored.studentId, 'SD001');
});

test('class change intent is explicit, source-checked and independent of class names', async () => {
  for (const type of [undefined, 'PROMOTION', 'SECTION_CHANGE']) {
    const h = studentHistoryHarness();
    const response = await h.route('students/[id]').PUT(request('PUT', {
      ...studentInput, classId: 'class-next',
      ...(type ? { operation: { type, fromClassId: 'class-a' } } : {}),
    }), context('student-a'));
    assert.equal(response.status, 200);
    const event = h.state().history[0];
    assert.equal(event.logType, type ?? 'CLASS_CHANGED'); assert.equal(h.state().history.length, 1);
    assert.equal(event.fromClassNameSnapshot, studentClass.name);
    assert.equal(event.toClassNameSnapshot, 'Unranked destination');
  }
  for (const patch of [
    { operation: { type: 'PROMOTION', fromClassId: 'stale-class' }, classId: 'class-next' },
    { operation: { type: 'SECTION_CHANGE', fromClassId: 'class-a' } },
    { operation: { type: 'TRANSFER', fromClassId: 'class-a' } },
  ]) {
    const h = studentHistoryHarness();
    assert.equal((await h.route('students/[id]').PUT(request('PUT', { ...studentInput, ...patch }), context('student-a'))).status, 400);
    assert.equal(h.state().history.length, 0); assert.equal(h.state().stored.classId, 'class-a');
  }
});

test('status changes and explicit transfer create appropriate events without changing capacity/roster policy', async () => {
  for (const [status, operation, expected] of [
    ['GRADUATED', undefined, 'STATUS_CHANGE'], ['SUSPENDED', undefined, 'STATUS_CHANGE'],
    ['TRANSFERRED', undefined, 'STATUS_CHANGE'],
    ['TRANSFERRED', { type: 'TRANSFER', fromClassId: 'class-a' }, 'TRANSFER'],
  ]) {
    const h = studentHistoryHarness();
    const result = await h.route('students/[id]').PUT(request('PUT', { ...studentInput, status, operation }), context('student-a'));
    assert.equal(result.status, 200); assert.equal(h.state().history[0].logType, expected);
    assert.equal(h.state().stored.classId, 'class-a'); assert.equal(h.state().history[0].fromStatus, 'ACTIVE');
    if (expected === 'TRANSFER') assert.equal(h.state().history[0].toClassId, null);
    assert.ok(!h.calls.some(c => c.model === 'attendance' || c.model === 'attendanceRecord'));
  }
  const full = studentHistoryHarness({ full: true });
  assert.equal((await full.route('students/[id]').PUT(request('PUT', { ...studentInput, classId: 'class-next' }), context('student-a'))).status, 409);
  assert.equal(full.state().history.length, 0);
});

test('history failure rolls back Student create/update and every event; serialization retry leaves one admission', async () => {
  for (const create of [true, false]) {
    const h = studentHistoryHarness({ empty: create, historyFails: true });
    const before = h.state();
    const route = create ? 'students' : 'students/[id]'; const method = create ? 'POST' : 'PUT';
    const response = await h.route(route)[method](request(method, { ...studentInput, name: 'Changed' }), context('student-a'));
    assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /PRIVATE/);
    assert.deepEqual(h.state(), before); assert.equal(h.state().history.length, 0);
  }
  const retried = studentHistoryHarness({ empty: true, historyRetry: true });
  assert.equal((await retried.route('students').POST(request('POST', studentInput))).status, 201);
  assert.equal(retried.state().history.length, 1); assert.equal(retried.transactions.length, 2);
  assert.ok(retried.transactions.every(t => t.isolationLevel === 'Serializable'));
});

test('history actor membership is rechecked inside transactions and related-record deletion stays blocked', async () => {
  const revoked = studentHistoryHarness({ revokeInTransaction: true });
  const denied = await revoked.route('students/[id]').PUT(request('PUT', { ...studentInput, name: 'Changed' }), context('student-a'));
  assert.equal(denied.status, 403); assert.equal(revoked.state().history.length, 0);
  const h = studentHistoryHarness();
  assert.equal((await h.route('students/[id]').DELETE(request('DELETE'), context('student-a'))).status, 409);
});

test('combined changes emit separate events; failure in a later event rolls back all earlier events', async () => {
  const input = { ...studentInput, classId: 'class-next', status: 'SUSPENDED', name: 'Updated name' };
  const h = studentHistoryHarness();
  assert.equal((await h.route('students/[id]').PUT(request('PUT', input), context('student-a'))).status, 200);
  assert.deepEqual(h.state().history.map(event => event.logType), ['CLASS_CHANGED', 'STATUS_CHANGE', 'PROFILE_UPDATED']);
  const broken = studentHistoryHarness({ historyFailsAt: 2 });
  const before = broken.state();
  assert.equal((await broken.route('students/[id]').PUT(request('PUT', input), context('student-a'))).status, 500);
  assert.deepEqual(broken.state(), before);
});

test('history errors are safe, and an empty history list is successful', async () => {
  for (const [failure, expected] of [[null, 200], [new KnownError('P1001'), 503], [new Error('PRIVATE'), 500]]) {
    const h = harness({}, {
      student: { findUnique: () => ({ id: 'student-a' }) },
      studentHistory: { findMany: ({ take }) => { assert.equal(take, 21); if (failure) throw failure; return []; } },
    });
    const response = await h.route('students/[id]/history').GET(request('GET'), context('student-a'));
    assert.equal(response.status, expected); assert.doesNotMatch(await response.text(), /PRIVATE/);
  }
});

test('history pagination scopes student and cursor, orders newest first and exposes no membership profile', async () => {
  const rows = ['z', 'y', 'x'].map(id => ({ id, createdAt: new Date('2026-10-20T10:00:00Z'), title: 'Snapshot' }));
  const h = harness({}, {
    student: { findUnique: ({ where }) => { assert.equal(where.schoolId, 'school-a'); return where.id === 'student-a' ? { id: 'student-a' } : null; } },
    studentHistory: {
      findFirst: ({ where }) => { assert.equal(where.schoolId, 'school-a'); assert.equal(where.studentId, 'student-a'); return where.id === 'y' ? rows[1] : null; },
      findMany: ({ where, orderBy, take, select }) => {
        assert.equal(where.schoolId, 'school-a'); assert.equal(where.studentId, 'student-a'); assert.equal(where.student.schoolId, 'school-a');
        assert.equal(JSON.stringify(orderBy), JSON.stringify([{ createdAt: 'desc' }, { id: 'desc' }]));
        assert.equal(take, 3); assert.equal(JSON.stringify(select.createdBy), JSON.stringify({ select: { role: true, user: { select: { name: true } } } }));
        if (where.OR) { assert.equal(where.OR[1].id.lt, 'y'); return [rows[2]]; }
        return rows;
      },
    },
  });
  const route = h.route('students/[id]/history');
  const first = await route.GET(request('GET', undefined, 'school-a', {}, '?limit=2'), context('student-a'));
  assert.equal(first.status, 200); const body = await first.json();
  assert.equal(body.history.length, 2); assert.equal(body.nextCursor, 'y');
  const next = await route.GET(request('GET', undefined, 'school-a', {}, '?limit=2&cursor=y'), context('student-a'));
  assert.equal((await next.json()).nextCursor, null);
  assert.equal((await route.GET(request('GET'), context('foreign-id'))).status, 404);
  assert.equal((await route.GET(request('GET', undefined, 'school-a', {}, '?cursor=other-student-event'), context('student-a'))).status, 400);
  for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?limit=1.5', '?cursor=']) {
    assert.equal((await route.GET(request('GET', undefined, 'school-a', {}, query), context('student-a'))).status, 400);
  }
  assert.deepEqual(Object.keys(route).sort(), ['GET', 'dynamic', 'runtime']);
});

function photoHarness(options = {}) {
  let student = { ...studentInput, id: 'student-a', studentId: 'SD001', schoolId: 'school-a',
    class: studentClass, imageUrl: null, academicYear: '2026-2027', dateOfBirth: null, admissionDate: null };
  let history = [];
  const uploaded = [], deleted = [], logs = [], downloads = [];
  const cloudinary = {
    uploader: {
      upload_stream(settings, callback) {
        assert.equal(settings.type, 'authenticated'); assert.equal(settings.resource_type, 'image');
        assert.equal(settings.overwrite, false); assert.equal(settings.format, 'webp');
        return { on() {}, end(bytes) {
          uploaded.push({ settings, bytes });
          if (options.concurrent) student = { ...student, imageUrl: 'https://example.test/newer.jpg' };
          if (options.uploadFailure) callback({ message: 'PRIVATE CLOUDINARY SECRET' });
          else callback(null, { public_id: settings.public_id, type: 'authenticated', resource_type: 'image', format: 'webp' });
        } };
      },
      async destroy(id, settings) {
        assert.equal(settings.type, 'authenticated'); assert.equal(settings.invalidate, true);
        deleted.push(id); if (options.deleteFailure) throw new Error('PRIVATE STORAGE SECRET');
        return { result: 'ok' };
      },
    },
    utils: { private_download_url(id, format, settings) {
      downloads.push(id); assert.equal(format, 'webp'); assert.equal(settings.type, 'authenticated');
      return 'https://api.cloudinary.test/signed-private-url';
    } },
  };
  const h = harness({ ...options, cloudinary, log: (...args) => logs.push(args),
    snapshot: () => ({ student: { ...student }, history: [...history] }),
    rollback: value => { student = value.student; history = value.history; },
    fetch: async (url, settings) => {
      assert.equal(url, 'https://api.cloudinary.test/signed-private-url');
      assert.equal(settings.cache, 'no-store'); assert.equal(settings.redirect, 'error');
      if (options.downloadFailure) throw new Error('PRIVATE DOWNLOAD ERROR');
      return new Response(await fixture('webp'), { headers: { 'Content-Type': 'image/webp' } });
    },
  }, {
    student: {
      findUnique: ({ where }) => {
        assert.equal(where.schoolId, 'school-a'); assert.equal(where.class.schoolId, 'school-a');
        return where.id === student.id ? student : null;
      },
      update: ({ where, data }) => {
        assert.equal(where.id, student.id); assert.equal(where.schoolId, 'school-a');
        assert.equal(where.imageUrl, student.imageUrl);
        assert.deepEqual(Object.keys(data), ['imageUrl']); student = { ...student, ...data }; return student;
      },
    },
    studentHistory: { create: ({ data }) => {
      assert.equal(data.schoolId, 'school-a'); assert.equal(data.studentId, student.id); assert.equal(data.createdById, 'user-a');
      assert.equal(data.logType, 'PROFILE_UPDATED'); history.push(data);
      if (options.historyFailure) throw new Error('PRIVATE DB FAILURE'); return data;
    } },
  });
  const reference = h.client('student-photo-reference');
  return { ...h, uploaded, deleted, logs, downloads,
    setPhoto: value => { student = { ...student, imageUrl: value }; },
    state: () => ({ student, history }),
    managed: () => reference.newPhotoReference('school-a', 'student-a'),
    version: () => reference.photoVersion(student.imageUrl),
    request(method, bytes, mime = 'image/png', version) {
      return new Request('https://schooldesk.test/api/students/student-a/photo', {
        method, headers: { 'X-School-Id': 'school-a', 'If-Match': version ?? reference.photoVersion(student.imageUrl), 'Content-Type': mime },
        ...(bytes ? { body: new Uint8Array(bytes) } : {}),
      });
    },
  };
}
async function fixture(format = 'png', width = 8, height = 8) {
  return sharp({ create: { width, height, channels: 3, background: '#abc' } }).toFormat(format).toBuffer();
}
test('photo uploads decode all supported formats, store scoped references, and append history atomically', async () => {
  for (const [format, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp']]) {
    const h = photoHarness(); const route = h.route('students/[id]/photo');
    const result = await route.PUT(h.request('PUT', await fixture(format), mime), context('student-a'));
    assert.equal(result.status, 200); const body = await result.json();
    assert.match(body.photo.imageUrl, /^cld-auth:v1:schooldesk\/student-photos\//);
    assert.equal(h.state().student.imageUrl, body.photo.imageUrl); assert.equal(h.state().history.length, 1);
    assert.equal(h.uploaded.length, 1); assert.equal((await sharp(h.uploaded[0].bytes).metadata()).format, 'webp');
    assert.equal(body.cleanupPending, false); assert.doesNotMatch(JSON.stringify(body), /signature|api_key|SECRET/);
    const delivered = await route.GET(h.request('GET'), context('student-a'));
    assert.equal(delivered.status, 200); assert.equal(delivered.headers.get('Content-Type'), 'image/webp');
    assert.equal(delivered.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(delivered.headers.get('ETag'), body.photo.version);
    assert.equal(h.downloads.length, 1);
  }
});
test('invalid contents, MIME mismatch, oversized body and huge dimensions never reach Cloudinary', async () => {
  const cases = [
    [Buffer.from('<svg/>'), 'image/svg+xml', 415], [Buffer.from('not an image'), 'image/png', 400],
    [await fixture('jpeg'), 'image/png', 400], [Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png', 413],
    [await fixture('png', 4097, 1), 'image/png', 400], [await fixture('png', 4096, 4096), 'image/png', 400],
    [Buffer.alloc(0), 'image/png', 400], [(await fixture('png')).subarray(0, 35), 'image/png', 400],
  ];
  for (const [bytes, mime, expected] of cases) {
    const h = photoHarness();
    const result = await h.route('students/[id]/photo').PUT(h.request('PUT', bytes, mime), context('student-a'));
    assert.equal(result.status, expected); assert.equal(h.uploaded.length, 0); assert.equal(h.state().history.length, 0);
  }
});
test('photo reference cannot be used for another student/school and foreign records never reach storage', async () => {
  const h = photoHarness(); const ref = h.client('student-photo-reference'); const value = h.managed();
  assert.equal(ref.photoPublicId(value, 'school-b', 'student-a'), null);
  assert.equal(ref.photoPublicId(value, 'school-a', 'student-b'), null);
  h.setPhoto(ref.newPhotoReference('school-b', 'student-a'));
  assert.equal((await h.route('students/[id]/photo').GET(h.request('GET'), context('student-a'))).status, 404);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await h.route('students/[id]/photo')[method](h.request(method), context('foreign-id'));
    assert.equal(response.status, 404);
  }
  assert.equal(h.uploaded.length + h.deleted.length + h.downloads.length, 0);
});
test('photo version prevents stale edits, requires a precondition and rechecks after upload', async () => {
  const h = photoHarness(); const route = h.route('students/[id]/photo');
  assert.equal((await route.DELETE(request('DELETE'), context('student-a'))).status, 428);
  assert.equal((await route.PUT(h.request('PUT', await fixture(), 'image/png', 'old-version'), context('student-a'))).status, 409);
  assert.equal(h.uploaded.length, 0);
  const race = photoHarness({ concurrent: true });
  const result = await race.route('students/[id]/photo').PUT(race.request('PUT', await fixture()), context('student-a'));
  assert.equal(result.status, 409); assert.equal(race.deleted.length, 1);
  assert.equal(race.state().student.imageUrl, 'https://example.test/newer.jpg'); assert.equal(race.state().history.length, 0);
});
test('replacement and removal delete only retired managed assets; legacy HTTPS assets are never fetched or deleted', async () => {
  const h = photoHarness(); const route = h.route('students/[id]/photo');
  h.setPhoto(h.managed());
  assert.equal((await route.PUT(h.request('PUT', await fixture()), context('student-a'))).status, 200);
  assert.equal(h.deleted.length, 1);
  assert.equal((await route.DELETE(h.request('DELETE'), context('student-a'))).status, 200);
  assert.equal(h.deleted.length, 2); assert.equal(h.state().student.imageUrl, null); assert.equal(h.state().history.length, 2);
  assert.equal((await route.DELETE(h.request('DELETE'), context('student-a'))).status, 200);
  assert.equal(h.state().history.length, 2);
  const missing = await route.GET(h.request('GET'), context('student-a'));
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('ETag'), h.version());
  h.setPhoto('https://example.test/legacy.jpg');
  const redirect = await route.GET(h.request('GET'), context('student-a'));
  assert.equal(redirect.status, 307); assert.equal(redirect.headers.get('Location'), 'https://example.test/legacy.jpg');
  assert.equal((await route.DELETE(h.request('DELETE'), context('student-a'))).status, 200);
  assert.equal(h.deleted.length, 2); assert.equal(h.downloads.length, 0);
});
test('storage failures are safe; history failures roll back and remove the newly uploaded file', async () => {
  for (const options of [{ uploadFailure: true }, { historyFailure: true }, { revokeInTransaction: true }]) {
    const h = photoHarness(options); const result = await h.route('students/[id]/photo').PUT(h.request('PUT', await fixture()), context('student-a'));
    assert.equal(result.status, options.uploadFailure ? 503 : options.historyFailure ? 500 : 403);
    assert.doesNotMatch(await result.text(), /PRIVATE/); assert.equal(h.state().student.imageUrl, null); assert.equal(h.state().history.length, 0);
    assert.equal(h.deleted.length, options.uploadFailure ? 0 : 1);
    if (options.uploadFailure) assert.ok(h.logs.length);
  }
  const h = photoHarness({ downloadFailure: true }); h.setPhoto(h.managed());
  const failed = await h.route('students/[id]/photo').GET(h.request('GET'), context('student-a'));
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /PRIVATE/);
});
test('failed remote cleanup reports pending work without reverting a committed removal', async () => {
  const h = photoHarness({ deleteFailure: true }); h.setPhoto(h.managed());
  const response = await h.route('students/[id]/photo').DELETE(h.request('DELETE'), context('student-a'));
  assert.equal(response.status, 200); assert.equal((await response.json()).cleanupPending, true);
  assert.equal(h.state().student.imageUrl, null); assert.equal(h.state().history.length, 1);
  assert.equal(h.deleted.length, 3); assert.ok(h.logs.length);
});
test('serialization retry uploads once and creates only one history event', async () => {
  const h = photoHarness({ retry: true });
  assert.equal((await h.route('students/[id]/photo').PUT(h.request('PUT', await fixture()), context('student-a'))).status, 200);
  assert.equal(h.uploaded.length, 1); assert.equal(h.state().history.length, 1); assert.equal(h.transactions.length, 2);
});
test('ordinary Student PUT cannot bypass managed-photo removal and rejects forged managed references', async () => {
  const h = photoHarness(); h.setPhoto(h.managed());
  const update = h.route('students/[id]').PUT;
  assert.equal((await update(request('PUT', { ...studentInput, imageUrl: null }), context('student-a'))).status, 409);
  assert.equal((await update(request('PUT', { ...studentInput, imageUrl: h.managed() }), context('student-a'))).status, 400);
  assert.equal(h.state().history.length, 0); assert.equal(h.deleted.length, 0);
});

test('lost commit acknowledgement never deletes a photo that may now be active', async () => {
  const h = photoHarness(); const originalTransaction = h.db.$transaction;
  h.db.$transaction = async (...args) => {
    await originalTransaction(...args);
    throw new Error('PRIVATE lost acknowledgement');
  };
  const response = await h.route('students/[id]/photo').PUT(h.request('PUT', await fixture()), context('student-a'));
  assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /PRIVATE/);
  assert.ok(h.state().student.imageUrl); assert.equal(h.state().history.length, 1);
  assert.equal(h.deleted.length, 0); assert.ok(JSON.stringify(h.logs).includes('database-commit-outcome-unknown'));
});
test('ADMIN can upload; TEACHER can read a same-school photo but cannot mutate it', async () => {
  const admin = photoHarness({ role: 'ADMIN' });
  assert.equal((await admin.route('students/[id]/photo').PUT(admin.request('PUT', await fixture()), context('student-a'))).status, 200);
  const teacher = photoHarness({ role: 'TEACHER' }); teacher.setPhoto(teacher.managed());
  const route = teacher.route('students/[id]/photo');
  assert.equal((await route.GET(teacher.request('GET'), context('student-a'))).status, 200);
  assert.equal((await route.PUT(teacher.request('PUT', await fixture()), context('student-a'))).status, 403);
  assert.equal((await route.DELETE(teacher.request('DELETE'), context('student-a'))).status, 403);
  assert.equal(teacher.uploaded.length + teacher.deleted.length, 0);
});
test('photo mutations reject cross-origin requests and client-controlled removal payloads', async () => {
  const h = photoHarness(); const route = h.route('students/[id]/photo');
  const external = h.request('PUT', await fixture()); external.headers.set('Origin', 'https://foreign.test');
  assert.equal((await route.PUT(external, context('student-a'))).status, 403);
  const removal = h.request('DELETE', Buffer.from('{"publicId":"other-school"}'), 'application/json');
  assert.equal((await route.DELETE(removal, context('student-a'))).status, 400);
  assert.equal(h.uploaded.length + h.deleted.length, 0); assert.equal(h.state().history.length, 0);
});
