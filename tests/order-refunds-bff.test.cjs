const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const id = "9a50db43-e982-4054-b769-82d46286bca9";
function harness(upstream) {
  const calls = [];
  function load(file, deps = {}, fetchImpl) {
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(
        readFileSync(path.resolve(__dirname, "..", file), "utf8"),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
          },
        },
      ).outputText,
      {
        exports,
        require: (n) => deps[n] ?? require(n),
        process: {
          env: {
            ADMIN_URL: "http://localhost:3001",
            NESTJS_API_URL: "http://backend.test",
            NODE_ENV: "test",
          },
        },
        fetch: fetchImpl,
        Request,
        Response,
        Headers,
        URL,
        TextDecoder,
        Uint8Array,
        AbortSignal,
      },
    );
    return exports;
  }
  const safe = load("src/lib/safe-api-error.ts");
  const proxy = load(
    "src/lib/admin-api-route.ts",
    {
      "@/lib/safe-api-error": safe,
      "next/headers": {
        cookies: async () => ({
          get: (n) =>
            n === "mxd_admin_access" ? { value: "admin-token" } : undefined,
        }),
      },
    },
    async (url, init) => {
      calls.push({ url, ...init });
      return upstream ? upstream() : Response.json({ status: "succeeded" });
    },
  );
  const route = load("src/app/api/admin/backend/[...path]/route.ts", {
    "@/lib/admin-api-route": proxy,
  });
  async function send(method, endpoint, body) {
    return route[method](
      new Request("http://localhost:3001/api/admin/backend" + endpoint, {
        method,
        headers: {
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
          "Idempotency-Key": "refund-test-idempotency-key",
          Authorization: "Bearer untrusted-caller",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { params: Promise.resolve({ path: endpoint.slice(1).split("/") }) },
    );
  }
  const client = load(
    "src/lib/nestjs-api.ts",
    { "@/lib/safe-api-error": safe },
    () => send("POST", `/admin/orders/${id}/refunds`, {}),
  );
  return { calls, send, client: client.nestjsApi };
}
test("delivery creation forwards its stable operation key and allows empty optional content", async()=>{
  const h=harness();
  assert.equal((await h.send('POST',`/admin/orders/${id}/deliveries`,{expectedVersion:1})).status,200);
  assert.equal(new Headers(h.calls[0].headers).get('Idempotency-Key'),'refund-test-idempotency-key');
  assert.equal((await h.send('POST',`/admin/orders/${id}/deliveries/${id}/evidence/retry`,{})).status,200);
});
test("refund reads and writes use exact allowlisted Order path and forward only trusted auth plus idempotency", async () => {
  const h = harness();
  assert.equal(
    (await h.send("GET", `/admin/orders/${id}/refunds`)).status,
    200,
  );
  assert.equal(
    (
      await h.send("POST", `/admin/orders/${id}/refunds`, {
        amountMinor: 100,
        destination: "store_credit",
        reason: "Issue",
      })
    ).status,
    200,
  );
  assert.equal(
    new Headers(h.calls[1].headers).get("idempotency-key"),
    "refund-test-idempotency-key",
  );
  assert.equal(
    new Headers(h.calls[1].headers).get("authorization"),
    "Bearer admin-token",
  );
});
test("only explicit no-effect refund rejection survives the BFF as a correction-safe outcome", async () => {
  for (const outcome of ["rejected", undefined]) {
    const h = harness(() =>
      Response.json(
        { refundOutcome: outcome, message: "internal unsafe detail" },
        { status: 409 },
      ),
    );
    const payload = await (
      await h.send("POST", `/admin/orders/${id}/refunds`, {})
    ).json();
    assert.equal(payload.refundOutcome, outcome);
    assert.doesNotMatch(payload.message, /internal unsafe/);
    await assert.rejects(
      h.client.orders.createRefund(id, {}, "same-key"),
      (error) => error.refundOutcome === outcome,
    );
  }
  const h = harness(() =>
    Response.json({ refundOutcome: "rejected" }, { status: 503 }),
  );
  assert.equal(
    (await (await h.send("POST", `/admin/orders/${id}/refunds`, {})).json())
      .refundOutcome,
    undefined,
  );
});
test("malformed and nested refund paths never reach Backend", async () => {
  for (const endpoint of [
    "/admin/orders/not-a-uuid/refunds",
    `/admin/orders/${id}/refunds/extra`,
    `/admin/orders/${"-".repeat(36)}/refunds`,
  ]) {
    const h = harness();
    assert.equal((await h.send("POST", endpoint, {})).status, 404);
    assert.equal(h.calls.length, 0);
  }
});
