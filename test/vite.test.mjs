import { test } from "node:test";
import assert from "node:assert/strict";
import { localPloyAssets } from "../src/vite.mjs";

const PREFIX = "https://storage.googleapis.com/ployai/00000000-0000-4000-8000-000000000000/user";

test("localPloyAssets returns a named Vite plugin that is not enforce: pre", () => {
  const plugin = localPloyAssets();
  assert.equal(plugin.name, "local-ploy-assets");
  assert.equal(plugin.enforce, undefined);
  assert.equal(typeof plugin.transform, "function");
});

test("each call returns a new plugin object", () => {
  assert.notEqual(localPloyAssets(), localPloyAssets());
});

test("transform rewrites bucket addresses in project code", () => {
  const plugin = localPloyAssets();
  const code = `@font-face{src:url(${PREFIX}/f.woff2)} const S = "${PREFIX}";`;
  assert.deepEqual(plugin.transform(code, "/site/src/styles/theme.css"), {
    code: `@font-face{src:url(/ploy-assets/f.woff2)} const S = "/ploy-assets";`,
    map: null,
  });
});

test("transform leaves code without a bucket address alone", () => {
  assert.equal(localPloyAssets().transform("const a = 1;", "/site/src/a.ts"), null);
});

test("transform skips node_modules", () => {
  const code = `"${PREFIX}/a.webp"`;
  assert.equal(localPloyAssets().transform(code, "/site/node_modules/pkg/index.js"), null);
});
