import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnreferenced } from "../src/sync/unreferenced.mjs";
import { PREFIX, makeProject } from "../testing/fixture.mjs";

/** @param {string[]} names */
const wantedOf = (names) =>
  new Map(names.map((name) => [name, { address: `${PREFIX}/${name}`, files: new Set(["src/a.astro"]) }]));

test("lists files no reference points at, sorted, never dotfiles", async (t) => {
  const root = await makeProject(t, {
    "public/ploy-assets/used.webp": "",
    "public/ploy-assets/z-old.webp": "",
    "public/ploy-assets/a-old.webp": "",
    "public/ploy-assets/.gitkeep": "",
    "public/ploy-assets/.DS_Store": "",
  });
  const result = await findUnreferenced(root, { wanted: wantedOf(["used.webp"]), problems: [] });
  assert.deepEqual(result, { status: "known", files: ["a-old.webp", "z-old.webp"] });
});

test("a file matched by a reference that differs only in case is not listed", async (t) => {
  const root = await makeProject(t, { "public/ploy-assets/hero.webp": "" });
  const result = await findUnreferenced(root, { wanted: wantedOf(["Hero.webp"]), problems: [] });
  assert.deepEqual(result, { status: "known", files: [] });
});

test("unknown when collection reported problems", async (t) => {
  const root = await makeProject(t, { "public/ploy-assets/old.webp": "" });
  const result = await findUnreferenced(root, { wanted: wantedOf([]), problems: ["something"] });
  assert.deepEqual(result, { status: "unknown", problems: ["something"] });
});

test("no public/ploy-assets/ folder means nothing is unreferenced", async (t) => {
  const root = await makeProject(t, { "src/a.astro": "" });
  assert.deepEqual(await findUnreferenced(root, { wanted: wantedOf([]), problems: [] }), { status: "known", files: [] });
});
