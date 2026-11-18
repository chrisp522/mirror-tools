// @ts-check
/**
 * Download the referenced files that public/ploy-assets/ does not have yet.
 * Never deletes anything.
 *
 * A file already present is kept as it is: bucket filenames carry a hash or
 * timestamp prefix, so a name is treated as one fixed file. A file present
 * under the same name in a different case is a problem, not a download: on a
 * case-insensitive disk the download would replace it, and on the host the two
 * names are different files.
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_DIR } from "../pattern.mjs";
import { assetDirOf, listAssetFiles } from "./assets.mjs";

/**
 * @param {string} root project root
 * @param {import("./collect.mjs").Wanted} wanted from collectReferences
 * @param {{ fetch?: (address: string) => Promise<Response> }} [options] fetch is replaceable for tests
 * @returns {Promise<{ added: string[]; kept: string[]; problems: string[] }>}
 */
export async function downloadMissing(root, wanted, { fetch = globalThis.fetch } = {}) {
  const assetDir = assetDirOf(root);
  await mkdir(assetDir, { recursive: true });
  const present = await listAssetFiles(root);
  const exact = new Set(present);
  /** @type {Map<string, string>} lower-case name -> name on disk */
  const byLowerCase = new Map(present.map((name) => [name.toLowerCase(), name]));

  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const problems = [];

  for (const [filename, { address }] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
    if (exact.has(filename)) {
      kept.push(filename);
      continue;
    }
    const otherCase = byLowerCase.get(filename.toLowerCase());
    if (otherCase !== undefined) {
      problems.push(
        `${LOCAL_DIR}/${filename} is referenced, but ${LOCAL_DIR}/${otherCase} is on disk. Names that differ only in case are one file on a case-insensitive disk and two on the host; rename the copy or fix the reference`,
      );
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

  return { added, kept, problems };
}
