import { test } from "node:test";
import assert from "node:assert/strict";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { checkBuildOutput } from "../src/check.mjs";
import { PREFIX, makeProject, runBin } from "../testing/fixture.mjs";

const SHIPPED = ".vercel/output/static/ploy-assets";

/** A build output that uses two shipped files, one of them from a function bundle. */
const goodBuild = {
  [`${SHIPPED}/a.webp`]: Buffer.from([0, 1, 2]),
  [`${SHIPPED}/my image.webp`]: Buffer.from([0, 1, 2]),
  ".vercel/output/static/index.html": `<img src="/ploy-assets/a.webp"><img src="/ploy-assets/my%20image.webp">`,
  ".vercel/output/functions/_render.func/chunk.mjs": `const S = "/ploy-assets"; const x = "/ploy-assets/a.webp";`,
  ".vercel/output/static/logo.bin": Buffer.from([0, 0, 0]),
};

test("ok when every reference is shipped and no bucket address is left", async (t) => {
  const root = await makeProject(t, goodBuild);
  assert.deepEqual(await checkBuildOutput(root), { status: "ok", shippedCount: 2 });

  const run = runBin("mirror-check-assets", root);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "mirror-check-assets: ok (2 files in .vercel/output/static/ploy-assets, no bucket addresses)\n");
});

test("fails on a leftover bucket address and counts hits per file", async (t) => {
  const root = await makeProject(t, {
    ...goodBuild,
    ".vercel/output/static/about/index.html": `<img src="${PREFIX}/x.webp"><img src="${PREFIX}/y.webp">`,
  });
  const result = await checkBuildOutput(root);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.status === "failed" && [...result.bucketHits], [
    [".vercel/output/static/about/index.html", 2],
  ]);
  assert.equal(result.status === "failed" && result.missing.size, 0);

  const run = runBin("mirror-check-assets", root);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^mirror-check-assets: FAILED\n/);
  assert.match(run.stderr, /Build output still points at storage\.googleapis\.com\/ployai:\n  \.vercel\/output\/static\/about\/index\.html \(2\)/);
  assert.match(run.stderr, /Fix: run `npx mirror-sync-assets`/);
});

test("fails when a referenced file was not shipped", async (t) => {
  const root = await makeProject(t, goodBuild);
  await rename(join(root, ".vercel/output/static/ploy-assets/a.webp"), join(root, "moved-away.webp"));
  const result = await checkBuildOutput(root);
  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.status === "failed" && [...result.missing].map(([name, files]) => [name, [...files].sort()]),
    [["a.webp", [".vercel/output/functions/_render.func/chunk.mjs", ".vercel/output/static/index.html"]]],
  );

  const run = runBin("mirror-check-assets", root);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Build output references \/ploy-assets\/ files that were not shipped:\n  a\.webp  <- /);
});

test("fails when there is no build output", async (t) => {
  const root = await makeProject(t, { "README.md": "x" });
  assert.deepEqual(await checkBuildOutput(root), { status: "no-output" });

  const run = runBin("mirror-check-assets", root);
  assert.equal(run.status, 1);
  assert.equal(run.stderr, "mirror-check-assets: .vercel/output not found. Run the Vercel build first.\n");
});

test("a reference with a bad percent sequence is looked up as written", async (t) => {
  const root = await makeProject(t, {
    [`${SHIPPED}/100%.webp`]: Buffer.from([0]),
    ".vercel/output/static/index.html": `<img src="/ploy-assets/100%.webp">`,
  });
  assert.deepEqual(await checkBuildOutput(root), { status: "ok", shippedCount: 1 });
});
