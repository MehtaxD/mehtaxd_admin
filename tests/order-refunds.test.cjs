const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
function load(file, deps = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(path.resolve(__dirname, "..", file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      exports,
      require: (n) => deps[n] ?? require(n),
      Intl,
      Date,
      crypto: { randomUUID },
      window: deps.window,
      Error,
      Number,
      JSON,
    },
    { filename: file },
  );
  return exports;
}
test("refund amount input converts exact decimals to minor units", () => {
  const { refundMinor } = load("src/lib/refund-form.ts");
  for (const [draft, want] of [
    ["12.99", 1299],
    ["12.5", 1250],
    ["0", null],
    ["-1", null],
    ["1.001", null],
    ["", null],
    ["1e2", null],
  ])
    assert.equal(refundMinor(draft), want);
});
function harness({
  remaining = 2000,
  currency = "USD",
  create,
  history = [],
  storage = new Map(),
  read,
  effects = false,
} = {}) {
  const summary = {
    paidMinor: 2000,
    refundedMinor: 2000 - remaining,
    remainingRefundableMinor: remaining,
    currency,
    storeCreditAllowed: currency === "USD",
    reconciliationRequired: false,
    history,
    sourcePayments: [
      {
        id: "payment",
        provider: "gateway",
        amountMinor: 1500,
        availableMinor: 1500,
      },
    ],
  };
  const slots = [],
    calls = [],
    pendingEffects = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] =
          i === 0 && !effects
            ? summary
            : i === 13 && !effects
              ? "order"
              : typeof initial === "function"
                ? initial()
                : initial;
      return [
        slots[i],
        (v) => {
          slots[i] = typeof v === "function" ? v(slots[i]) : v;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useCallback: (f) => f,
    useEffect(fn, deps) {
      const i = cursor++;
      if (effects && !(i in slots)) {
        slots[i] = deps;
        pendingEffects.push(fn);
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const api = {
    refunds: async () => (read ? read(summary) : summary),
    createRefund: async (...args) => {
      calls.push(args);
      return create ? create(...args) : { id: "refund", status: "succeeded" };
    },
  };
  const form = load("src/lib/refund-form.ts");
  const mod = load("src/components/order-refunds.tsx", {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/nestjs-api": { nestjsApi: { orders: api } },
    "@/lib/refund-form": form,
    window: {
      sessionStorage: {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.delete(k),
      },
    },
  });
  let tree;
  const render = () => {
    cursor = 0;
    tree = mod.OrderRefunds({ orderId: "order", onChanged: async () => {} });
  };
  const nodes = (n) =>
    !n || typeof n !== "object"
      ? []
      : Array.isArray(n)
        ? n.flatMap(nodes)
        : [n, ...nodes(n.props?.children)];
  const text = (n) =>
    Array.isArray(n)
      ? n.map(text).join("")
      : n && typeof n === "object"
        ? text(n.props?.children)
        : String(n ?? "");
  const find = (pred) => {
    const n = nodes(tree).find(pred);
    assert.ok(n, "Expected control");
    return n;
  };
  const button = (name) => find((n) => n.type === "button" && text(n) === name);
  const input = (id, value) => {
    find((n) => n.props?.id === id).props.onChange({
      target: { value, checked: value },
    });
    render();
  };
  const open = () => {
    button("Issue refund").props.onClick();
    render();
  };
  render();
  return {
    calls,
    storage,
    render,
    button,
    input,
    open,
    text: () => text(tree),
    find,
    flush: async () => {
      for (const fn of pendingEffects.splice(0)) fn();
      await new Promise((resolve) => setImmediate(resolve));
      render();
    },
    submit: () =>
      find((n) => n.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}
test("zero remaining disables refund; non-USD disables Store Credit", () => {
  const zero = harness({ remaining: 0 });
  assert.equal(zero.button("Issue refund").props.disabled, true);
  const eur = harness({ currency: "EUR" });
  eur.open();
  assert.match(eur.text(), /USD/);
  assert.equal(
    eur.find((n) => n.type === "option" && n.props.value === "store_credit")
      .props.disabled,
    true,
  );
});
test("manual path requires payment reference and explicit external confirmation", async () => {
  const h = harness();
  h.open();
  h.input("refund-scope", "partial");
  h.input("refund-amount", "5.00");
  h.input("refund-destination", "original_payment_manual");
  h.input("refund-reason", "Service issue");
  assert.match(h.text(), /does not send money/);
  await h.submit();
  assert.equal(h.calls.length, 0);
  h.input("refund-payment", "payment");
  h.input("refund-reference", "RF-123");
  h.input("refund-confirmed", true);
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1].amountMinor, 500);
  assert.equal(h.calls[0][1].manualRefundConfirmed, true);
});
test("rapid double-click sends one request and uncertain retry keeps key and payload", async () => {
  let release;
  const pending = new Promise((_, reject) => {
    release = () => reject(new Error("Response lost"));
  });
  let count = 0;
  const h = harness({
    create: () =>
      ++count === 1 ? pending : { id: "refund", status: "succeeded" },
  });
  h.open();
  h.input("refund-reason", "Service issue");
  const first = h.submit();
  await h.submit();
  assert.equal(h.calls.length, 1);
  release();
  await first;
  h.render();
  assert.match(h.text(), /uncertain|unknown/i);
  assert.equal(h.storage.size, 1);
  await h.button("Retry original request").props.onClick();
  h.render();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0][2], h.calls[1][2]);
  assert.equal(JSON.stringify(h.calls[0][1]), JSON.stringify(h.calls[1][1]));
});
test("Admin history renders refund scope, internal reason, destination and reference", () => {
  const h = harness({
    history: [
      {
        id: "refund",
        amountMinor: 500,
        currency: "USD",
        scope: "partial",
        destination: "original_payment_manual",
        status: "succeeded",
        reason: "Service issue",
        adminUserId: "admin",
        externalReference: "RF-123",
        createdAt: "2026-10-26T00:00:00Z",
      },
    ],
  });
  for (const x of [
    "Partial",
    "Original payment method",
    "Service issue",
    "RF-123",
  ])
    assert.ok(h.text().includes(x), x);
});

for (const firstReadFails of [false, true])
  test(`refresh restores uncertain request independently of history (${firstReadFails ? "failed" : "successful"} initial read)`, async () => {
    const saved = {
      orderId: "order",
      key: "original-key",
      body: { amountMinor: 500, destination: "store_credit", reason: "Issue" },
    };
    const storage = new Map([["mxd_refund:order", JSON.stringify(saved)]]);
    let reads = 0;
    const h = harness({
      effects: true,
      storage,
      read: (summary) => {
        if (firstReadFails && ++reads === 1) throw Error("offline");
        return summary;
      },
      create: () => {
        throw Error("connection reset");
      },
    });
    await h.flush();
    assert.equal(h.button("Issue refund").props.disabled, true);
    await h.button("Check refund status").props.onClick();
    h.render();
    assert.equal(h.button("Issue refund").props.disabled, true);
    assert.equal(storage.size, 1);
    await h.button("Retry original request").props.onClick();
    h.render();
    assert.equal(h.calls[0][2], "original-key");
    assert.equal(h.calls[0][1].amountMinor, 500);
    assert.equal(storage.size, 1);
  });
test("authoritative succeeded/failed reconciliation clears saved protection", async () => {
  for (const status of ["succeeded", "failed"]) {
    const saved = {
      orderId: "order",
      key: "original-key",
      body: { amountMinor: 500, destination: "store_credit", reason: "Issue" },
    };
    const storage = new Map([["mxd_refund:order", JSON.stringify(saved)]]);
    const h = harness({
      effects: true,
      storage,
      history: [
        {
          id: "r",
          idempotencyKey: "original-key",
          status,
          amountMinor: 500,
          currency: "USD",
          destination: "store_credit",
          createdAt: new Date(0),
        },
      ],
    });
    await h.flush();
    await h.button("Check refund status").props.onClick();
    h.render();
    assert.equal(storage.size, 0);
    assert.equal(h.button("Issue refund").props.disabled, false);
  }
});
test("explicit no-effect rejection unlocks correction but generic 409/network errors do not", async () => {
  for (const rejected of [true, false]) {
    const h = harness({
      create: () => {
        throw Object.assign(new Error("Rejected"), {
          refundOutcome: rejected ? "rejected" : undefined,
        });
      },
    });
    h.open();
    h.input("refund-reason", "Issue");
    await h.submit();
    h.render();
    assert.equal(h.storage.size, rejected ? 0 : 1);
    assert.equal(h.button("Issue refund").props.disabled, !rejected);
    if (rejected) {
      h.input("refund-scope", "partial");
      h.input("refund-amount", "5.00");
      h.input("refund-destination", "original_payment_manual");
      assert.match(h.text(), /does not send money/);
      h.input("refund-payment", "payment");
      h.input("refund-reference", "REF-CORRECTED");
      h.input("refund-confirmed", true);
      await h.submit();
      assert.equal(h.calls.length, 2);
      assert.notEqual(h.calls[0][2], h.calls[1][2]);
      assert.equal(h.calls[1][1].destination, "original_payment_manual");
    }
  }
});

for (const status of ["failed", "succeeded"])
  test(`authoritative ${status} replay releases protection even when history is unavailable`, async () => {
    let unavailable = false;
    const h = harness({
      read: (summary) => {
        if (unavailable) throw Error("offline");
        return summary;
      },
      create: () => ({ id: "refund", status }),
    });
    h.open();
    h.input("refund-reason", "Issue");
    unavailable = true;
    await h.submit();
    h.render();
    assert.equal(h.storage.size, 0);
    assert.doesNotMatch(h.text(), /outcome is uncertain/);
    unavailable = false;
    await h.button("Check refund status").props.onClick();
    h.render();
    assert.equal(h.button("Issue refund").props.disabled, false);
  });
