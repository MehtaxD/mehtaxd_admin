const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const id = '9a50db43-e982-4054-b769-82d46286bca9';
const origin = 'http://localhost:3001';
const base = `/admin/customers/${id}`;

// Execute the actual TS handlers/client with only Next's cookie store and
// upstream transport replaced. No packages or production test hooks required.
function harness({ token = 'test-admin-token', upstreamStatus = 200 } = {}) {
  const calls = [];
  function load(file, dependencies = {}, fetchImpl) {
    const filename = path.resolve(__dirname, '..', file);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const exports = {};
    vm.runInNewContext(source, {
      exports, require: (name) => dependencies[name] ?? require(name),
      process: { env: { ADMIN_URL: origin, NESTJS_API_URL: 'http://backend.test', NODE_ENV: 'test' } },
      fetch: fetchImpl, Request, Response, Headers, URL, URLSearchParams, TextDecoder, Uint8Array,
    }, { filename });
    return exports;
  }
  const safeErrors = load('src/lib/safe-api-error.ts');
  const helper = load('src/lib/admin-api-route.ts', {
    'next/headers': { cookies: async () => ({ get: (name) => name === 'mxd_admin_access' && token ? { value: token } : undefined }) },
    '@/lib/safe-api-error': safeErrors,
  }, async (url, init) => {
    calls.push({ url, ...init });
    return Response.json(upstreamStatus === 200 ? { ok: true } : { message: 'Admin access required' }, { status: upstreamStatus });
  });
  const route = load('src/app/api/admin/backend/[...path]/route.ts', { '@/lib/admin-api-route': helper });
  async function send(method, endpoint, options = {}) {
    const url = new URL(`/api/admin/backend${endpoint}`, origin);
    const headers = new Headers(options.headers);
    if (!headers.has('origin')) headers.set('origin', origin);
    const request = new Request(url, { method, ...options, headers });
    const segments = endpoint.split('?')[0].slice(1).split('/');
    return (route[method] ?? route.GET)(request, { params: Promise.resolve({ path: segments }) });
  }
  const client = load('src/lib/nestjs-api.ts', { '@/lib/safe-api-error': safeErrors }, (url, init) => send(init.method ?? 'GET', url.replace('/api/admin/backend', ''), init)).nestjsApi;
  return { calls, route, send, client };
}

test('customer API client: all existing detail reads and actions pass exact BFF routes', async () => {
  const h = harness();
  await h.client.customers.get(id);
  await h.client.customers.notes(id);
  await h.client.customers.audit(id);
  await h.client.customers.wallet(id);
  await h.client.customers.orders(id, 2, 20);
  for (const action of ['suspend', 'ban', 'reactivate']) {
    await h.client.customers.transitionStatus(id, { action, expectedStatus: 'active', reason: 'Regression test reason' });
  }
  await h.client.customers.revokeSessions(id, 'Regression test reason');
  await h.client.customers.createNote(id, 'Regression test note');
  await h.client.customers.addWalletCredit(id, { amountMinor: 100, reason: 'Regression test credit' }, 'admin-wallet-regression-key');
  assert.deepEqual(h.calls.map(({ url, method }) => [method, url.replace('http://backend.test', '')]), [
    ['GET', base], ['GET', `${base}/notes`], ['GET', `${base}/audit`], ['GET', `${base}/wallet`],
    ['GET', `${base}/orders?page=2&limit=20`],
    ['PATCH', `${base}/status`], ['PATCH', `${base}/status`], ['PATCH', `${base}/status`],
    ['POST', `${base}/revoke-sessions`], ['POST', `${base}/notes`], ['POST', `${base}/wallet/credits`],
  ]);
  const credit = h.calls.at(-1);
  assert.equal(new Headers(credit.headers).get('idempotency-key'), 'admin-wallet-regression-key');
  assert.equal(new Headers(credit.headers).get('authorization'), 'Bearer test-admin-token');
  assert.deepEqual(JSON.parse(credit.body), { amountMinor: 100, reason: 'Regression test credit' });
});

