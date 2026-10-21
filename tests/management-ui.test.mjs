import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as zod from 'zod';

// Render actual components into a small JSX tree with mocked hooks. No browser,
// Clerk, network or database modules are available in this test harness.
function ui(options = {}) {
  const states = []; let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  function load(file) {
    const output = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loadedModule = { exports: {} };
    const imports = id => {
      if (id === 'zod') return zod;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'react') return {
        useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
        useRef: initial => { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
        useEffect: (effect, deps) => { const index = cursor++; if (!states[index] || deps.some((v, i) => v !== states[index].deps[i])) { states[index]?.cleanup?.(); states[index] = { deps, cleanup: effect() }; } },
      };
      if (id === '@/lib/student-status') return load('lib/student-status.ts');
      if (id === '@/lib/student-profile-client') return options;
      if (id === '@/lib/student-profile-fields') return load('lib/student-profile-fields.ts');
      if (id === '@/lib/student-remarks') return load('lib/student-remarks.ts');
      if (id === '@/lib/management-validation') return load('lib/management-validation.ts');
      if (id === '@/lib/demo') return { classes: [], initials: name => name.slice(0, 2), className: code => code };
      if (id === './icon') return { Icon: 'Icon' };
      if (id === './ui') return Object.fromEntries(['Dialog', 'Empty', 'Person', 'Search', 'StatusBadge', 'TableRegion'].map(key => [key, key]));
      throw new Error(`Forbidden import: ${id}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { AbortController, crypto: { randomUUID: () => 'synthetic-key' }, FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key]; } } })(imports, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const components = { ...load('components/management.tsx'), ...load('components/student-history-timeline.tsx') };
  return { render(name, props) { cursor = 0; return components[name](props); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test('class roster action selects the class, displays its students and can clear only the class filter', () => {
  const view = ui(); let selected;
  const groups = [{ id: 'internal-class', code: '6a', name: 'Class 6 · A', room: '1', capacity: 30, studentCount: 1, classTeacher: null }];
  const cards = view.render('Classes', { groups, onRoster: code => { selected = code; }, disabled: false });
  const roster = nodes(cards).find(n => n.props?.className === 'button roster-button');
  assert.equal(roster.type, 'button'); assert.equal(roster.props.disabled, false);
  assert.match(roster.props['aria-label'], /Class 6/); roster.props.onClick(); assert.equal(selected, '6a');
  const props = { students: [{ id: 's1', classId: '6a', name: 'One', guardian: 'G', status: 'Active' }, { id: 's2', classId: '7a', name: 'Two', guardian: 'G', status: 'Active' }], initialClass: selected, classOptions: [{ id: '6a', name: groups[0].name }], onEdit() {} };
  let rendered = view.render('Students', props);
  assert.equal(nodes(rendered).filter(n => n.type === 'tr').length, 2);
  assert.match(JSON.stringify(nodes(rendered).find(n => n.props?.className === 'roster-summary')), /Class 6/);
  nodes(rendered).find(n => n.type === 'button' && n.props.children === 'Clear class filter').props.onClick();
  rendered = view.render('Students', props);
  assert.equal(nodes(rendered).filter(n => n.type === 'tr').length, 3);
  const parent = readFileSync(new URL('../src/components/schooldesk-client.tsx', import.meta.url), 'utf8');
  assert.match(parent, /onRoster=\{\(classId\).*?setRosterRequest.*?revision: previous.revision \+ 1.*?navigate\('Students'\)/s);
  const workspace = readFileSync(new URL('../src/components/students-workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /<Students\s+key=\{revision\}.*?initialClass=\{initialClass\}/s);
});

test('teacher Call actions use validated phone links and omit missing or invalid numbers', () => {
  const teachers = ['+919876543210', '', 'DEMO'].map((phone, index) => ({ id: String(index), name: `Teacher ${index}`, subject: 'Math', email: 'test@example.test', phone, className: 'Unassigned', teacherId: `T0${index + 1}` }));
  const rendered = ui().render('Teachers', { teachers, onEdit() {}, onDelete() {} });
  const links = nodes(rendered).filter(n => n.type === 'a');
  assert.equal(links.length, 1); assert.equal(links[0].props.href, 'tel:+919876543210');
  assert.equal(links[0].props['aria-label'], 'Call Teacher 0');
});

test('student directory links internal IDs to profiles and exposes every status filter', () => {
  const tree = ui().render('Students', {
    students: [{ id: 'internal-1', studentId: 'SD001', classId: '6a', name: 'One', guardian: 'G', status: 'Graduated' }],
    classOptions: [], onEdit() {},
  });
  assert.equal(nodes(tree).find(n => n.type === 'a' && n.props.children === 'View profile').props.href, '/students/internal-1');
  const labels = nodes(tree).filter(n => n.type === 'option').map(n => n.props.children);
  for (const status of ['Active', 'Inactive', 'Graduated', 'Suspended', 'Transferred']) assert.ok(labels.includes(status));
});

test('history renders immutable class snapshots, actor, timestamp and accessible category text', () => {
  const tree = ui().render('HistoryEntry', { event: {
    logType: 'ACADEMIC_REMARK', title: 'Progress', description: 'Good work', remarkCategory: 'POSITIVE',
    createdAt: '2026-10-20T10:00:00Z', createdById: 'user-a', creator: { name: 'Verified Admin', role: 'ADMIN' },
    fromClassId: 'old', toClassId: 'new', fromClassNameSnapshot: 'Old class', toClassNameSnapshot: 'New class',
    fromClassCodeSnapshot: '6a', toClassCodeSnapshot: '7a', fromStatus: 'ACTIVE', toStatus: 'GRADUATED',
    academicYear: '2026-2027',
  } });
  const serialized = JSON.stringify(tree);
  for (const value of ['Old class', 'New class', 'Verified Admin', 'Graduated', '2026-2027']) assert.ok(serialized.includes(value));
  assert.equal(nodes(tree).find(n => n.type === 'time').props.dateTime, '2026-10-20T10:00:00Z');
  assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === 'Remark category: Positive'));
});

test('remark dialog validates, blocks double submits, retains failures and retries the same key', async () => {
  const calls = []; let resolve;
  const view = ui({ saveStudentRemark: (...args) => { calls.push(args); return new Promise(done => { resolve = done; }); } });
  let saved = 0, closed = 0;
  const props = { schoolId: 'school-a', studentId: 'student-a', onSaved: () => saved++, onClose: () => closed++ };
  const render = () => view.render('RemarkDraft', props);
  const input = { title: 'Progress', category: 'GENERAL', description: 'Improved steadily' };
  let tree = render();
  await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: { ...input, title: ' ' } });
  assert.equal(calls.length, 0); assert.ok(nodes(render()).some(n => n.props?.role === 'alert'));
  tree = render();
  const submit = nodes(tree).find(n => n.type === 'form').props.onSubmit;
  const event = { preventDefault() {}, currentTarget: input };
  const pending = submit(event); void submit(event);
  assert.equal(calls.length, 1);
  tree = render();
  assert.equal(nodes(tree).find(n => n.type === 'fieldset').props.disabled, true);
  tree.props.onClose(); assert.equal(closed, 0);
  resolve('event-a'); await pending; assert.equal(saved, 1);

  const retries = [];
  const retryView = ui({ saveStudentRemark: async (...args) => { retries.push(args); if (retries.length === 1) throw new Error('Forbidden'); return 'event-a'; } });
  const retryRender = () => retryView.render('RemarkDraft', props);
  await nodes(retryRender()).find(n => n.type === 'form').props.onSubmit(event);
  assert.ok(nodes(retryRender()).some(n => n.props?.role === 'alert'));
  assert.equal(nodes(retryRender()).find(n => n.type === 'fieldset').props.disabled, false);
  await nodes(retryRender()).find(n => n.type === 'form').props.onSubmit(event);
  assert.equal(retries[0][3], retries[1][3]); assert.equal(saved, 2);
});
test('remark draft retains discard confirmation', () => {
  let closed = 0; const view = ui();
  const props = { schoolId: 's', studentId: 'x', onClose: () => closed++, onSaved() {} };
  let tree = view.render('RemarkDraft', props);
  nodes(tree).find(n => n.type === 'form').props.onChange();
  tree = view.render('RemarkDraft', props); tree.props.onClose();
  tree = view.render('RemarkDraft', props);
  assert.equal(closed, 0); assert.equal(nodes(tree).find(n => n.type === 'fieldset').props.hidden, true);
  nodes(tree).find(n => n.props?.children === 'Keep draft').props.onClick();
  tree = view.render('RemarkDraft', props); assert.equal(nodes(tree).find(n => n.type === 'fieldset').props.hidden, false);
});
test('timeline respects server permissions and reloads first history page after confirmed save', async () => {
  for (const allowed of [false, true]) {
    let loads = 0;
    const view = ui({ loadStudentHistory: async () => { loads++; return { history: [], nextCursor: null, permissions: { canAddRemark: allowed } }; } });
    const props = { schoolId: 'school-a', studentId: 'student-a' };
    const render = () => view.render('StudentHistoryTimeline', props);
    render(); await new Promise(setImmediate);
    let tree = render();
    const add = nodes(tree).find(n => n.props?.children === 'Add Remark');
    assert.equal(add.props.disabled, !allowed);
    if (allowed) {
      add.props.onClick(); tree = render();
      const draft = nodes(tree).find(n => typeof n.type === 'function' && n.type.name === 'RemarkDraft');
      draft.props.onSaved(); render(); await new Promise(setImmediate);
      tree = render(); assert.equal(loads, 2);
      assert.ok(nodes(tree).some(n => n.props?.children === 'Academic remark saved.'));
      assert.ok(!nodes(tree).some(n => typeof n.type === 'function' && n.type.name === 'RemarkDraft'));
    } else assert.match(JSON.stringify(tree), /History is read-only/);
  }
});
