#!/usr/bin/env node
// @ts-check
/**
 * Delete files in public/ploy-assets/ that no reference points at. Run it from
 * the mirror's root folder, after the sync runs clean.
 *
 *   mirror-prune-assets           dry run: list what would be deleted, delete nothing
 *   mirror-prune-assets --delete  delete exactly that list
 *
 * Refuses (exit 1, nothing deleted) when the source has a reference the sync
 * could not read, or when a referenced file is not on disk under its exact
 * name, because then it cannot tell which files are unused. Dotfiles
 * are never deleted. The list comes from the same collection the sync uses.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { assetDirOf } from "../src/sync/assets.mjs";
import { collectReferences } from "../src/sync/collect.mjs";
import { findUnreferenced } from "../src/sync/unreferenced.mjs";

const USAGE = [
  "Usage: mirror-prune-assets [--delete]",
  "  (no flag)  list the files in public/ploy-assets/ that no reference points at; delete nothing",
  "  --delete   delete exactly those files",
].join("\n");

/** @returns {{ mode: "dry-run" } | { mode: "delete" } | { mode: "usage-error"; argument: string }} */
function parseArguments() {
  const args = process.argv.slice(2);
  if (args.length === 0) return { mode: "dry-run" };
  if (args.length === 1 && args[0] === "--delete") return { mode: "delete" };
  return { mode: "usage-error", argument: args.find((arg) => arg !== "--delete") ?? args.join(" ") };
}

const request = parseArguments();
if (request.mode === "usage-error") {
  console.error(`mirror-prune-assets: unexpected argument "${request.argument}".\n${USAGE}`);
  process.exit(1);
}

const root = process.cwd();
const unreferenced = await findUnreferenced(root, await collectReferences(root));

const RUN_SYNC_FIRST = "Run node node_modules/mirror-tools/bin/mirror-sync-assets.mjs and fix what it reports first.";

switch (unreferenced.status) {
  case "unreadable":
    console.error(
      "mirror-prune-assets: refusing. The source has references the sync could not read, so it cannot tell which files are unused. Nothing was deleted.\n" +
        unreferenced.problems.map((p) => `  - ${p}`).join("\n"),
    );
    process.exitCode = 1;
    break;

  case "missing":
    console.error(
      "mirror-prune-assets: refusing. These referenced files are not in public/ploy-assets/, so the last sync did not finish or read a name wrong, and the list of unused files cannot be trusted. Nothing was deleted.\n" +
        unreferenced.missing.map((m) => `  - ${m}`).join("\n") +
        `\n${RUN_SYNC_FIRST}`,
    );
    process.exitCode = 1;
    break;

  case "known": {
    const { files } = unreferenced;
    /** @param {string} label */
    const list = (label) => console.log(`${label} (${files.length})${files.map((f) => `\n  ${f}`).join("")}`);
    switch (request.mode) {
      case "dry-run":
        list("would delete");
        if (files.length > 0) {
          console.log("This was a dry run. Read the list, then run again with --delete to delete these files.");
        }
        break;
      case "delete":
        for (const file of files) await rm(join(assetDirOf(root), file));
        list("deleted");
        break;
      default:
        throw new Error(`unknown prune mode: ${JSON.stringify(request)}`);
    }
    break;
  }

  default:
    throw new Error(`unknown unreferenced status: ${JSON.stringify(unreferenced)}`);
}
