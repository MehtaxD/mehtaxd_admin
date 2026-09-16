const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("order chat is promoted ahead of the lower operational detail grid", () => {
  const page = read("src/app/admin/orders/[id]/page.tsx");
  assert.ok(
    page.indexOf('className="adminOrderChatWorkspace"') <
      page.indexOf('className="adminOrderDetailGrid"'),
  );
  assert.match(page, /aria-label="Order support context"/);
  assert.match(page, /latestPayment \? badge\(latestPayment\.status\)/);
});

test("conversation uses a bounded scroll viewport and compact keyboard composer", () => {
  const page = read("src/app/admin/orders/[id]/page.tsx");
  const css = read("src/app/globals.css");

  assert.match(page, /ref=\{chatViewportRef\}/);
  assert.match(page, /onScroll=\{handleChatScroll\}/);
  assert.match(page, /Jump to newest/);
  assert.match(page, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(css, /\.adminChatViewport\s*\{[\s\S]*?height:\s*clamp\([\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.adminOrderChatPanel \.adminChatComposer textarea\s*\{[\s\S]*?min-height:\s*44px[\s\S]*?max-height:\s*132px/);
  assert.match(css, /\.adminChatSend\s*\{[\s\S]*?min-height:\s*44px/);
});

test("realtime presentation exposes recovery without changing protocol events", () => {
  const page = read("src/app/admin/orders/[id]/page.tsx");
  const realtime = read("src/lib/order-chat-realtime.ts");

  assert.match(page, /Reconnecting…/);
  assert.match(page, /Connection restored/);
  assert.match(realtime, /socket\.on\("chat:message"/);
  assert.match(realtime, /socket\.on\("chat:receipt-update"/);
  assert.match(realtime, /return connectionState/);
  assert.match(realtime, /"unauthorized"/);
  assert.match(realtime, /"unavailable"/);
  assert.match(page, /Order Chat is unavailable\. Refresh this Order to retry\./);
});

test("initial realtime join skips duplicate sync while reconnect still resynchronizes", () => {
  const realtime = read("src/lib/order-chat-realtime.ts");
  assert.match(realtime, /let connectedOnce = false/);
  assert.match(realtime, /const isReconnect = connectedOnce/);
  assert.match(realtime, /if \(isReconnect\) callbacks\.current\.onSync\(\)/);
  const join = realtime.match(/socket\?\.emit\("chat:join"[\s\S]*?\n\s*}\);/)?.[0];
  assert.ok(join);
  assert.doesNotMatch(join, /markSeen\(\)/);
  assert.match(
    realtime,
    /event\.message\.senderType === "customer"[\s\S]*?markSeen\(\)/,
  );
});

test("long content and reduced motion have explicit safeguards", () => {
  const css = read("src/app/globals.css");

  assert.match(css, /\.adminChatViewport p\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.adminChatViewport li[\s\S]*?animation:\s*none/);
  assert.match(css, /@media \(max-width:\s*430px\)[\s\S]*?\.adminChatViewport[\s\S]*?47dvh/);
});
