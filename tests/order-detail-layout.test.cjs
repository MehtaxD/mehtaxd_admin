const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

test("Order conversation has a spacious bounded viewport and allows page scroll chaining", () => {
  const css = readFileSync(require.resolve("../src/app/globals.css"), "utf8");
  const rule = css.match(/\.adminOrderLayout \.adminChatViewport\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, "Order-specific chat sizing rule exists");
  assert.match(rule, /height:\s*clamp\(320px,\s*46dvh,\s*520px\)/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.adminOrderLayout \.adminChatViewport\s*\{\s*height:\s*clamp\(250px,\s*48dvh,\s*400px\)/);
  assert.match(rule, /overscroll-behavior:\s*auto\s*;/);
});

function renderOrder(status = "completed", fulfillment = "completed", deliveryItems = [], api = {}, changes=[]) {
  let state = 0;
  const order = {
    id: "order",
    orderNumber: "MXD-TEST",
    customerName: "Test customer",
    customerEmail: "test@example.invalid",
    customerId: "customer",
    orderStatus: status,
    fulfillmentStatus: fulfillment,
    financialStatus: "succeeded",
    paidMinor: 200,
    refundedMinor: 0,
    totalMinor: 200,
    subtotalMinor: 200,
    discountMinor: 0,
    taxMinor: 0,
    feeMinor: 0,
    currency: "USD",
    version: 4,
    createdAt: "2026-10-26T08:00:00Z",
    paidAt: "2026-10-26T08:00:01Z",
    expiresAt: null,
    cancelledAt: null,
    completedAt: null,
    updatedAt: null,
    items: [
      {
        id: "item",
        productName: "Purchased package",
        variantLabel: "1,000 of Each",
        selectedOptions: { Platform: "Xbox" },
        quantity: 1,
        unitPriceMinor: 200,
        lineTotalMinor: 200,
        currency: "USD",
        imageUrl: null,
      },
    ],
    events: [],
  };
  const react = {
    useState(initial) {
      const i = state++;
      return [i === 0 ? order : i === 1 ? false : i===6 ? deliveryItems : initial, value => changes.push({i,value})];
    },
    useCallback: (f) => f,
    useMemo: (f) => f(),
    useRef: (value) => ({ current: value }),
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        require.resolve("../src/app/admin/orders/[id]/page.tsx"),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports,
      Intl,
      Date,
      crypto:require('node:crypto').webcrypto,
      process: { env: {} },
      require(name) {
        if (name === "react") return react;
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "next/navigation")
          return { useParams: () => ({ id: "order" }) };
        if (name === "next/link") return { default: "a" };
        if (name === "@/components/order-refunds")
          return { OrderRefunds: "refund-controls" };
        if (name === "@/lib/order-chat-realtime")
          return { useAdminOrderChatRealtime: () => "connected" };
        if (name === "@/lib/nestjs-api") return { nestjsApi: api };
        if (name === "@/components/icons") return {};
        throw Error(name);
      },
    },
  );
  return exports.default();
}
function nodes(n) {
  if (!n || typeof n !== "object") return [];
  return Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
}
function text(n) {
  return Array.isArray(n)
    ? n.map(text).join("")
    : n && typeof n === "object"
      ? text(n.props?.children)
      : String(n ?? "");
}
test("purchased items and delivery precede conversation in the reading order", () => {
  const all = nodes(renderOrder());
  const headings = all.filter((n) => ["h2", "h3"].includes(n.type)).map(text);
  assert.ok(headings.indexOf("Items") < headings.indexOf("Delivery"));
  assert.ok(
    headings.indexOf("Delivery") < headings.indexOf("Customer conversation"),
  );
  assert.ok(all.find((n) => n.type === "refund-controls"));
  assert.match(text(all), /1,000 of Each/);
  assert.match(text(all), /Xbox/);
});
test("completed Order uses a concise state without irrelevant delivery entry", () => {
  const all = nodes(renderOrder());
  assert.doesNotMatch(text(all), /No legal .* transitions are available/);
  const entry = all.find(
    (n) =>
      n.type === "details" && n.props.className === "adminOrderDeliveryEntry",
  );
  assert.equal(entry,undefined);
});
test("processing Order keeps existing fulfillment actions and delivery entry visible", () => {
  const all = nodes(renderOrder("confirmed", "processing"));
  assert.ok(
    all.some((n) => n.type === "button" && text(n) === "Mark Delivered"),
  );
  const entry = all.find(
    (n) =>
      n.type === "details" && n.props.className === "adminOrderDeliveryEntry",
  );
  assert.equal(entry?.props.open, false);
  const confirm = nodes(entry).find(n=>n.type==='button' && text(n)==='Confirm & Mark Delivered');
  assert.ok(confirm);
  assert.equal(confirm.props.disabled,false,'empty optional fields do not disable delivery');
});
test("technical identifiers and lifecycle are inside collapsed Activity", () => {
  const all = nodes(renderOrder());
  const activity = all.find(
    (n) =>
      n.type === "details" &&
      n.props.className === "adminOrderActivity adminPanel",
  );
  assert.ok(activity);
  assert.ok(!activity.props.open);
  assert.match(text(activity), /Internal ID/);
  assert.match(text(activity), /Version/);
  assert.match(text(activity), /Lifecycle/);
});
test("pending evidence exposes retry, not a PDF download, and empty delivery has no fake redaction",()=>{
  const delivery={id:'delivery',deliveryType:'instructions',payload:'',deliveredAt:'2026-10-26T08:00:01Z',acknowledgedAt:'2026-10-26T08:00:01Z',acknowledgement:{evidenceVersion:'2',integrityStatus:'valid'},evidencePdf:{status:'pending'}};
  const pending=text(nodes(renderOrder('completed','completed',[delivery])));
  assert.match(pending,/Evidence PDF pending/);
  assert.match(pending,/Retry evidence PDF/);
  assert.doesNotMatch(pending,/Download Evidence PDF|Redacted/);
  const ready=text(nodes(renderOrder('completed','completed',[{...delivery,evidencePdf:{status:'ready'}}])));
  assert.match(ready,/Download Evidence PDF/);
});
test("uncertain delivery retries preserve the original operation key and exact body",async()=>{
  const calls=[];
  const changes=[];
  const api={orders:{createDelivery:async(id,data,key)=>{calls.push({id,data,key});if(calls.length===1)throw Error('Lost response');return{id:'delivery'};},get:async()=>{throw Error('Refresh unavailable');}}};
  const tree=nodes(renderOrder('confirmed','processing',[],api,changes));
  const submit=tree.find(n=>n.type==='button' && text(n)==='Confirm & Mark Delivered');
  await submit.props.onClick();await submit.props.onClick();
  assert.equal(calls.length,2);
  assert.equal(calls[0].key,calls[1].key);
  assert.equal(calls[0].data,calls[1].data);
  assert.equal(calls[0].data.expectedVersion,4);
  assert.equal(changes.filter(change=>change.i===12).at(-1).value,false,'a failed refresh after successful delivery does not reopen an uncertain operation');
});
test("historical Delivered state offers an honest missing-record recovery",()=>{
  const rendered=nodes(renderOrder('confirmed','delivered'));
  assert.ok(rendered.find(n=>n.type==='button' && text(n)==='Create missing delivery record'));
  assert.match(text(rendered),/Creates the missing delivery record now/);
  assert.match(text(rendered),/No historical content or buyer confirmation will be invented/);
});
test("delivery form uploads multiple images sequentially to the current Order",async()=>{
  const calls=[];
  const api={orders:{uploadDeliveryImage:async(id,file)=>{calls.push({id,file});return{id:String(calls.length),sizeBytes:file.size};}}};
  const tree=nodes(renderOrder('confirmed','processing',[],api));
  const input=tree.find(n=>n.type==='input' && n.props.type==='file');
  assert.equal(input.props.multiple,true);
  input.props.onChange({target:{files:[{type:'image/png',size:20},{type:'image/jpeg',size:30}],value:'selected'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(c=>c.id),['order','order']);
});
