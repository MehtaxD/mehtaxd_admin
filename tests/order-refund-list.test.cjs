const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

test("Admin list renders aggregate financial states and forwards refund/queue filters", async () => {
  const fixtures = ["partially_refunded", "refunded"].map(
    (paymentStatus, index) => ({
      id: String(index),
      orderNumber: `RF-${index}`,
      paymentStatus,
      financialStatus: paymentStatus,
      paymentSource: "wallet",
      orderStatus: index ? "completed" : "confirmed",
      fulfillmentStatus: index ? "completed" : "unfulfilled",
      paidMinor: 2000,
      refundedMinor: index ? 2000 : 500,
      totalMinor: 2000,
      currency: "USD",
      items: [],
      createdAt: "2026-10-26T00:00:00Z",
    }),
  );
  const slots = [],
    effects = [],
    requests = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v) => (slots[i] = v)];
    },
    useMemo: (f) => f(),
    useEffect: (fn) => effects.push(fn),
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        path.resolve(__dirname, "../src/app/admin/orders/page.tsx"),
        "utf8",
      ),
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
      require: (n) =>
        n === "react"
          ? react
          : n === "react/jsx-runtime"
            ? { jsx, jsxs: jsx }
            : n === "next/link"
              ? { default: "a" }
              : n === "@/components/icons"
                ? {}
                : n === "@/lib/nestjs-api"
                  ? {
                      nestjsApi: {
                        orders: {
                          list: async (query) => {
                            requests.push(query);
                            return {
                              items: fixtures,
                              total: 2,
                              totalPages: 1,
                              queueCounts: { readyForFulfillment: 1 },
                            };
                          },
                        },
                      },
                    }
                  : require(n),
      Intl,
      Date,
    },
  );
  let tree;
  const render = () => {
    cursor = 0;
    tree = exports.default();
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
  async function flush() {
    effects.splice(0).forEach((fn) => fn());
    await new Promise((resolve) => setImmediate(resolve));
    render();
  }
  render();
  await flush();
  const rows = nodes(tree).filter(
    (n) => n.type === "tr" && n.props.children?.some?.((c) => c?.type === "td"),
  );
  assert.equal(rows.length, 2);
  assert.match(text(rows[0]), /Partially Refunded/);
  assert.match(text(rows[1]), /Refunded/);
  assert.doesNotMatch(rows.map(text).join(""), /Awaiting attempt|Unpaid/);
  const filter = nodes(tree).find(
    (n) => n.type === "label" && text(n).startsWith("Payment status"),
  );
  const select = nodes(filter).find((n) => n.type === "select");
  select.props.onChange({ target: { value: "refunded" } });
  render();
  await flush();
  assert.equal(requests.at(-1).paymentStatus, "refunded");
  const queue = nodes(tree).find(
    (n) => n.type === "button" && text(n).includes("Ready to fulfill"),
  );
  assert.ok(queue);
  queue.props.onClick();
  render();
  await flush();
  assert.equal(requests.at(-1).queue, "ready_for_fulfillment");
});
