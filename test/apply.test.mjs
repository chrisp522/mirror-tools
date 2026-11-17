import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { applySync } from "../src/sync/apply.mjs";
import { PREFIX, makeProject } from "../testing/fixture.mjs";

/** @param {string[]} names */
const wantedOf = (names) =>
  new Map(names.map((name) => [name, { address: `${PREFIX}/${encodeURIComponent(name)}`, files: new Set(["src/a.astro"]) }]));

/**
 * A stand-in for fetch that serves the given bodies by address and records calls.
 * @param {Record<string, string | number | Error>} routes body, HTTP status, or an error to throw
 */
function fakeFetch(routes) {
  /** @type {string[]} */
  const calls = [];
  /** @param {string} address */
  const fetch = async (address) => {
    calls.push(address);
    const route = routes[address];
    if (route instanceof Error) throw route;
    if (typeof route === "number") return new Response("nope", { status: route });
    if (route === undefined) return new Response("missing", { status: 404 });
    return new Response(route, { status: 200 });
  };
  return { fetch, calls };
}

test("downloads missing files, keeps present ones, prunes unreferenced ones", async (t) => {
  const root = await makeProject(t, {
    "public/ploy-assets/kept.webp": "old bytes",
    "public/ploy-assets/stale.webp": "stale",
    "public/ploy-assets/.gitkeep": "",
  });
  const { fetch, calls } = fakeFetch({ [`${PREFIX}/new.webp`]: "new bytes" });
  const result = await applySync(root, wantedOf(["kept.webp", "new.webp"]), { fetch, prune: true });

  assert.deepEqual(result, {
    added: ["new.webp (9 bytes)"],
    kept: ["kept.webp"],
    prune: { status: "done", removed: ["stale.webp"] },
    problems: [],
  });
  assert.deepEqual(calls, [`${PREFIX}/new.webp`]);
  const dir = join(root, "public", "ploy-assets");
  assert.deepEqual((await readdir(dir)).sort(), [".gitkeep", "kept.webp", "new.webp"]);
  assert.equal(await readFile(join(dir, "kept.webp"), "utf8"), "old bytes");
  assert.equal(await readFile(join(dir, "new.webp"), "utf8"), "new bytes");
});

test("creates public/ploy-assets/ when it does not exist", async (t) => {
  const root = await makeProject(t, { "src/a.astro": "" });
  const { fetch } = fakeFetch({ [`${PREFIX}/a.webp`]: "a" });
  const result = await applySync(root, wantedOf(["a.webp"]), { fetch, prune: true });
  assert.deepEqual(result.added, ["a.webp (1 bytes)"]);
  assert.ok(existsSync(join(root, "public", "ploy-assets", "a.webp")));
});

test("saves a percent-encoded address under its decoded name", async (t) => {
  const root = await makeProject(t, { "src/a.astro": "" });
  const { fetch, calls } = fakeFetch({ [`${PREFIX}/my%20image.webp`]: "x" });
  await applySync(root, wantedOf(["my image.webp"]), { fetch, prune: true });
  assert.deepEqual(calls, [`${PREFIX}/my%20image.webp`]);
  assert.ok(existsSync(join(root, "public", "ploy-assets", "my image.webp")));
});

test("a failed download is a problem and leaves no file behind", async (t) => {
  const root = await makeProject(t, { "src/a.astro": "" });
  const { fetch } = fakeFetch({
    [`${PREFIX}/gone.webp`]: 404,
    [`${PREFIX}/offline.webp`]: new Error("network down"),
    [`${PREFIX}/ok.webp`]: "ok",
  });
  const result = await applySync(root, wantedOf(["gone.webp", "offline.webp", "ok.webp"]), { fetch, prune: true });
  assert.deepEqual(result.added, ["ok.webp (2 bytes)"]);
  assert.deepEqual(result.problems, [
    `download failed: ${PREFIX}/gone.webp: HTTP 404`,
    `download failed: ${PREFIX}/offline.webp: network down`,
  ]);
  assert.deepEqual(await readdir(join(root, "public", "ploy-assets")), ["ok.webp"]);
});

test("lists are sorted by filename", async (t) => {
  const root = await makeProject(t, {
    "public/ploy-assets/b.webp": "",
    "public/ploy-assets/a.webp": "",
    "public/ploy-assets/z-old.webp": "",
    "public/ploy-assets/c-old.webp": "",
  });
  const { fetch } = fakeFetch({});
  const result = await applySync(root, wantedOf(["b.webp", "a.webp"]), { fetch, prune: true });
  assert.deepEqual(result.kept, ["a.webp", "b.webp"]);
  assert.deepEqual(result.prune, { status: "done", removed: ["c-old.webp", "z-old.webp"] });
});

test("a name that cannot be decoded downloads from the address as written and saves under that name", async (t) => {
  const root = await makeProject(t, { "src/a.astro": "" });
  const address = `${PREFIX}/100%.webp`;
  const { fetch, calls } = fakeFetch({ [address]: "x" });
  const wanted = new Map([["100%.webp", { address, files: new Set(["src/a.astro"]) }]]);
  const result = await applySync(root, wanted, { fetch, prune: true });
  assert.deepEqual(calls, [address]);
  assert.deepEqual(result.added, ["100%.webp (1 bytes)"]);
  assert.ok(existsSync(join(root, "public", "ploy-assets", "100%.webp")));
});

test("with prune off, downloads what it can and deletes nothing", async (t) => {
  const root = await makeProject(t, {
    "public/ploy-assets/kept.webp": "k",
    "public/ploy-assets/unreferenced.webp": "u",
  });
  const { fetch } = fakeFetch({ [`${PREFIX}/new.webp`]: "n" });
  const result = await applySync(root, wantedOf(["kept.webp", "new.webp"]), { fetch, prune: false });
  assert.deepEqual(result, {
    added: ["new.webp (1 bytes)"],
    kept: ["kept.webp"],
    prune: { status: "skipped" },
    problems: [],
  });
  assert.deepEqual((await readdir(join(root, "public", "ploy-assets"))).sort(), ["kept.webp", "new.webp", "unreferenced.webp"]);
});
