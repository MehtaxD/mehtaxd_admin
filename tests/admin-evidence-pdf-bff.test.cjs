const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const orderId = "9a50db43-e982-4054-b769-82d46286bca9";
const deliveryId = "7ad7fc95-6eb7-46b5-8a8f-649ed69be00a";
const endpoint = `/admin/orders/${orderId}/deliveries/${deliveryId}/evidence.pdf`;
const origin = "http://localhost:3001";
const pdf = new TextEncoder().encode("%PDF-1.3\nfixture");

function harness({ token = "test-admin-token", status = 200 } = {}) {
  const calls = [];
  function load(file, dependencies = {}, fetchImpl) {
    const filename = path.resolve(__dirname, "..", file);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const exports = {};
    vm.runInNewContext(
      source,
      {
        exports,
        require: (name) => dependencies[name] ?? require(name),
        process: {
          env: {
            ADMIN_URL: origin,
            NESTJS_API_URL: "http://backend.test",
            NODE_ENV: "test",
          },
        },
        fetch: fetchImpl,
        Request,
        Response,
        Headers,
        Blob,
        URL,
        URLSearchParams,
        TextDecoder,
        Uint8Array,
        ArrayBuffer,
      },
      { filename },
    );
    return exports;
  }

  const helper = load(
    "src/lib/admin-api-route.ts",
    {
      "next/headers": {
        cookies: async () => ({
          get: (name) =>
            name === "mxd_admin_access" && token ? { value: token } : undefined,
        }),
      },
    },
    async (url, init) => {
      calls.push({ url, ...init });
      if (status !== 200) {
        return Response.json(
          {
            message:
              status === 404
                ? "Delivery evidence not found"
                : "Delivery evidence integrity verification failed",
          },
          { status },
        );
      }
      return new Response(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            'attachment; filename="MehtaXD-dispute-evidence-MXD-26-TEST.pdf"',
          "Cache-Control": "private, no-store",
        },
      });
    },
  );
  const route = load("src/app/api/admin/backend/[...path]/route.ts", {
    "@/lib/admin-api-route": helper,
  });

  async function send(method, target = endpoint) {
    const request = new Request(`${origin}/api/admin/backend${target}`, {
      method,
      headers: { Origin: origin },
    });
    const segments = target.split("?")[0].slice(1).split("/");
    return (route[method] ?? route.GET)(request, {
      params: Promise.resolve({ path: segments }),
    });
  }

  const client = load("src/lib/nestjs-api.ts", {}, (url, init) =>
    send(init.method ?? "GET", url.replace("/api/admin/backend", "")),
  ).nestjsApi;
  return { calls, client, route, send };
}

test("exact evidence route forwards PDF bytes, type and safe filename", async () => {
  const h = harness();
  const response = await h.send("GET");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="MehtaXD-dispute-evidence-MXD-26-TEST.pdf"',
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(pdf));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, `http://backend.test${endpoint}`);
  assert.equal(
    new Headers(h.calls[0].headers).get("authorization"),
    "Bearer test-admin-token",
  );
});

test("Admin API client returns the PDF blob and upstream filename", async () => {
  const result = await harness().client.orders.downloadDeliveryEvidence(
    orderId,
    deliveryId,
  );
  assert.equal(result.filename, "MehtaXD-dispute-evidence-MXD-26-TEST.pdf");
  assert.deepEqual(
    Buffer.from(await result.blob.arrayBuffer()),
    Buffer.from(pdf),
  );
});

test("404 and 422 error messages remain readable instead of becoming downloads", async () => {
  for (const status of [404, 422]) {
    await assert.rejects(
      harness({ status }).client.orders.downloadDeliveryEvidence(
        orderId,
        deliveryId,
      ),
      new RegExp(
        status === 404 ? "not found" : "integrity verification failed",
        "i",
      ),
    );
  }
});

test("malformed, nested, queried and unsupported evidence routes stay blocked", async () => {
  const cases = [
    ["GET", `/admin/orders/not-a-uuid/deliveries/${deliveryId}/evidence.pdf`],
    ["GET", `/admin/orders/${orderId}/deliveries/not-a-uuid/evidence.pdf`],
    ["GET", `${endpoint}?download=true`],
    ["GET", `${endpoint}/extra`],
    ["GET", `/admin/orders/${orderId}/evidence.pdf`],
    ["POST", endpoint],
    ["PATCH", endpoint],
    ["DELETE", endpoint],
  ];
  for (const [method, target] of cases) {
    const h = harness();
    assert.equal(
      (await h.send(method, target)).status,
      404,
      `${method} ${target}`,
    );
    assert.equal(h.calls.length, 0);
  }
});

test("missing Admin cookie cannot be replaced with access to the PDF route", async () => {
  const h = harness({ token: null });
  assert.equal((await h.send("GET")).status, 401);
  assert.equal(h.calls.length, 0);
});
