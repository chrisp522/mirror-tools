// Test helpers. Kept outside test/ so `node --test` does not run this file as a test.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const UUID = "00000000-0000-4000-8000-000000000000";
export const OTHER_UUID = "11111111-1111-4111-8111-111111111111";
export const PREFIX = `https://storage.googleapis.com/ployai/${UUID}/user`;
export const OTHER_PREFIX = `https://storage.googleapis.com/ployai/${OTHER_UUID}/user`;

/**
 * Create a temp project with the given files. Paths use "/" and are relative
 * to the project root. The folder is removed when the test ends.
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string | Buffer>} files
 */
export async function makeProject(t, files) {
  const root = await mkdtemp(join(tmpdir(), "mirror-tools-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

/**
 * Run one of the package's bins with the given working directory.
 * @param {string} name bin file name without extension
 * @param {string} cwd
 */
export function runBin(name, cwd) {
  const bin = fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url));
  return spawnSync(process.execPath, [bin], { cwd, encoding: "utf8" });
}
