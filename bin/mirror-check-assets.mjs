#!/usr/bin/env node
// @ts-check
/**
 * Post-build check, run from the mirror's root folder after
 * `astro build --config vercel.astro.config.mjs`. Fails (exit 1) if the output
 * in .vercel/output still points at Ploy's storage bucket, or points at a
 * /ploy-assets/<file> that the build did not ship.
 */

import { BUCKET_HOST, LOCAL_DIR } from "../src/pattern.mjs";
import { OUTPUT_DIR, SHIPPED_DIR, checkBuildOutput } from "../src/check.mjs";

const result = await checkBuildOutput(process.cwd());

switch (result.status) {
  case "no-output":
    console.error(`mirror-check-assets: ${OUTPUT_DIR} not found. Run the Vercel build first.`);
    process.exit(1);
    break;

  case "ok":
    console.log(`mirror-check-assets: ok (${result.shippedCount} files in ${SHIPPED_DIR}, no bucket addresses)`);
    process.exit(0);
    break;

  case "failed":
    console.error("mirror-check-assets: FAILED");
    if (result.bucketHits.size > 0) {
      console.error(`\nBuild output still points at ${BUCKET_HOST}:`);
      for (const [file, count] of result.bucketHits) console.error(`  ${file} (${count})`);
    }
    if (result.missing.size > 0) {
      console.error(`\nBuild output references /${LOCAL_DIR}/ files that were not shipped:`);
      for (const [filename, files] of result.missing) {
        console.error(`  ${filename}  <- ${[...files].join(", ")}`);
      }
    }
    console.error(
      `\nFix: run \`node node_modules/mirror-tools/bin/mirror-sync-assets.mjs\`, commit public/${LOCAL_DIR}/, and build again.` +
        `\nIf the sync does not pick a file up, the source builds that address in a way the sync cannot read;` +
        ` see "When the check fails" in the mirror-tools README.`,
    );
    process.exit(1);
}
