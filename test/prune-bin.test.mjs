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

const MISSING_REFUSAL =
  "mirror-prune-assets: refusing. These referenced files are not in public/ploy-assets/, so the last sync did not finish or read a name wrong, and the list of unused files cannot be trusted. Nothing was deleted.\n";
const RUN_SYNC_FIRST = "Run node node_modules/mirror-tools/bin/mirror-sync-assets.mjs and fix what it reports first.\n";

test("refuses, in both modes, when a filename is cut short (it's.webp read as it)", async (t) => {
  const root = await makeProject(t, {
    "src/a.html": `<img src="${PREFIX}/it's.webp">`,
    "public/ploy-assets/it's.webp": "in use",
  });
  for (const args of [[], ["--delete"]]) {
    const run = runBin("mirror-prune-assets", root, args);
    assert.equal(run.status, 1, args.join(" "));
    assert.equal(run.stdout, "");
    assert.equal(run.stderr, `${MISSING_REFUSAL}  - it\n${RUN_SYNC_FIRST}`);
    assert.deepEqual(await assetsOf(root), ["it's.webp"]);
  }
});

test("refuses when a wanted file is simply not on disk", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `<img src="${PREFIX}/used.webp"><img src="${PREFIX}/new.webp">`,
    "public/ploy-assets/used.webp": "u",
    "public/ploy-assets/old.webp": "o",
  });
  const run = runBin("mirror-prune-assets", root, ["--delete"]);
  assert.equal(run.status, 1);
  assert.equal(run.stderr, `${MISSING_REFUSAL}  - new.webp\n${RUN_SYNC_FIRST}`);
  assert.deepEqual(await assetsOf(root), ["old.webp", "used.webp"]);
});

test("refuses when a wanted file is on disk only in another case", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `<img src="${PREFIX}/Hero.webp">`,
    "public/ploy-assets/hero.webp": "h",
    "public/ploy-assets/old.webp": "o",
  });
  const run = runBin("mirror-prune-assets", root, ["--delete"]);
  assert.equal(run.status, 1);
  assert.equal(run.stderr, `${MISSING_REFUSAL}  - Hero.webp (on disk as hero.webp)\n${RUN_SYNC_FIRST}`);
  assert.deepEqual(await assetsOf(root), ["hero.webp", "old.webp"]);
});
