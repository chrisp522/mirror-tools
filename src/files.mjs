// @ts-check
// Reading a project's files as text, shared by the sync and the check.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Every regular file under `dir`, depth first. Symlinks are skipped, and so is
 * the folder `skipDir` (for example the local asset copies).
 * @param {string} dir
 * @param {string} skipDir
 * @returns {AsyncGenerator<string>}
 */
export async function* walkFiles(dir, skipDir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (path === skipDir) continue;
    if (entry.isDirectory()) yield* walkFiles(path, skipDir);
    else if (entry.isFile()) yield path;
  }
}

/**
 * A file's contents as UTF-8 text, or null when it looks binary (a zero byte
 * in its first 8000 bytes).
 * @param {string} file
 */
export async function readTextFile(file) {
  const buffer = await readFile(file);
  if (buffer.subarray(0, 8000).includes(0)) return null;
  return buffer.toString("utf8");
}
