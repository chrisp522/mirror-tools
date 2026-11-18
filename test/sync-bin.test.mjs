// Runs the mirror-sync-assets bin in temp projects. Every referenced file is
// already present, so the bin never reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { OTHER_PREFIX, PREFIX, makeProject, runBin } from "../testing/fixture.mjs";

test("works from the current directory: keeps used files and lists unused ones without deleting them", async (t) => {
  const root = await makeProject(t, {
    "src/pages/index.astro": `<img src="${PREFIX}/a.webp">`,
    "src/data/images.ts": `const STORAGE = "${PREFIX}";\nexport const b = \`\${STORAGE}/b.webp\`;`,
    "public/ploy-assets/a.webp": "a",
    "public/ploy-assets/b.webp": "b",
    "public/ploy-assets/old.webp": "old",
  });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    "added (0)\nkept (2)\n  a.webp\n  b.webp\nnot referenced (left in place) (1)\n  old.webp\n" +
      "To review and delete them: node node_modules/mirror-tools/bin/mirror-prune-assets.mjs\n",
  );
  assert.equal(run.stderr, "");
  assert.deepEqual((await readdir(join(root, "public", "ploy-assets"))).sort(), ["a.webp", "b.webp", "old.webp"]);
});

test("exits non-zero and names the problem on a filename collision", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `"${PREFIX}/clash.webp"`,
    "src/b.astro": `"${OTHER_PREFIX}/clash.webp"`,
    "public/ploy-assets/clash.webp": "x",
  });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /mirror-sync-assets failed:\n  - two addresses map to ploy-assets\/clash\.webp:/);
});

test("exits non-zero on a prefix that is not a simple constant", async (t) => {
  const root = await makeProject(t, { "src/a.ts": `export default { base: "${PREFIX}" };` });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /bucket prefix without a filename in src\/a\.ts, and not a simple constant/);
});

test("a source filename that cannot be decoded does not crash the sync", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `"${PREFIX}/100%.webp"`,
    "public/ploy-assets/100%.webp": "x",
  });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "added (0)\nkept (1)\n  100%.webp\nnot referenced (left in place) (0)\n");
});

test("does not claim to know which files are unused when it cannot read every reference", async (t) => {
  const root = await makeProject(t, {
    "src/a.ts": `export default { base: "${PREFIX}" };\nconst hero = "/hero.webp";`,
    "public/ploy-assets/hero.webp": "committed copy",
  });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 1);
  assert.equal(
    run.stdout,
    "added (0)\nkept (0)\nnot referenced: unknown, because the sync could not read every reference\n",
  );
  assert.deepEqual(await readdir(join(root, "public", "ploy-assets")), ["hero.webp"]);
});

test("keeps committed copies when a prefix constant is used where the sync cannot follow it", async (t) => {
  const root = await makeProject(t, {
    "src/config.ts": `export const STORAGE = "${PREFIX}";`,
    "src/Hero.astro": 'import { STORAGE } from "./config";\nconst a = `${STORAGE}/hero.webp`;',
    "src/Logo.ts": `const B = "${PREFIX}";\nconst b = B + "/logo.webp";`,
    "public/ploy-assets/hero.webp": "h",
    "public/ploy-assets/logo.webp": "l",
  });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /not referenced: unknown/);
  assert.match(run.stderr, /prefix constant STORAGE in src\/config\.ts is exported/);
  assert.match(run.stderr, /prefix constant B in src\/Logo\.ts has a use on line 2/);
  assert.deepEqual((await readdir(join(root, "public", "ploy-assets"))).sort(), ["hero.webp", "logo.webp"]);
});

// Trailing-slash forms from a review: each must be a problem (exit 1) and must
// leave the committed copy in place.
const trailingSlashCases = {
  "const plus template": { "src/a.ts": `const S = "${PREFIX}/";\nconst h = \`\${S}hero.webp\`;` },
  "const plus +": { "src/a.ts": `const S = "${PREFIX}/";\nconst h = S + "hero.webp";` },
  "literal plus +": { "src/a.ts": `const h = "${PREFIX}/" + "hero.webp";` },
  "new URL": { "src/a.ts": `const h = new URL("hero.webp", "${PREFIX}/").href;` },
  object: { "src/cfg.ts": `export default { base: "${PREFIX}/" };` },
  JSON: { "src/cfg.json": `{ "base": "${PREFIX}/", "hero": "hero.webp" }` },
};
for (const [name, files] of Object.entries(trailingSlashCases)) {
  test(`a prefix with a trailing slash and no filename is a problem: ${name}`, async (t) => {
    const root = await makeProject(t, { ...files, "public/ploy-assets/hero.webp": "in use" });
    const run = runBin("mirror-sync-assets", root);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /bucket prefix followed by "\/" with no literal filename in src\/[a-z]+\.(ts|json) on line 1/);
    assert.deepEqual(await readdir(join(root, "public", "ploy-assets")), ["hero.webp"]);
  });
}
