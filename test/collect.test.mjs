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
    "src/data/more.ts": `let $base = '${PREFIX}';\nconst x = \`\${$base}/c.webp\`;`,
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
    "bucket prefix without a filename in src/a.ts, and not a simple constant. The sync reads only full addresses and a prefix held in a simple const, let or var whose every use is `${NAME}/<filename>`; see \"What the sync can read\" in the mirror-tools README",
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

/** The problem text for a prefix constant the sync cannot fully read. */
const constantProblem = (name, file, reason) =>
  `prefix constant ${name} in ${file} ${reason}. The sync reads a prefix constant only when it is not exported and every use in the same file is \`\${${name}}/<filename>\` with a literal filename; see "What the sync can read" in the mirror-tools README`;

test("the readable constant form passes clean: not exported, several literal uses", async (t) => {
  const root = await makeProject(t, {
    "src/shared.ts": [
      'export const STORE_URL = "https://example.com/app?pt=1&ct=x";',
      `const STORAGE = "${PREFIX}";`,
      "/** Hero image. */",
      "export const HERO = `${STORAGE}/hero-1.webp`;",
      "export const WALL = `${STORAGE}/wall.webp`;",
      "export const SHOT = `${STORAGE}/shot.webp`;",
    ].join("\n"),
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual([...wanted.keys()].sort(), ["hero-1.webp", "shot.webp", "wall.webp"]);
});

test("an exported prefix constant used only from another file is a problem", async (t) => {
  const root = await makeProject(t, {
    "src/config.ts": `export const STORAGE = "${PREFIX}";`,
    "src/Hero.astro": 'import { STORAGE } from "./config";\nconst a = `${STORAGE}/hero.webp`;',
  });
  const { wanted, problems } = await collectReferences(root);
  assert.equal(wanted.size, 0);
  assert.deepEqual(problems, [
    constantProblem("STORAGE", "src/config.ts", "is exported, so it may be used in files the sync does not follow"),
  ]);
});

test("an exported prefix constant with readable uses still is a problem, and its readable files are wanted", async (t) => {
  const root = await makeProject(t, {
    "src/config.ts": `export const STORAGE = "${PREFIX}";\nexport const HERO = \`\${STORAGE}/hero.webp\`;`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual([...wanted.keys()], ["hero.webp"]);
  assert.deepEqual(problems, [
    constantProblem("STORAGE", "src/config.ts", "is exported, so it may be used in files the sync does not follow"),
  ]);
});

test("a prefix constant exported in a separate statement is a problem", async (t) => {
  const root = await makeProject(t, {
    "src/config.ts": `const STORAGE = "${PREFIX}";\nconst HERO = \`\${STORAGE}/hero.webp\`;\nexport { STORAGE, HERO };`,
  });
  const { problems } = await collectReferences(root);
  assert.deepEqual(problems, [
    constantProblem("STORAGE", "src/config.ts", "has a use on line 3 that is not `${STORAGE}/<filename>`"),
  ]);
});

test("a prefix constant joined with + is a problem", async (t) => {
  const root = await makeProject(t, {
    "src/Logo.ts": `const B = "${PREFIX}";\nconst b = B + "/logo.webp";`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.equal(wanted.size, 0);
  assert.deepEqual(problems, [constantProblem("B", "src/Logo.ts", "has a use on line 2 that is not `${B}/<filename>`")]);
});

test("a prefix constant joined to a dynamic filename is a problem", async (t) => {
  const root = await makeProject(t, {
    "src/a.ts": `const S = "${PREFIX}";\nconst ok = \`\${S}/ok.webp\`;\nconst x = (name) => \`\${S}/\${name}\`;`,
    "src/b.ts": `const T = "${PREFIX}";\nconst y = (size) => \`\${T}/hero-\${size}.webp\`;`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual([...wanted.keys()], ["ok.webp"]);
  assert.deepEqual(problems, [
    constantProblem("S", "src/a.ts", "has a use on line 3 that is not `${S}/<filename>`"),
    constantProblem("T", "src/b.ts", "has a use on line 2 that is not `${T}/<filename>`"),
  ]);
});

test("a prefix constant with no use at all is a problem", async (t) => {
  const root = await makeProject(t, { "src/a.ts": `const UNUSED = "${PREFIX}";` });
  const { problems } = await collectReferences(root);
  assert.deepEqual(problems, [constantProblem("UNUSED", "src/a.ts", "has no use the sync can read")]);
});

test("a full address whose filename runs into a template expression is a problem", async (t) => {
  const root = await makeProject(t, { "src/a.ts": "const x = (n) => `" + PREFIX + "/hero-${n}.webp`;" });
  const { wanted, problems } = await collectReferences(root);
  assert.equal(wanted.size, 0);
  assert.deepEqual(problems, [
    `filename "hero-\${n}.webp" in src/a.ts is built from a template expression; the sync needs a literal filename`,
  ]);
});

test("an HTML-escaped quote ends a filename", async (t) => {
  const root = await makeProject(t, {
    "public/page.html": `<x-island props="{&quot;src&quot;:[0,&quot;${PREFIX}/hero.webp&quot;]}" alt='&#39;${PREFIX}/b.webp&#39;'>`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual([...wanted.keys()].sort(), ["b.webp", "hero.webp"]);
});

test("a filename that contains & is a problem, not a silently shortened name", async (t) => {
  const root = await makeProject(t, { "src/a.astro": `"${PREFIX}/salt&pepper.webp"` });
  const { wanted, problems } = await collectReferences(root);
  assert.equal(wanted.size, 0);
  assert.deepEqual(problems, [
    `filename "salt&pepper.webp" in src/a.astro contains "&", which the sync does not support`,
  ]);
});

test("a full address's filename stops at a query, fragment, comma or space", async (t) => {
  const root = await makeProject(t, {
    "src/a.astro": `"${PREFIX}/a.webp?w=10" "${PREFIX}/b.webp#top" srcset="${PREFIX}/c.webp 1x,${PREFIX}/d.webp 2x"`,
  });
  const { wanted, problems } = await collectReferences(root);
  assert.deepEqual(problems, []);
  assert.deepEqual([...wanted.keys()].sort(), ["a.webp", "b.webp", "c.webp", "d.webp"]);
});
