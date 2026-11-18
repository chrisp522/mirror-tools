// @ts-check
// Prints a check result and decides the exit code. Kept out of the bin so the
// status-to-exit mapping can be tested, including its fail-closed default.
import { BUCKET_HOST, LOCAL_DIR } from "./pattern.mjs";
import { OUTPUT_DIR, SHIPPED_DIR } from "./check.mjs";

/**
 * @param {import("./check.mjs").CheckResult} result
 * @param {{ log(line: string): void; error(line: string): void }} out
 * @returns {0 | 1} exit code
 */
export function reportCheck(result, out) {
  switch (result.status) {
    case "no-output":
      out.error(`mirror-check-assets: ${OUTPUT_DIR} not found. Run the Vercel build first.`);
      return 1;

    case "ok":
      out.log(`mirror-check-assets: ok (${result.shippedCount} files in ${SHIPPED_DIR}, no bucket addresses)`);
      return 0;

    case "failed":
      out.error("mirror-check-assets: FAILED");
      if (result.bucketHits.size > 0) {
        out.error(`\nBuild output still points at ${BUCKET_HOST}:`);
        for (const [file, count] of result.bucketHits) out.error(`  ${file} (${count})`);
      }
      if (result.missing.size > 0) {
        out.error(`\nBuild output references /${LOCAL_DIR}/ files that were not shipped:`);
        for (const [filename, files] of result.missing) {
          out.error(`  ${filename}  <- ${[...files].join(", ")}`);
        }
      }
      out.error(
        `\nFix: run \`node node_modules/mirror-tools/bin/mirror-sync-assets.mjs\`, commit public/${LOCAL_DIR}/, and build again.` +
          `\nIf the sync does not pick a file up, the source builds that address in a way the sync cannot read;` +
          ` see "When the check fails" in the mirror-tools README.`,
      );
      return 1;

    default:
      // A status this file does not know must never let a deploy through: the
      // throw ends the bin with a non-zero exit.
      throw new Error(
        `mirror-check-assets: unknown check result "${/** @type {{ status: unknown }} */ (result).status}". Failing the build.`,
      );
  }
}
