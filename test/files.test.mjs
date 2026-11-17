import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { projectPath, readTextFile, walkFiles } from "../src/files.mjs";
import { makeProject } from "../testing/fixture.mjs";

test("walkFiles lists files under a folder and skips the given folder", async (t) => {
  const root = await makeProject(t, {
    "a.txt": "a",
    "sub/b.txt": "b",
    "sub/skip/c.txt": "c",
    "skip-not/d.txt": "d",
  });
  const found = [];
  for await (const file of walkFiles(root, join(root, "sub", "skip"))) {
    found.push(projectPath(root, file));
  }
  assert.deepEqual(found.sort(), ["a.txt", "skip-not/d.txt", "sub/b.txt"]);
});

test("readTextFile returns text, and null for a binary file", async (t) => {
  const root = await makeProject(t, {
    "a.txt": "hello",
    "b.bin": Buffer.from([1, 0, 2]),
  });
  assert.equal(await readTextFile(join(root, "a.txt")), "hello");
  assert.equal(await readTextFile(join(root, "b.bin")), null);
});

test("projectPath gives a path relative to the root with / separators", () => {
  const root = join("/", "site");
  assert.equal(projectPath(root, join(root, "src", "pages", "index.astro")), "src/pages/index.astro");
  assert.equal(projectPath(root, join(root, "a.txt")), "a.txt");
});
