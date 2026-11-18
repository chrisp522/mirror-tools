#!/usr/bin/env node
// @ts-check
/**
 * Download every Ploy storage-bucket file the site references into
 * public/ploy-assets/. Never deletes anything. Run it from the mirror's root
 * folder. How references are found: src/sync/collect.mjs.
 *
 * It also lists files in public/ploy-assets/ that no reference it read points
 * at, and leaves them in place; `mirror-prune-assets` is the separate, explicit
 * step that deletes them. When it could not read every reference, it says it
 * cannot tell which files are unused instead of listing them.
 *
 * Exits non-zero if a download fails or the source has a reference it cannot
 * read or resolve (the README lists each case).
 */

import { collectReferences } from "../src/sync/collect.mjs";
import { downloadMissing } from "../src/sync/download.mjs";
import { findUnreferenced } from "../src/sync/unreferenced.mjs";

const root = process.cwd();
const collection = await collectReferences(root);
const download = await downloadMissing(root, collection.wanted);
const unreferenced = await findUnreferenced(root, collection);
const problems = [...collection.problems, ...download.problems];

/** @param {string} label @param {string[]} items */
const list = (label, items) =>
  console.log(`${label} (${items.length})${items.map((item) => `\n  ${item}`).join("")}`);
list("added", download.added);
list("kept", download.kept);
switch (unreferenced.status) {
  case "known":
    list("not referenced (left in place)", unreferenced.files);
    if (unreferenced.files.length > 0) {
      console.log("To review and delete them: node node_modules/mirror-tools/bin/mirror-prune-assets.mjs");
    }
    break;
  case "unknown":
    console.log("not referenced: unknown, because the sync could not read every reference");
    break;
  default:
    throw new Error(`unknown unreferenced status: ${JSON.stringify(unreferenced)}`);
}

if (problems.length > 0) {
  console.error(`\nmirror-sync-assets failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exitCode = 1;
}
