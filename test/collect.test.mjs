import { test } from "node:test";
import assert from "node:assert/strict";
import { collectReferences } from "../src/sync/collect.mjs";
import { OTHER_PREFIX, PREFIX, makeProject } from "../testing/fixture.mjs";

/** @param {Map<string, { address: string; files: Set<string> }>} wanted */
const plain = (wanted) =>
  Object.fromEntries([...wanted].map(([name, { address, files }]) => [name, { address, files: [...files].sort() }]));

test("finds full addresses in src/ and public/", async (t) => {
  const root = await makeProject(t, {
    "src/pages/index.astro": `<img src="${PREFIX}/hero.webp"><img src="${PREFIX}/logo.png">`,
    "src/styles/theme.css": `@font-face{src:url('${PREFIX}/font.woff2')}`,
    "public/site.webmanifest": `{"icons":[{"src":"${PREFIX}/icon.png"}]}`,
    "other/ignored.txt": `${PREFIX}/not-scanned.webp`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(plain(wanted), {
    "hero.webp": { address: `${PREFIX}/hero.webp`, files: ["src/pages/index.astro"] },
    "logo.png": { address: `${PREFIX}/logo.png`, files: ["src/pages/index.astro"] },
    "font.woff2": { address: `${PREFIX}/font.woff2`, files: ["src/styles/theme.css"] },
    "icon.png": { address: `${PREFIX}/icon.png`, files: ["public/site.webmanifest"] },
  });
});

test("the same address in two files is one file with both sources", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `"${PREFIX}/same.webp"`,
    "src/b.astro": `"${PREFIX}/same.webp"`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(plain(wanted), {
    "same.webp": { address: `${PREFIX}/same.webp`, files: ["src/a.astro", "src/b.astro"] },
  });
});

test("finds files joined to a prefix held in a constant", async (t) => {
  const root = await makeProject(t, {
    "src/data/images.ts": [
      `const STORAGE = "${PREFIX}";`,
      "export const a = `${STORAGE}/a.webp`;",
      "export const b = `${STORAGE}/b-2x.webp`;",
      "export const c = `${OTHER}/not-ours.webp`;",
    ].join("\n"),
    "src/data/more.ts": `export let $base = '${PREFIX}';\nconst x = \`\${$base}/c.webp\`;`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(plain(wanted), {
    "a.webp": { address: `${PREFIX}/a.webp`, files: ["src/data/images.ts"] },
    "b-2x.webp": { address: `${PREFIX}/b-2x.webp`, files: ["src/data/images.ts"] },
    "c.webp": { address: `${PREFIX}/c.webp`, files: ["src/data/more.ts"] },
  });
});

test("decodes percent-encoded filenames", async (t) => {
  const root = await makeProject(t, { "src/a.astro": `"${PREFIX}/my%20image.webp"` });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(plain(wanted), {
    "my image.webp": { address: `${PREFIX}/my%20image.webp`, files: ["src/a.astro"] },
  });
});

test("reports two addresses that map to the same local filename", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `"${PREFIX}/clash.webp"`,
    "src/b.astro": `"${OTHER_PREFIX}/clash.webp"`,
  });
  const { problems } = await collectReferences(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^two addresses map to ploy-assets\/clash\.webp:/);
  assert.ok(problems[0].includes(`${PREFIX}/clash.webp (src/a.astro)`));
  assert.ok(problems[0].includes(`${OTHER_PREFIX}/clash.webp (src/b.astro)`));
});

test("reports a prefix that is not a simple constant", async (t) => {
  const root = await makeProject(t, {
    "src/a.ts": `export const config = { base: "${PREFIX}" };`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.equal(wanted.size, 0);
  assert.deepEqual(problems, [
    "bucket prefix without a filename in src/a.ts, and not a simple constant. The sync reads only full addresses and a prefix held in a simple const, let or var joined in a template literal; see \"What the sync can read\" in the mirror-tools README",
  ]);
});

test("reports an unsafe filename", async (t) => {
  const root = await makeProject(t, { "src/a.astro": `"${PREFIX}/..%2Fescape.webp"` });
  const { wanted, problems } = await collectReferences(root);
  assert.equal(wanted.size, 0);
  assert.deepEqual(problems, ['unsafe filename "../escape.webp" in src/a.astro']);
});

test("skips public/ploy-assets/ and binary files", async (t) => {
  const root = await makeProject(t, {
    "public/ploy-assets/notes.txt": `"${PREFIX}/inside-copies.webp"`,
    "public/image.bin": Buffer.concat([Buffer.from([0]), Buffer.from(`"${PREFIX}/in-binary.webp"`)]),
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.equal(wanted.size, 0);
});

test("a project with no src/ or public/ has nothing to collect", async (t) => {
  const root = await makeProject(t, { "README.md": "x" });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.equal(wanted.size, 0);
});

test("a filename that cannot be decoded is kept as written, not a crash", async (t) => {
  const root = await makeProject(t, { "src/a.astro": `"${PREFIX}/100%.webp"` });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(plain(wanted), {
    "100%.webp": { address: `${PREFIX}/100%.webp`, files: ["src/a.astro"] },
  });
});
