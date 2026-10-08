const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const editor = fs.readFileSync(path.join(root, "src/app/admin/games/[id]/page.tsx"), "utf8");
const list = fs.readFileSync(path.join(root, "src/app/admin/games/page.tsx"), "utf8");
const media = fs.readFileSync(path.join(root, "src/components/game-media-field.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const uploadRoute = fs.readFileSync(path.join(root, "src/app/api/admin/game-media/route.ts"), "utf8");

test("Game editor reloads FAQs and includes them in create/update saves", () => {
  assert.match(editor, /faqs: game\.faqs\?\.length/);
  assert.equal((editor.match(/faqs: form\.faqs\.filter/g) || []).length, 2);
  assert.match(editor, /<BlogEditor mode="game"/);
});

test("Game Preview uses the Storefront origin and encoded slug", () => {
  assert.match(list, /NEXT_PUBLIC_STOREFRONT_URL/);
  assert.match(list, /\/games\/\$\{encodeURIComponent\(game\.slug\)\}/);
});

test("Highlights keep commas and spaces while editing and split only when saving", () => {
  assert.match(editor, /value=\{form\.highlights\} onChange=\{\(e\) => set\("highlights", e\.target\.value\)\}/);
  assert.match(editor, /highlights: \(game\.highlights \|\| \[\]\)\.join\(", "\)/);
  assert.equal((editor.match(/highlights: form\.highlights\.split\(","\)/g) || []).length, 2);
});

test("Game media upload previews before save, supports replace and remove, and keeps OG inheritance visible", () => {
  assert.match(editor, /GameMediaField kind="icon"/);
  assert.match(editor, /GameMediaField kind="banner"/);
  assert.match(editor, /GameMediaField kind="og"[^>]*fallbackUrl=\{form\.bannerUrl\}/);
  assert.match(editor, /disabled=\{saving \|\| uploadingMedia > 0\}/);
  assert.match(editor, /iconUrl: form\.iconUrl \|\| null/);
  assert.match(editor, /bannerUrl: form\.bannerUrl \|\| null/);
  assert.match(editor, /ogImageUrl: form\.ogImageUrl \|\| null/);
  assert.match(media, /Upload image/);
  assert.match(media, /Replace image/);
  assert.match(media, /Remove/);
  assert.match(media, /Using Banner/);
  assert.match(media, /Social share · 1\.91:1 crop/);
  assert.match(media, /Image unavailable/);
  assert.match(media, /This image URL does not load/);
  assert.match(media, /512 × 512 px/);
  assert.match(media, /1600 × 1280 px/);
  assert.match(media, /1200 × 630 px/);
  assert.match(uploadRoute, /validateAdminOrigin\(request\)/);
  assert.match(uploadRoute, /MAX_BODY_BYTES/);
});

test("Game media previews use the live card crops without shrinking the square Icon", () => {
  assert.match(editor, /kind="icon"[^>]*bannerUrl=\{form\.bannerUrl\}[^>]*gameName=\{form\.name\}[^>]*gameMark=\{form\.mark\}/);
  assert.match(media, /\[bannerUrl, preview\]\.find/);
  assert.match(media, /Games card · 390px mobile crop/);
  assert.match(styles, /\.adminGameMediaPreview\.icon \{[^}]*aspect-ratio: 1;/);
  assert.match(styles, /\.adminGameMediaPreview\.icon img \{ object-fit: contain; \}/);
  assert.match(styles, /\.adminGameMediaPreview\.bannerMobile \{[^}]*aspect-ratio: 364 \/ 150;/);
  assert.match(styles, /\.adminGameMediaPreview\.og \{ aspect-ratio: 1\.91 \/ 1; \}/);
  assert.match(styles, /\.adminGameMediaCardVisual > img\.icon \{[^}]*width: min\(70%, 104px\);[^}]*aspect-ratio: 1; object-fit: contain; \}/);
  assert.match(media, /\{cardImage \? <img/);
  assert.match(media, /: <><span>\{gameMark \|\| "GAME"\}<\/span>/);
});
