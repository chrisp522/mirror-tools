// @ts-check
/**
 * Make public/ploy-assets/ hold exactly the files a project references:
 * download the missing ones and delete the ones nothing references any more.
 *
 * Files already present are kept as they are: bucket filenames carry a hash or
 * timestamp prefix, so a name is treated as one fixed file.
 */

import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_DIR } from "../pattern.mjs";

/**
 * @param {string} root project root
 * @param {import("./collect.mjs").Wanted} wanted from collectReferences
 * @param {{ fetch?: (address: string) => Promise<Response> }} [options] fetch is replaceable for tests
 * @returns {Promise<{ added: string[]; kept: string[]; removed: string[]; problems: string[] }>}
 */
export async function applySync(root, wanted, { fetch = globalThis.fetch } = {}) {
  const assetDir = join(root, "public", LOCAL_DIR);
  await mkdir(assetDir, { recursive: true });
  const present = new Set(
    (await readdir(assetDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name),
  );

  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const removed = [];
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

  for (const filename of [...present].sort()) {
    if (wanted.has(filename)) continue;
    await rm(join(assetDir, filename));
    removed.push(filename);
  }

  return { added, kept, removed, problems };
}