test('malformed IDs, unsupported methods, unapproved nested paths never reach backend', async () => {
  const cases = [
    ['GET', '/admin/customers/not-a-uuid'],
    ['GET', `/admin/customers/${'-'.repeat(36)}`],
    ['GET', `/admin/customers/${'a'.repeat(36)}/notes`],
    ['GET', `${base}x`], ['GET', `${base}/notes/extra`],
    ['GET', `${base}/wallet/credits`], ['GET', `${base}/secrets`],
    ['GET', `${base}/notes%2fextra`], ['GET', `${base}/../notes`],
    ['GET', `${base}/notes\n`], ['GET', `${base}/notes\\extra`],
    ['POST', base], ['PATCH', base], ['DELETE', base],
    ['POST', `${base}/audit`], ['POST', `${base}/orders`],
    ['PATCH', `${base}/wallet`], ['DELETE', `${base}/notes`],
    ['PUT', `${base}/status`], ['HEAD', base], ['OPTIONS', base],
    ['POST', `${base}/notes?override=true`],
  ];
  for (const [method, endpoint] of cases) {
    const h = harness();
    const response = await h.send(method, endpoint);
    assert.equal(response.status, 404, `${method} ${endpoint}`);
    assert.equal(h.calls.length, 0, endpoint);
  }
  assert.equal(harness().route.PUT, undefined); // Next supplies 405 for unexported methods.
});

test('decoded separators cannot be smuggled inside a catch-all segment', async () => {
  const h = harness();
  const response = await h.route.GET(new Request(`${origin}/api/admin/backend/admin/customers/${id}/notes`), {
    params: Promise.resolve({ path: ['admin', `customers/${id}`, 'notes'] }),
  });
  assert.equal(response.status, 404);
  assert.equal(h.calls.length, 0);
});

test('missing Admin cookie cannot be replaced by customer cookies or an Authorization header', async () => {
  const h = harness({ token: null });
  const response = await h.send('GET', base, { headers: {
    Authorization: 'Bearer test-customer-token', Cookie: 'mxd_customer_access=test-customer-token',
  } });
  assert.equal(response.status, 401);
  assert.equal(h.calls.length, 0);
});

test('backend non-admin/invalid-token rejection is preserved across every customer route', async () => {
  for (const status of [401, 403]) {
    const h = harness({ token: 'test-customer-token', upstreamStatus: status });
    for (const [method, endpoint] of [
      ['GET', base], ['GET', `${base}/notes`], ['GET', `${base}/audit`], ['GET', `${base}/wallet`], ['GET', `${base}/orders`],
      ['PATCH', `${base}/status`], ['POST', `${base}/notes`], ['POST', `${base}/revoke-sessions`], ['POST', `${base}/wallet/credits`],
    ]) {
      const response = await h.send(method, endpoint, method === 'GET' ? {} : { body: '{}', headers: { 'Content-Type': 'application/json' } });
      assert.equal(response.status, status, `${method} ${endpoint}`);
    }
  }
});

test('Origin, content type and body limits still reject before forwarding', async () => {
  for (const [options, status] of [
    [{ headers: { Origin: 'https://untrusted.test', 'Content-Type': 'application/json' }, body: '{}' }, 403],
    [{ headers: { 'Content-Type': 'text/plain' }, body: '{}' }, 415],
    [{ headers: { 'Content-Type': 'application/json', 'Content-Length': String(2 * 1024 * 1024 + 1) }, body: '{}' }, 413],
    [{ headers: { 'Content-Type': 'application/json' }, body: '{' }, 400],
  ]) {
    const h = harness();
    assert.equal((await h.send('POST', `${base}/notes`, options)).status, status);
    assert.equal(h.calls.length, 0);
  }
});

test('only wallet credit forwards idempotency key; caller auth/role headers are never forwarded', async () => {
  for (const endpoint of [`${base}/notes`, `${base}/wallet/credits`]) {
    const h = harness();
    await h.send('POST', endpoint, { body: '{}', headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': 'regression-key',
      Authorization: 'Bearer attacker', 'X-Role': 'super_admin',
    } });
    const headers = new Headers(h.calls[0].headers);
    assert.equal(headers.get('authorization'), 'Bearer test-admin-token');
    assert.equal(headers.get('x-role'), null);
    assert.equal(headers.get('idempotency-key'), endpoint.endsWith('/wallet/credits') ? 'regression-key' : null);
  }
});

test('existing non-customer allowlisted reads remain available', async () => {
  for (const endpoint of ['/admin/games', `/admin/orders/${id}/chat`, '/admin/legal-pages/privacy-policy']) {
    const h = harness();
    assert.equal((await h.send('GET', endpoint)).status, 200);
    assert.equal(h.calls.length, 1);
  }
});
