// Runs the mirror-sync-assets bin in temp projects. Every referenced file is
// already present, so the bin never reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { OTHER_PREFIX, PREFIX, makeProject, runBin } from "../testing/fixture.mjs";

test("works from the current directory: keeps used files, prunes unused ones", async (t) => {
  const root = await makeProject(t, {
    "src/pages/index.astro": `<img src="${PREFIX}/a.webp">`,
    "src/data/images.ts": `const STORAGE = "${PREFIX}";\nexport const b = \`\${STORAGE}/b.webp\`;`,
    "public/ploy-assets/a.webp": "a",
    "public/ploy-assets/b.webp": "b",
    "public/ploy-assets/old.webp": "old",
  });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "added (0)\nremoved (1)\n  old.webp\nkept (2)\n  a.webp\n  b.webp\n");
  assert.equal(run.stderr, "");
  assert.deepEqual((await readdir(join(root, "public", "ploy-assets"))).sort(), ["a.webp", "b.webp"]);
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
  assert.equal(run.stdout, "added (0)\nremoved (0)\nkept (1)\n  100%.webp\n");
});

test("does not prune when the source has a reference it cannot read", async (t) => {
  const root = await makeProject(t, {
    "src/a.ts": `export default { base: "${PREFIX}" };\nconst hero = "/hero.webp";`,
    "public/ploy-assets/hero.webp": "committed copy",
  });
  const run = runBin("mirror-sync-assets", root);
  assert.equal(run.status, 1);
  assert.equal(
    run.stdout,
    "added (0)\nremoved (skipped: the sync could not read every reference, so nothing was deleted)\nkept (0)\n",
  );
  assert.deepEqual(await readdir(join(root, "public", "ploy-assets")), ["hero.webp"]);
});
