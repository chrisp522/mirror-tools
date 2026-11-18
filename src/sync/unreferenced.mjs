// @ts-check
/**
 * Which files in public/ploy-assets/ no reference the sync read points at.
 * Shared by the sync (which only reports them) and the prune command (which
 * can delete them). Dotfiles (.gitkeep, .DS_Store) are never listed. A file
 * matched by a reference that differs only in case counts as referenced, so a
 * case mismatch is never offered for deletion.
 *
 * There is no trustworthy list in two cases, each its own result:
 *   - unreadable: collection reported a problem, so a file with no readable
 *     reference may still be in use through a reference the sync could not read;
 *   - missing: a wanted file is not on disk under its exact name (it never
 *     downloaded, it is there only in another case, or the reader cut its name
 *     short, for example `it's.webp` read as `it`). The real file may then sit
 *     on disk under a name no reference matches.
 */

import { listAssetFiles } from "./assets.mjs";

/**
 * @typedef {{ status: "known"; files: string[] }
 *   | { status: "unreadable"; problems: string[] }
 *   | { status: "missing"; missing: string[] }} Unreferenced
 *   missing: each wanted name not on disk, with " (on disk as <name>)" when it is there in another case.
 */

/**
 * @param {string} root project root
 * @param {{ wanted: import("./collect.mjs").Wanted; problems: string[] }} collection from collectReferences
 * @returns {Promise<Unreferenced>}
 */
export async function findUnreferenced(root, { wanted, problems }) {
  if (problems.length > 0) return { status: "unreadable", problems };
  const present = await listAssetFiles(root);
  const exact = new Set(present);
  const byLowerCase = new Map(present.map((name) => [name.toLowerCase(), name]));
  const missing = [...wanted.keys()]
    .filter((name) => !exact.has(name))
    .sort()
    .map((name) => {
      const otherCase = byLowerCase.get(name.toLowerCase());
      return otherCase === undefined ? name : `${name} (on disk as ${otherCase})`;
    });
  if (missing.length > 0) return { status: "missing", missing };

  const referenced = new Set([...wanted.keys()].map((name) => name.toLowerCase()));
  const files = present
    .filter((name) => !name.startsWith(".") && !referenced.has(name.toLowerCase()))
    .sort();
  return { status: "known", files };
}
