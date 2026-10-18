const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const page = readFileSync(
  path.join(root, "src/app/admin/reviews/page.tsx"),
  "utf8",
);
const route = readFileSync(
  path.join(root, "src/app/api/admin/backend/[...path]/route.ts"),
  "utf8",
);
const api = readFileSync(path.join(root, "src/lib/nestjs-api.ts"), "utf8");

test("Reviews Admin exposes review publication management without source import controls", () => {
  for (const label of ["Published", "Homepage"]) {
    assert.match(page, new RegExp(label));
  }
  assert.doesNotMatch(page, /Start import|Resume import|importStatus/);
  assert.match(page, /Move review earlier/);
  assert.match(page, /Move review later/);
});

test("Reviews Admin BFF allows only explicit review routes", () => {
  assert.match(route, /admin\\\/reviews/);
  assert.doesNotMatch(route, /import\\\//);
  assert.match(api, /\/admin\/reviews\/homepage-order/);
  assert.doesNotMatch(api, /\/admin\/reviews\/import/);
});
