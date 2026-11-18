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
 *      (rules for the constant: prefix-constant.mjs)
 * Every match of the bucket prefix ends as a wanted file or a problem, never
 * silently dropped: a prefix the sync can see but not read (no literal filename
 * after it, a prefix that is not a simple constant, a filename built at run
 * time, an "&" in a name) is a problem. The source is read as text, so a
 * reference that does not contain the bucket prefix as written (for example a
 * prefix assembled from pieces) is not seen at all; the README lists these
 * limits.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { lineAt, projectPath, readTextFile, walkFiles } from "../files.mjs";
import { LOCAL_DIR, bucketAddress, bucketPrefixRegex, decodeFilename } from "../pattern.mjs";
import { assetDirOf } from "./assets.mjs";
import { readLiteralFilename } from "./literal-filename.mjs";
import { readPrefixConstant } from "./prefix-constant.mjs";

/**
 * @typedef {Map<string, { address: string; files: Set<string> }>} Wanted
 *   local filename -> the bucket address it comes from and the project files that use it
 */

/** @param {string} name */
function isSafeFilename(name) {
  return name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\");
}

/**
 * @param {string} root project root
 * @returns {Promise<{ wanted: Wanted; problems: string[] }>}
 */
export async function collectReferences(root) {
  const assetDir = assetDirOf(root);
  const scanRoots = [join(root, "src"), join(root, "public")];
  /** @type {Wanted} */
  const wanted = new Map();
  /** @type {Map<string, string>} lower-case filename -> wanted filename, for case-insensitive disks */
  const wantedByLowerCase = new Map();
  /** @type {string[]} */
  const problems = [];

  /** @param {string} file */
  const where = (file) => projectPath(root, file);

  /** @param {string} uuid @param {string} rawName @param {string} file */
  function want(uuid, rawName, file) {
    const filename = decodeFilename(rawName);
    if (!isSafeFilename(filename)) {
      problems.push(`unsafe filename "${filename}" in ${where(file)}`);
      return;
    }
    const address = bucketAddress(uuid, rawName);
    const seen = wanted.get(filename);
    const sameButCase = wantedByLowerCase.get(filename.toLowerCase());
    if (!seen && sameButCase !== undefined) {
      // Not added: downloading both would put one over the other on a case-insensitive disk.
      const other = /** @type {{ address: string; files: Set<string> }} */ (wanted.get(sameButCase));
      problems.push(
        `two addresses map to ${LOCAL_DIR}/${sameButCase} and ${LOCAL_DIR}/${filename}, which are one file on a case-insensitive disk:\n    ${other.address} (${[...other.files].join(", ")})\n    ${address} (${where(file)})`,
      );
    } else if (!seen) {
      wanted.set(filename, { address, files: new Set([where(file)]) });
      wantedByLowerCase.set(filename.toLowerCase(), filename);
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

      for (const prefix of text.matchAll(bucketPrefixRegex())) {
        const uuid = prefix[1];
        const end = prefix.index + prefix[0].length;

        // A full address: the prefix, "/", then a filename.
        if (text[end] === "/") {
          const filename = readLiteralFilename(text, end + 1);
          switch (filename.status) {
            case "ok":
              want(uuid, filename.raw, file);
              break;
            case "empty":
              problems.push(
                `bucket prefix followed by "/" with no literal filename in ${where(file)} on line ${lineAt(text, prefix.index)}. The sync reads a full address with a literal filename, or a prefix constant used as \`\${NAME}/<filename>\`; see "What the sync can read" in the mirror-tools README`,
              );
              break;
            case "template":
              problems.push(
                `filename "${filename.raw}" in ${where(file)} is built from a template expression; the sync needs a literal filename`,
              );
              break;
            case "ampersand":
              problems.push(`filename "${filename.raw}" in ${where(file)} contains "&", which the sync does not support`);
              break;
            default:
              throw new Error(`unknown filename status: ${JSON.stringify(filename)}`);
          }
          continue;
        }

        // A prefix on its own, which must be a constant the sync can follow.
        const constant = readPrefixConstant(text, prefix.index);
        switch (constant.kind) {
          case "not-a-constant":
            problems.push(
              `bucket prefix without a filename in ${where(file)}, and not a simple constant. The sync reads only full addresses and a prefix held in a simple const, let or var whose every use is \`\${NAME}/<filename>\`; see "What the sync can read" in the mirror-tools README`,
            );
            break;
          case "readable":
            for (const raw of constant.filenames) want(uuid, raw, file);
            break;
          case "unreadable":
            for (const raw of constant.filenames) want(uuid, raw, file);
            problems.push(
              `prefix constant ${constant.name} in ${where(file)} ${constant.reason}. The sync reads a prefix constant only when it is not exported and every use in the same file is \`\${${constant.name}}/<filename>\` with a literal filename; see "What the sync can read" in the mirror-tools README`,
            );
            break;
          default:
            throw new Error(`unknown prefix constant kind: ${JSON.stringify(constant)}`);
        }
      }
    }
  }

  return { wanted, problems };
}
