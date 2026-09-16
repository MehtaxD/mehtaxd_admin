const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

function loadNormalizer() {
  const source = ts.transpileModule(read("src/lib/safe-api-error.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", source)(exports);
  return exports;
}

test("Admin errors never fall back to raw backend or database text", () => {
  const { safeAdminErrorFromPayload } = loadNormalizer();
  const result = safeAdminErrorFromPayload(500, {
    message: "QueryFailedError: violates constraint customers_email_key",
  });
  assert.equal(result.message, "The Admin service is temporarily unavailable. Try again in a moment.");
  assert.doesNotMatch(result.message, /query|constraint|database/i);
});

test("Admin normalization preserves session, conflict, and rate-limit meaning", () => {
  const { safeAdminApiError } = loadNormalizer();
  assert.equal(safeAdminApiError(401).code, "SESSION_EXPIRED");
  assert.equal(safeAdminApiError(409).code, "CONFLICT");
  assert.equal(safeAdminApiError(429).code, "RATE_LIMITED");
});

test("Admin route boundary is actionable and does not render exception details", () => {
  const source = read("src/app/error.tsx");
  assert.match(source, /onClick=\{retry\}/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /error\.(message|stack)/);
});

test("failed dashboard and selector loads are not rendered as real zero or empty data", () => {
  const dashboard = read("src/app/admin/page.tsx");
  const categories = read("src/app/admin/categories/page.tsx");
  const products = read("src/app/admin/products/page.tsx");
  const categoryEditor = read("src/app/admin/categories/[id]/page.tsx");
  const productEditor = read("src/app/admin/products/[id]/page.tsx");
  assert.match(dashboard, /stats\.products \?\? "Unavailable"/);
  assert.match(dashboard, /Product totals couldn’t load/);
  assert.match(categories, /Game filters couldn’t load/);
  assert.match(products, /Category filters couldn’t load/);
  assert.match(categoryEditor, /Games couldn’t load, so this category cannot be assigned safely/);
  assert.match(productEditor, /Categories couldn’t load for the selected game/);
});

test("major catalog delete errors use persistent inline feedback instead of alerts", () => {
  for (const file of [
    "src/app/admin/games/page.tsx",
    "src/app/admin/categories/page.tsx",
    "src/app/admin/products/page.tsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /\balert\(/);
    assert.match(source, /role="alert"/);
  }
});
