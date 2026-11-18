// The .d.mts files are written by hand (no build step), so nothing keeps them
// in step with the code. This test does: for every entry in package.json
// "exports", the names exported by the module and by its declaration file must
// match. A function added to a module without a declaration (or a declaration
// left behind after a removal) fails here instead of in a consumer's type check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

/** @param {string} source */
function declaredNames(source) {
  const pattern = /^export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type)\s+([A-Za-z_$][\w$]*)/gm;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

/** @param {string} source */
function typeOnlyNames(source) {
  const pattern = /^export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/gm;
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

for (const [subpath, target] of Object.entries(pkg.exports)) {
  test(`${subpath}: declaration exports match the module`, async () => {
    assert.equal(typeof target, "object", `${subpath} has no "types" condition`);
    assert.equal(Object.keys(target)[0], "types", `${subpath}: "types" must be the first condition`);
    const declarations = await readFile(join(root, target.types), "utf8");
    const typeOnly = typeOnlyNames(declarations);
    const declared = declaredNames(declarations).filter((name) => !typeOnly.has(name)).sort();
    const module = await import(pathToFileURL(join(root, target.default)).href);
    assert.deepEqual(declared, Object.keys(module).sort());
  });
}
