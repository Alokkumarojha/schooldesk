import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function harness() {
  let open = false;
  const jsx = (type, props) => ({ type, props });
  function load(name) {
    const source = readFileSync(new URL('../src/components/' + name + '.tsx', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod = { exports: {} };
    const imports = id => {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'react') return { useState: () => [open, value => { open = value; }], useEffect() {} };
      if (id === './mobile-bottom-nav') return load('mobile-bottom-nav');
      if (id === './icon') return { Icon: 'Icon' };
      if (id === './ui') return { Dialog: 'Dialog' };
      if (id === './theme-toggle') return { ThemeToggle: 'ThemeToggle' };
      if (id === '@clerk/nextjs') return { UserButton: 'UserButton' };
      if (id === 'next/image') return { default: 'Image' };
      if (id === '@/lib/school-settings') return { academicSessionLabel: year => year };
      if (id === '@/lib/demo') return { sections: ['Dashboard', 'Students', 'Teachers', 'Classes', 'Attendance', 'Notices', 'Settings'] };
      throw new Error('Unexpected import: ' + id);
    };
    vm.runInNewContext('(function(require,module,exports){' + code + '\n})')(imports, mod, mod.exports);
    return mod.exports;
  }
  return { ...load('mobile-bottom-nav'), ...load('navigation') };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
test('bottom nav maps sections, marks exactly one destination, and opens More', () => {
  const { MobileBottomNav } = harness();
  for (const section of ['Dashboard', 'Students', 'Attendance', 'Teachers', 'Classes', 'Notices', 'Settings']) {
    const calls = [];
    const tree = MobileBottomNav({ section, onNavigate: value => calls.push(value), onMore: () => calls.push('drawer'), drawerOpen: false });
    assert.equal(tree.props['aria-label'], 'Mobile workspace navigation');
    const buttons = nodes(tree).filter(n => n.type === 'button');
    assert.equal(buttons.length, 4);
    assert.equal(buttons.filter(n => n.props['aria-current']).length, 1);
    const expected = ['Dashboard', 'Students', 'Attendance'].indexOf(section);
    assert.ok(buttons[expected < 0 ? 3 : expected].props['aria-current']);
    for (const button of buttons) {
      assert.equal(button.props.type, 'button');
      assert.equal(nodes(button).filter(n => n.type === 'button' || n.type === 'a').length, 1);
      button.props.onClick();
    }
    assert.deepEqual(calls, ['Dashboard', 'Students', 'Attendance', 'drawer']);
    assert.equal(buttons[3].props['aria-haspopup'], 'dialog');
  }
});
test('More shares the existing Topbar drawer and its navigation callback', () => {
  const { Topbar } = harness();
  const calls = [];
  const props = { section: 'Students', schoolName: 'Verified school', academicYear: '2026-2027', noticeCount: 0, user: { name: 'User', email: null, imageUrl: null }, onNavigate: value => calls.push(value) };
  let tree = Topbar(props);
  const bottom = () => nodes(tree).find(n => typeof n.type === 'function' && n.type.name === 'MobileBottomNav');
  assert.equal(bottom().props.onNavigate, props.onNavigate);
  assert.equal(nodes(tree).filter(n => n.type === 'Dialog').length, 0);
  bottom().props.onMore(); tree = Topbar(props);
  assert.equal(bottom().props.drawerOpen, true);
  const dialogs = nodes(tree).filter(n => n.type === 'Dialog');
  assert.equal(dialogs.length, 1); assert.equal(dialogs[0].props.variant, 'drawer');
  dialogs[0].props.children.props.children.props.onNavigate('Attendance');
  tree = Topbar(props);
  assert.equal(bottom().props.drawerOpen, false); assert.deepEqual(calls, ['Attendance']);
});
test('both pages use Topbar; profile navigation retains server-verified dashboard context', () => {
  const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
  assert.match(read('components/student-profile-page.tsx'), /router\.push\([\s\S]*?section\.toLowerCase\(\)/);
  assert.match(read('components/student-profile-page.tsx'), /<Topbar \{\.\.\.navigation\}/);
  assert.match(read('app/page.tsx'), /await requireDashboardIdentity\(\)/);
  assert.match(read('components/schooldesk-client.tsx'), /<Topbar[\s\S]*?onNavigate=\{navigate\}/);
});
