// @ts-check
/**
 * Make public/ploy-assets/ hold exactly the files a project references:
 * download the missing ones and, when `prune` is on, delete the ones nothing
 * references any more. The caller turns the prune off when it could not read
 * every reference, so committed copies of unread references are not deleted.
 *
 * Files already present are kept as they are: bucket filenames carry a hash or
 * timestamp prefix, so a name is treated as one fixed file.
 */

import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_DIR } from "../pattern.mjs";

/** @typedef {{ status: "done"; removed: string[] } | { status: "skipped" }} PruneResult */

/**
 * @param {string} root project root
 * @param {import("./collect.mjs").Wanted} wanted from collectReferences
 * @param {{ prune: boolean; fetch?: (address: string) => Promise<Response> }} options fetch is replaceable for tests
 * @returns {Promise<{ added: string[]; kept: string[]; prune: PruneResult; problems: string[] }>}
 */
export async function applySync(root, wanted, { prune, fetch = globalThis.fetch }) {
  const assetDir = join(root, "public", LOCAL_DIR);
  await mkdir(assetDir, { recursive: true });
  const present = new Set(
    (await readdir(assetDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );

  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const problems = [];

  for (const [filename, { address }] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
    if (present.has(filename)) {
      kept.push(filename);
      continue;
    }
    try {
      const response = await fetch(address);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      const target = join(assetDir, filename);
      await writeFile(`${target}.part`, body);
      await rename(`${target}.part`, target);
      added.push(`${filename} (${body.length} bytes)`);
    } catch (error) {
      problems.push(`download failed: ${address}: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (!prune) return { added, kept, prune: { status: "skipped" }, problems };

  /** @type {string[]} */
  const removed = [];
  for (const filename of [...present].sort()) {
    // A dotfile nothing references (.gitkeep, .DS_Store) is not ours to delete.
    if (wanted.has(filename) || filename.startsWith(".")) continue;
    await rm(join(assetDir, filename));
    removed.push(filename);
  }
  return { added, kept, prune: { status: "done", removed }, problems };
}
