// @ts-check
/**
 * Inspect a Vercel build's output (.vercel/output) for two faults: a Ploy
 * storage-bucket address still in it, or a /ploy-assets/<file> reference to a
 * file the build did not ship.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { projectPath, readTextFile, walkFiles } from "./files.mjs";
import { BUCKET_HOST, LOCAL_DIR, decodeFilename, localReferenceRegex } from "./pattern.mjs";

/** Build output folder, relative to the project root, with "/" separators. */
export const OUTPUT_DIR = ".vercel/output";

/** Where the build ships the local copies, relative to the project root. */
export const SHIPPED_DIR = `${OUTPUT_DIR}/static/${LOCAL_DIR}`;

/**
 * @typedef {{ status: "no-output" }
 *   | { status: "ok"; shippedCount: number }
 *   | { status: "failed"; bucketHits: Map<string, number>; missing: Map<string, Set<string>> }} CheckResult
 *   bucketHits: output file -> number of bucket addresses in it.
 *   missing: filename not shipped -> output files that reference it.
 */

/**
 * @param {string} root project root
 * @returns {Promise<CheckResult>}
 */
export async function checkBuildOutput(root) {
  const outputDir = join(root, ...OUTPUT_DIR.split("/"));
  const shippedDir = join(root, ...SHIPPED_DIR.split("/"));
  if (!existsSync(outputDir)) return { status: "no-output" };

  const shipped = new Set(existsSync(shippedDir) ? await readdir(shippedDir) : []);
  /** @type {Map<string, number>} */
  const bucketHits = new Map();
  /** @type {Map<string, Set<string>>} */
  const missing = new Map();

  for await (const file of walkFiles(outputDir, shippedDir)) {
    const text = await readTextFile(file);
    if (text === null) continue;
    const where = projectPath(root, file);

    if (text.includes(BUCKET_HOST)) {
      bucketHits.set(where, text.split(BUCKET_HOST).length - 1);
    }

    for (const match of text.matchAll(localReferenceRegex())) {
      const filename = decodeFilename(match[1]);
      if (shipped.has(filename)) continue;
      const referencedBy = missing.get(filename) ?? new Set();
      referencedBy.add(where);
      missing.set(filename, referencedBy);
    }
  }

  if (bucketHits.size === 0 && missing.size === 0) return { status: "ok", shippedCount: shipped.size };
  return { status: "failed", bucketHits, missing };
}
