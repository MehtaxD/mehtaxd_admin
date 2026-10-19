const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const editor = fs.readFileSync(
  path.join(root, "src/components/blog/blog-editor.tsx"),
  "utf8",
);
const productPage = fs.readFileSync(
  path.join(root, "src/app/admin/products/[id]/page.tsx"),
  "utf8",
);

test("Product Full Description reuses the constrained Tiptap editor", () => {
  assert.match(productPage, /<BlogEditor/);
  assert.match(productPage, /mode="product"/);
  assert.match(productPage, /value=\{form\.description\}/);
  assert.doesNotMatch(
    productPage,
    /<textarea[\s\S]{0,200}value=\{form\.description\}/,
  );

  assert.match(editor, /"article" \| "game" \| "product"/);
  assert.match(editor, /mode !== "game"/);
  assert.match(editor, /heading: \{ levels: mode === "article" \? \[2, 3, 4\] : \[2, 3\] \}/);
  assert.match(editor, /mode !== "article"/);
  assert.match(editor, /mode === "article" \? \[Underline\] : \[\]/);
  assert.match(editor, /mode === "article" \? \[ImageExtension/);
  assert.doesNotMatch(editor, /<form[\s\S]{0,100}className="blogModal"/);
  assert.match(editor, /onClick=\{applyDialog\}/);
});
