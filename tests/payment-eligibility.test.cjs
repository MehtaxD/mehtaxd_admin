const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const read = (path) => readFileSync(resolve(__dirname, "..", path), "utf8");

test("Payment Eligibility uses exact Admin BFF method/path allowlists", () => {
  const route = read("src/app/api/admin/backend/[...path]/route.ts");
  assert.match(route, /GET:[\s\S]*payment-profiles\(\\\/configuration\|\\\/products\)\?/);
  assert.match(route, /POST:[\s\S]*admin\\\/payment-profiles/);
  assert.match(route, /PATCH:[\s\S]*payment-profiles\\\/store-default/);
  assert.match(route, /PATCH:[\s\S]*payment-profiles\/\$\{uuid\}\(\/assignments\)\?/);
  assert.match(route, /DELETE:[\s\S]*payment-profiles\/\$\{uuid\}/);
  assert.doesNotMatch(route, /payment-profiles\.\*|payment-profiles\/\.\+/);
});

test("Payment Eligibility UI makes inheritance, replacement, and state explicit", () => {
  const page = read("src/app/admin/payment-eligibility/page.tsx");
  assert.match(page, /Product overrides Category, then Game, then Store default/);
  assert.match(page, /Replaces \$\{assignedProfile\?\.name/);
  assert.match(page, /Inherits broader scope/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
  assert.match(page, /Search Product name or slug/);
  assert.match(page, /Load more Products/);
  assert.match(page, /type="checkbox"/);
});

test("Admin profile client sends only profile methods and assignment identifiers", () => {
  const client = read("src/lib/nestjs-api.ts");
  assert.match(client, /allowedExternalLayers: ExternalPaymentLayer\[\]/);
  assert.match(client, /scope: "game" \| "category" \| "product"/);
  assert.match(client, /targetIds: string\[\]/);
  assert.doesNotMatch(client, /providerCredentials|routingPriority|percentage/);
});
