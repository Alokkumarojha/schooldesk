import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as zod from 'zod';

// Render actual components into a small JSX tree with mocked hooks. No browser,
// Clerk, network or database modules are available in this test harness.
function ui() {
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
      if (id === 'react') return { useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; } };
      if (id === '@/lib/student-status') return load('lib/student-status.ts');
      if (id === '@/lib/student-profile-client') return {};
      if (id === '@/lib/student-profile-fields') return load('lib/student-profile-fields.ts');
      if (id === '@/lib/student-remarks') return load('lib/student-remarks.ts');
      if (id === '@/lib/management-validation') return load('lib/management-validation.ts');
      if (id === '@/lib/demo') return { classes: [], initials: name => name.slice(0, 2), className: code => code };
      if (id === './icon') return { Icon: 'Icon' };
      if (id === './ui') return Object.fromEntries(['Empty', 'Person', 'Search', 'StatusBadge', 'TableRegion'].map(key => [key, key]));
      throw new Error(`Forbidden import: ${id}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${output}\n})`)(imports, loadedModule, loadedModule.exports);
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
