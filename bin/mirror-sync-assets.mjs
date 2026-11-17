#!/usr/bin/env node
// @ts-check
/**
 * Download every Ploy storage-bucket file the site references into
 * public/ploy-assets/, and delete files there that nothing references any more.
 * When it cannot read every reference, it still downloads what it can but
 * deletes nothing, because a file it could not see a reference to may be in use.
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
const { added, kept, prune, problems: applyProblems } = await applySync(root, wanted, {
  prune: collectProblems.length === 0,
});
const problems = [...collectProblems, ...applyProblems];

/** @param {string} label @param {string[]} items */
const list = (label, items) =>
  console.log(`${label} (${items.length})${items.map((item) => `\n  ${item}`).join("")}`);
list("added", added);
switch (prune.status) {
  case "done":
    list("removed", prune.removed);
    break;
  case "skipped":
    console.log("removed (skipped: the sync could not read every reference, so nothing was deleted)");
    break;
}
list("kept", kept);

if (problems.length > 0) {
  console.error(`\nmirror-sync-assets failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exitCode = 1;
}
