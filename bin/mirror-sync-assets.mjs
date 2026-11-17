#!/usr/bin/env node
// @ts-check
/**
 * Download every Ploy storage-bucket file the site references into
 * public/ploy-assets/, and delete files there that nothing references any more.
 * Run it from the mirror's root folder. How references are found:
 * src/sync/collect.mjs.
 *
 * Exits non-zero if a download fails or the source has a reference it cannot
 * resolve (two addresses sharing a filename, an unsafe filename, or a prefix
 * that is not a simple constant).
 */

import { applySync } from "../src/sync/apply.mjs";
import { collectReferences } from "../src/sync/collect.mjs";

const root = process.cwd();
const { wanted, problems: collectProblems } = await collectReferences(root);
const { added, kept, removed, problems: applyProblems } = await applySync(root, wanted);
const problems = [...collectProblems, ...applyProblems];

/** @param {string} label @param {string[]} items */
const list = (label, items) =>
  console.log(`${label} (${items.length})${items.map((item) => `\n  ${item}`).join("")}`);
list("added", added);
list("removed", removed);
list("kept", kept);

if (problems.length > 0) {
  console.error(`\nmirror-sync-assets failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
