// @ts-check
// Reads the filename that follows a bucket prefix in source text, and says
// when it is not a plain literal the sync can download.
import { filenameAt, isEscapedQuoteAt } from "../pattern.mjs";

/**
 * @typedef {{ status: "ok"; raw: string }
 *   | { status: "empty" }
 *   | { status: "template"; raw: string }
 *   | { status: "ampersand"; raw: string }} LiteralFilename
 *   ok: a literal filename, as written.
 *   empty: no filename starts here.
 *   template: the name runs into a `${...}` expression, so it is built at run time.
 *   ampersand: the name continues past an "&" that is not an HTML-escaped quote.
 */

/**
 * @param {string} text
 * @param {number} start index of the first character after "<prefix>/"
 * @returns {LiteralFilename}
 */
export function readLiteralFilename(text, start) {
  const raw = filenameAt(text, start);
  if (raw === "") return { status: "empty" };
  if (raw.includes("${")) return { status: "template", raw };
  const end = start + raw.length;
  if (text[end] === "&" && !isEscapedQuoteAt(text, end)) {
    return { status: "ampersand", raw: `${raw}&${filenameAt(text, end + 1)}` };
  }
  return { status: "ok", raw };
}
