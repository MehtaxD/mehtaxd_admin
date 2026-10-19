const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const options = fs.readFileSync(
  path.join(root, "src/components/product-options-editor.tsx"),
  "utf8",
);
const variants = fs.readFileSync(
  path.join(root, "src/components/product-variants-editor.tsx"),
  "utf8",
);
const productPage = fs.readFileSync(
  path.join(root, "src/app/admin/products/[id]/page.tsx"),
  "utf8",
);
const orderPage = fs.readFileSync(
  path.join(root, "src/app/admin/orders/[id]/page.tsx"),
  "utf8",
);

test("Product options support ordered groups and values with accessible fallbacks", () => {
  assert.match(options, /application\/x-mxd-option-group/);
  assert.match(options, /application\/x-mxd-option-value-/);
  assert.match(options, /Move .* up/);
  assert.match(options, /Move .* down/);
  assert.match(options, /referencedValueIds/);
});

test("Admin creates explicit combinations without generating a Cartesian matrix", () => {
  assert.match(variants, /Nothing is generated automatically/);
  assert.match(variants, /Add combination/);
  assert.match(variants, /adminCombinationGroupToggle/);
  assert.doesNotMatch(variants, /flatMap\(.*optionGroups.*values/s);
  assert.match(productPage, /This combination already exists/);
  assert.match(productPage, /Choose exactly one value from every group/);
});

test("Admin Order detail renders the stored variant and selected options", () => {
  assert.match(orderPage, /Variant:<\/strong>/);
  assert.match(orderPage, /optionEntries\(item\.selectedOptions\)/);
});

test("Product price drafts stay editable and normalize only at save time", async () => {
  const priceInput = await import(
    pathToFileURL(path.join(root, "src/lib/price-input.ts")).href
  );

  assert.deepEqual(priceInput.parsePriceDraft(""), { ok: false });
  assert.deepEqual(priceInput.parsePriceDraft("", true), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(priceInput.parsePriceDraft("12.99"), {
    ok: true,
    value: 12.99,
  });
  assert.deepEqual(priceInput.parsePriceDraft("0"), { ok: true, value: 0 });
  assert.deepEqual(priceInput.parsePriceDraft("-1"), { ok: false });
  assert.deepEqual(priceInput.parsePriceDraft("12.999"), { ok: false });
  assert.deepEqual(priceInput.parsePriceDraft("12..9"), { ok: false });
  assert.equal(priceInput.formatPriceDraft("12.50"), "12.50");

  assert.match(variants, /type="text"[\s\S]*inputMode="decimal"/);
  assert.doesNotMatch(variants, /Number\(event\.target\.value\)/);
  assert.match(productPage, /compareAtPrice: formatPriceDraft/);
  assert.match(productPage, /variant\.compareAtPrice !== undefined/);
});
