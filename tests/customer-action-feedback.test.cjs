const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');

// Exercise the actual page handlers with controlled React hooks and transport.
// Browser QA separately covers native forms, rendering and the real BFF/backend.
function pageHarness(overrides = {}) {
  const customer = { id: '63ac0dc8-e89c-4b76-952f-e54ffec84f70', status: 'active',
    displayName: 'QA', email: 'qa@example.invalid', emailVerified: true,
    createdAt: new Date().toISOString(), lastLoginAt: null, authenticationMethods: [], sessions: [] };
  const wallet = { balanceMinor: 0, currency: 'USD', transactions: [] };
  const calls = [];
  const api = Object.fromEntries(Object.entries({
    get: async () => customer, notes: async () => [], audit: async () => [], wallet: async () => wallet,
    transitionStatus: async () => ({}), revokeSessions: async () => ({}),
    createNote: async () => ({}), addWalletCredit: async () => ({}), ...overrides,
  }).map(([name, fn]) => [name, async (...args) => { calls.push({ name, args }); return fn(...args); }]));
  const slots = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = i === 0 ? customer : i === 4 ? wallet : initial === true ? false : initial;
      return [slots[i], value => { slots[i] = value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback: fn => fn, useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const filename = path.resolve(__dirname, '../src/app/admin/customers/[id]/page.tsx');
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, crypto: { randomUUID }, Intl, Date, Error,
    require: name => ({ react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
      'next/link': 'link', 'next/navigation': { useParams: () => ({ id: customer.id }) },
      '@/components/icons': {}, '@/lib/nestjs-api': { nestjsApi: { customers: api } },
    })[name],
  }, { filename });
  let tree;
  function render() { cursor = 0; tree = exports.default(); }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join('');
    return node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  }
  function find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected control'); return node; }
  function button(name) { return find(n => n.type === 'button' && text(n) === name); }
  function input(id, value) { find(n => n.props?.id === id).props.onChange({ target: { value } }); render(); }
  function open(name) { button(name).props.onClick(); render(); }
  function submit() { return find(n => n.type === 'form' && n.props.role === 'dialog').props.onSubmit; }
  render();
  return { calls, render, input, open, submit, button, find, text: () => text(tree),
    notices: () => nodes(tree).filter(n => n.props?.role === 'status' || n.props?.role === 'alert') };
}
const event = { preventDefault() {} };

test('every mutation blocks rapid double submission and announces authoritative success', async () => {
  for (const action of ['Suspend', 'Ban', 'Revoke all sessions', 'Add credit', 'Add note']) {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const method = action === 'Add credit' ? 'addWalletCredit' : action === 'Add note' ? 'createNote' : action === 'Revoke all sessions' ? 'revokeSessions' : 'transitionStatus';
    const h = pageHarness({ [method]: () => pending });
    let submit;
    if (action === 'Add note') {
      h.input('customer-note', 'QA private note');
      submit = h.find(n => n.type === 'form' && n.props.className === 'adminCustomerNoteForm').props.onSubmit;
    } else {
      h.open(action);
      if (action === 'Add credit') { h.input('wallet-credit-amount', '0.25'); h.input('wallet-credit-reason', 'QA credit reason'); }
      else h.input('customer-action-reason', 'QA security reason');
      submit = h.submit();
    }
    const first = submit(event);
    await submit(event);
    assert.equal(h.calls.filter(c => c.name === method).length, 1, action);
    h.render();
    assert.match(h.text(), /Saving|Adding/);
    assert.equal(h.button('Add credit').props.disabled, true);
    release({});
    await first;
    h.render();
    assert.ok(h.notices().some(n => n.props.role === 'status'));
    assert.equal(h.button('Add credit').props.disabled, false);
    for (const name of ['get', 'notes', 'audit', 'wallet']) assert.ok(h.calls.some(c => c.name === name));
  }
});

test('credit retry retains its key after an ambiguous failure and displays error inside dialog', async () => {
  let attempts = 0;
  const h = pageHarness({ addWalletCredit: async () => { if (++attempts === 1) throw new Error('Network response lost'); } });
  h.open('Add credit'); h.input('wallet-credit-amount', '0.25'); h.input('wallet-credit-reason', 'QA credit reason');
  await h.submit()(event); h.render();
  assert.match(h.text(), /Network response lost/);
  const dialog = h.find(n => n.props?.role === 'dialog');
  assert.ok(JSON.stringify(dialog).includes('Network response lost'));
  h.button('Cancel').props.onClick(); h.render();
  h.open('Add credit');
  await h.submit()(event); h.render();
  const credits = h.calls.filter(c => c.name === 'addWalletCredit');
  assert.equal(credits[0].args[2], credits[1].args[2]);
  assert.equal(credits[0].args[1].amountMinor, 25);
});

test('successful save followed by refresh failure closes modal and says saved, not failed', async () => {
  const h = pageHarness({ wallet: async () => { throw new Error('Read unavailable'); } });
  h.open('Add credit'); h.input('wallet-credit-amount', '0.25'); h.input('wallet-credit-reason', 'QA credit reason');
  await h.submit()(event); h.render();
  assert.match(h.text(), /USD store credit added.*Latest data could not be loaded.*do not repeat/);
  assert.equal(h.calls.filter(c => c.name === 'addWalletCredit').length, 1);
  assert.equal(h.button('Add credit').props.disabled, false);
});

test('invalid USD amounts cannot call wallet API', async () => {
  for (const amount of ['0', '-1', '0.001', '10000.01', 'NaN', '1e3']) {
    const h = pageHarness(); h.open('Add credit'); h.input('wallet-credit-amount', amount);
    await h.submit()(event); h.render();
    assert.equal(h.calls.length, 0);
    assert.match(h.text(), /Enter a USD amount/);
  }
});
