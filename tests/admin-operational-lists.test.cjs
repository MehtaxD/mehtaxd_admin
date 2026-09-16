const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("operational list pages opt into the scoped responsive treatment", () => {
  const orders = read("src/app/admin/orders/page.tsx");
  const chats = read("src/app/admin/chats/page.tsx");
  const customers = read("src/app/admin/customers/page.tsx");

  assert.match(orders, /adminOperationalPage adminOrdersListPage/);
  assert.match(orders, /adminOperationalTable adminOrdersListTable/);
  assert.match(chats, /adminOperationalPage adminChatsInboxPage/);
  assert.match(chats, /adminOperationalTable adminChatsInboxTable/);
  assert.match(customers, /adminOperationalPage adminCustomersListPage/);
  assert.match(customers, /adminOperationalTable adminCustomersListTable/);
});

test("mobile records retain an explicit touch-friendly primary action", () => {
  const orders = read("src/app/admin/orders/page.tsx");
  const chats = read("src/app/admin/chats/page.tsx");
  const customers = read("src/app/admin/customers/page.tsx");
  const css = read("src/app/globals.css");

  assert.match(orders, />Open order<\/span>/);
  assert.match(chats, />Open chat<\/Link>/);
  assert.match(customers, />Open customer<\/span>/);
  assert.match(
    css,
    /\.adminOperationalTable \.adminOperationalAction \.adminIconButton[\s\S]*?min-height:\s*44px/,
  );
});

test("operational records switch before tablet width and contain long values", () => {
  const css = read("src/app/globals.css");

  assert.match(css, /@media \(max-width:\s*900px\)/);
  assert.match(css, /\.adminOperationalTable[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css, /\.adminOperationalPreview small[\s\S]*?-webkit-line-clamp:\s*2/);
  assert.match(css, /\.adminOrderFilters\.adminOperationalFilters[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("unread inbox rows use a restrained state hook without changing chat data", () => {
  const chats = read("src/app/admin/chats/page.tsx");

  assert.match(chats, /item\.unreadCount \? "adminInboxUnread" : undefined/);
  assert.match(chats, /item\.latestMessage\.body\.slice\(0, 90\)/);
  assert.match(chats, /nestjsApi\.orders\.chatInbox\(\)/);
});
