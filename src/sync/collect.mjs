// @ts-check
/**
 * Find every Ploy storage-bucket file a project references, without touching
 * the network.
 *
 * Looks in src/ and public/ (skipping public/ploy-assets/) two ways:
 *   1. Full addresses: https://storage.googleapis.com/ployai/<uuid>/user/<file>
 *   2. A prefix held in a constant and joined in a template literal:
 *        const STORAGE = "https://storage.googleapis.com/ployai/<uuid>/user";
 *        `${STORAGE}/<file>`
 * Anything built another way is missed here; `mirror-check-assets` catches it
 * after the build for prerendered pages.
 */

import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { readTextFile, walkFiles } from "../files.mjs";
import { LOCAL_DIR, bucketAddress, bucketAddressRegex, bucketPrefixRegex } from "../pattern.mjs";

/**
 * @typedef {Map<string, { address: string; files: Set<string> }>} Wanted
 *   local filename -> the bucket address it comes from and the project files that use it
 */

/** @param {string} name */
function isSafeFilename(name) {
  return name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\");
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} root project root
 * @returns {Promise<{ wanted: Wanted; problems: string[] }>}
 */
export async function collectReferences(root) {
  const assetDir = join(root, "public", LOCAL_DIR);
  const scanRoots = [join(root, "src"), join(root, "public")];
  /** @type {Wanted} */
  const wanted = new Map();
  /** @type {string[]} */
  const problems = [];

  /** @param {string} file */
  const where = (file) => relative(root, file).split(sep).join("/");

  /** @param {string} uuid @param {string} rawName @param {string} file */
  function want(uuid, rawName, file) {
    const filename = decodeURIComponent(rawName);
    if (!isSafeFilename(filename)) {
      problems.push(`unsafe filename "${filename}" in ${where(file)}`);
      return;
    }
    const address = bucketAddress(uuid, rawName);
    const seen = wanted.get(filename);
    if (!seen) {
      wanted.set(filename, { address, files: new Set([where(file)]) });
    } else if (seen.address !== address) {
      problems.push(
        `two addresses map to ${LOCAL_DIR}/${filename}:\n    ${seen.address} (${[...seen.files].join(", ")})\n    ${address} (${where(file)})`,
      );
    } else {
      seen.files.add(where(file));
    }
  }

  for (const scanRoot of scanRoots) {
    if (!existsSync(scanRoot)) continue;
    for await (const file of walkFiles(scanRoot, assetDir)) {
      const text = await readTextFile(file);
      if (text === null) continue;

      for (const match of text.matchAll(bucketAddressRegex())) {
        want(match[1], match[2], file);
      }

      // A prefix stored on its own in a constant, then joined in template literals.
      for (const prefix of text.matchAll(bucketPrefixRegex())) {
        const after = text[prefix.index + prefix[0].length];
        if (after === "/") continue; // full address, handled above
        const before = text.slice(0, prefix.index);
        const declared = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]$/.exec(before);
        if (!declared) {
          problems.push(
            `bucket prefix without a filename in ${where(file)}, and not a simple constant; add its files by hand or simplify the source`,
          );
          continue;
        }
        const use = new RegExp(`\\$\\{${escapeRegExp(declared[1])}\\}/([^\\s"'\`()<>\\\\?#,$]+)`, "g");
        for (const match of text.matchAll(use)) {
          want(prefix[1], match[1], file);
        }
      }
    }
  }

  return { wanted, problems };
}
