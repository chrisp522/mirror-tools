// @ts-check
/**
 * Which files in public/ploy-assets/ no reference the sync read points at.
 * Shared by the sync (which only reports them) and the prune command (which
 * can delete them). Dotfiles (.gitkeep, .DS_Store) are never listed. A file
 * matched by a reference that differs only in case counts as referenced, so a
 * case mismatch is never offered for deletion.
 *
 * When collection reported a problem, the answer is unknown: a file with no
 * readable reference may still be in use through a reference the sync could
 * not read.
 */

import { listAssetFiles } from "./assets.mjs";

/**
 * @typedef {{ status: "known"; files: string[] } | { status: "unknown"; problems: string[] }} Unreferenced
 */

/**
 * @param {string} root project root
 * @param {{ wanted: import("./collect.mjs").Wanted; problems: string[] }} collection from collectReferences
 * @returns {Promise<Unreferenced>}
 */
export async function findUnreferenced(root, { wanted, problems }) {
  if (problems.length > 0) return { status: "unknown", problems };
  const referenced = new Set([...wanted.keys()].map((name) => name.toLowerCase()));
  const files = (await listAssetFiles(root))
    .filter((name) => !name.startsWith(".") && !referenced.has(name.toLowerCase()))
    .sort();
  return { status: "known", files };
}
