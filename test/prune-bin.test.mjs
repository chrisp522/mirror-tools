// Runs the mirror-prune-assets bin in temp projects. It never reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { PREFIX, makeProject, runBin } from "../testing/fixture.mjs";

/** @param {string} root */
const assetsOf = async (root) => (await readdir(join(root, "public", "ploy-assets"))).sort();

const cleanProject = {
  "src/a.astro": `<img src="${PREFIX}/used.webp">`,
  "public/ploy-assets/used.webp": "u",
  "public/ploy-assets/old.webp": "o",
  "public/ploy-assets/older.webp": "o",
  "public/ploy-assets/.gitkeep": "",
};

test("without a flag it lists what it would delete and deletes nothing", async (t) => {
  const root = await makeProject(t, cleanProject);
  const run = runBin("mirror-prune-assets", root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout,
    "would delete (2)\n  old.webp\n  older.webp\nThis was a dry run. Read the list, then run again with --delete to delete these files.\n",
  );
  assert.equal(run.stderr, "");
  assert.deepEqual(await assetsOf(root), [".gitkeep", "old.webp", "older.webp", "used.webp"]);
});

test("with nothing to delete it says so", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `<img src="${PREFIX}/used.webp">`,
    "public/ploy-assets/used.webp": "u",
  });
  const run = runBin("mirror-prune-assets", root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "would delete (0)\n");
});

test("with --delete it deletes exactly that list, never dotfiles or referenced files", async (t) => {
  const root = await makeProject(t, cleanProject);
  const run = runBin("mirror-prune-assets", root, ["--delete"]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "deleted (2)\n  old.webp\n  older.webp\n");
  assert.deepEqual(await assetsOf(root), [".gitkeep", "used.webp"]);
});

test("refuses, in both modes, when the sync could not read every reference", async (t) => {
  const root = await makeProject(t, {
    "src/a.ts": `const S = "${PREFIX}/";\nconst h = \`\${S}hero.webp\`;`,
    "public/ploy-assets/hero.webp": "in use",
  });
  for (const args of [[], ["--delete"]]) {
    const run = runBin("mirror-prune-assets", root, args);
    assert.equal(run.status, 1, args.join(" "));
    assert.equal(run.stdout, "");
    assert.match(
      run.stderr,
      /^mirror-prune-assets: refusing\. The source has references the sync could not read, so it cannot tell which files are unused\. Nothing was deleted\.\n  - bucket prefix followed by "\/" with no literal filename in src\/a\.ts on line 1/,
    );
    assert.deepEqual(await assetsOf(root), ["hero.webp"]);
  }
});

test("any other argument is an error with usage", async (t) => {
  const root = await makeProject(t, cleanProject);
  for (const args of [["--force"], ["--delete", "x"], ["delete"]]) {
    const run = runBin("mirror-prune-assets", root, args);
    assert.equal(run.status, 1, args.join(" "));
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /^mirror-prune-assets: unexpected argument/);
    assert.match(run.stderr, /Usage: mirror-prune-assets \[--delete\]/);
  }
  assert.deepEqual(await assetsOf(root), [".gitkeep", "old.webp", "older.webp", "used.webp"]);
});
