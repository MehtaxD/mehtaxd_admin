const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const slugModule = import(pathToFileURL(path.join(process.cwd(), "src/lib/slug-input.ts")));

test("slug draft accepts spaces and manual dashes without removing the trailing separator", async () => {
  const { normalizeSlugDraft } = await slugModule;
  assert.equal(normalizeSlugDraft("8 Ball Pool Coins"), "8-ball-pool-coins");
  assert.equal(normalizeSlugDraft("8-ball-pool-"), "8-ball-pool-");
  assert.equal(normalizeSlugDraft("8---ball   pool"), "8-ball-pool");
});

test("final slug is lowercase, safe, and trimmed", async () => {
  const { finalizeSlug } = await slugModule;
  assert.equal(finalizeSlug("--8 Ball Pool Coins Cheap--"), "8-ball-pool-coins-cheap");
  assert.equal(finalizeSlug("8 Ball @ Pool!!! Coins"), "8-ball-pool-coins");
});
