const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
const styles = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

function loadNavigationHelper() {
  const filename = path.join(root, "src/lib/admin-navigation.ts");
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("exports", source)(exports);
  return exports;
}

test("active navigation includes detail routes without activating Dashboard globally", () => {
  const { isAdminRouteActive } = loadNavigationHelper();
  assert.equal(isAdminRouteActive("/admin", "/admin"), true);
  assert.equal(isAdminRouteActive("/admin/orders", "/admin/orders"), true);
  assert.equal(isAdminRouteActive("/admin/orders/order-id", "/admin/orders"), true);
  assert.equal(isAdminRouteActive("/admin/customers/customer-id", "/admin/customers"), true);
  assert.equal(isAdminRouteActive("/admin/orders", "/admin"), false);
  assert.equal(isAdminRouteActive("/admin/orderly", "/admin/orders"), false);
});

test("Admin shell uses Next links and exposes the active route accessibly", () => {
  assert.match(layout, /import Link from "next\/link"/);
  assert.match(layout, /aria-current=\{active \? "page" : undefined\}/);
  assert.doesNotMatch(layout, /<a href=\{href\}/);
});

test("mobile navigation supports menu, Escape, backdrop, and navigation close", () => {
  assert.match(layout, /drawer\.showModal\(\)/);
  assert.match(layout, /onCancel=\{\(event\) =>/);
  assert.match(layout, /event\.target === event\.currentTarget/);
  assert.match(layout, /onClick=\{mobile \? \(\) => closeDrawer\(false\)/);
  assert.match(layout, /aria-controls="admin-mobile-navigation"/);
  assert.match(layout, /document\.documentElement\.classList\.add\("adminNavOpen"\)/);
});

test("responsive shell supplies touch targets, tablet drawer, and reduced motion", () => {
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /\.adminMenuButton,[\s\S]*width: 44px;[\s\S]*height: 44px;/);
  assert.match(styles, /\.adminNav a,[\s\S]*min-height: 44px;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
