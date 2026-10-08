const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const editor = fs.readFileSync(path.join(root, "src/app/admin/games/[id]/page.tsx"), "utf8");
const list = fs.readFileSync(path.join(root, "src/app/admin/games/page.tsx"), "utf8");

test("Game editor reloads FAQs and includes them in create/update saves", () => {
  assert.match(editor, /faqs: game\.faqs\?\.length/);
  assert.equal((editor.match(/faqs: form\.faqs\.filter/g) || []).length, 2);
  assert.match(editor, /<BlogEditor mode="game"/);
});

test("Game Preview uses the Storefront origin and encoded slug", () => {
  assert.match(list, /NEXT_PUBLIC_STOREFRONT_URL/);
  assert.match(list, /\/games\/\$\{encodeURIComponent\(game\.slug\)\}/);
});
