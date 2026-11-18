// @ts-check
// Where a project's local copies live, and what is in that folder.
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_DIR } from "../pattern.mjs";

/**
 * public/ploy-assets/ under the project root.
 * @param {string} root
 */
export function assetDirOf(root) {
  return join(root, "public", LOCAL_DIR);
}

/**
 * Names of the regular files in public/ploy-assets/, dotfiles included, or []
 * when the folder does not exist.
 * @param {string} root
 */
export async function listAssetFiles(root) {
  const dir = assetDirOf(root);
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name);
}
