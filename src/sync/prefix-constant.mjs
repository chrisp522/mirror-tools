// @ts-check
/**
 * Reads a bucket prefix held on its own in a constant and every use of that
 * constant in the same file.
 *
 * The sync can only vouch for a constant whose every use it has seen, so the
 * rule is strict. The constant is read cleanly only when:
 *   - it is declared as `const|let|var NAME = "<prefix>"` and not exported;
 *   - every other mention of NAME in the file is `${NAME}/<literal filename>`;
 *   - there is at least one such use.
 * Anything else is a problem: an exported constant may be used in files the
 * sync does not follow, and a use in another form (`NAME + "/x.webp"`,
 * `${NAME}/${name}`) is a reference it has not read. A false problem stops the
 * prune and fails the run loudly; a missed reference would delete a file in use.
 */
import { readLiteralFilename } from "./literal-filename.mjs";

/**
 * @typedef {{ kind: "not-a-constant" }
 *   | { kind: "constant"; name: string; filenames: string[]; reason: string | null }} PrefixConstant
 *   filenames: literal filenames (as written) from the readable uses.
 *   reason: why the sync cannot vouch for every use, or null.
 */

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @param {string} text @param {number} index */
function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * @param {string} text the whole file
 * @param {number} prefixIndex where the prefix-only string literal's prefix starts
 * @returns {PrefixConstant}
 */
export function readPrefixConstant(text, prefixIndex) {
  const declared = /(?<![\w$])(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]$/d.exec(
    text.slice(0, prefixIndex),
  );
  if (!declared?.indices?.[2]) return { kind: "not-a-constant" };
  const name = declared[2];
  const declarationIndex = declared.indices[2][0];

  /** @type {string[]} */
  const filenames = [];
  /** @type {number | null} */
  let firstUnreadable = null;
  const mention = new RegExp(`(?<![\\w$.])${escapeRegExp(name)}(?![\\w$])`, "g");
  for (const match of text.matchAll(mention)) {
    if (match.index === declarationIndex) continue;
    const end = match.index + name.length;
    const wrapped = text.slice(match.index - 2, match.index) === "${" && text.slice(end, end + 2) === "}/";
    const filename = wrapped ? readLiteralFilename(text, end + 2) : null;
    if (filename?.status === "ok") filenames.push(filename.raw);
    else firstUnreadable ??= match.index;
  }

  /** @type {string | null} */
  let reason = null;
  if (declared[1]) reason = "is exported, so it may be used in files the sync does not follow";
  else if (firstUnreadable !== null) {
    reason = `has a use on line ${lineAt(text, firstUnreadable)} that is not \`\${${name}}/<filename>\``;
  } else if (filenames.length === 0) reason = "has no use the sync can read";

  return { kind: "constant", name, filenames, reason };
}
