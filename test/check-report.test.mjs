import { test } from "node:test";
import assert from "node:assert/strict";
import { reportCheck } from "../src/check-report.mjs";

/** Collects what reportCheck prints. */
function capture() {
  /** @type {string[]} */
  const log = [];
  /** @type {string[]} */
  const error = [];
  return {
    out: { log: (/** @type {string} */ line) => log.push(line), error: (/** @type {string} */ line) => error.push(line) },
    log,
    error,
  };
}

test("ok prints one line and returns 0", () => {
  const { out, log, error } = capture();
  assert.equal(reportCheck({ status: "ok", shippedCount: 3 }, out), 0);
  assert.deepEqual(log, ["mirror-check-assets: ok (3 files in .vercel/output/static/ploy-assets, no bucket addresses)"]);
  assert.deepEqual(error, []);
});

test("no-output returns 1", () => {
  const { out, error } = capture();
  assert.equal(reportCheck({ status: "no-output" }, out), 1);
  assert.deepEqual(error, ["mirror-check-assets: .vercel/output not found. Run the Vercel build first."]);
});

test("failed returns 1", () => {
  const { out, error } = capture();
  const result = { status: "failed", bucketHits: new Map([["a.html", 1]]), missing: new Map() };
  assert.equal(reportCheck(/** @type {any} */ (result), out), 1);
  assert.equal(error[0], "mirror-check-assets: FAILED");
});

test("an unknown status fails closed", () => {
  const { out, log, error } = capture();
  assert.equal(reportCheck(/** @type {any} */ ({ status: "surprise" }), out), 1);
  assert.deepEqual(log, []);
  assert.deepEqual(error, ['mirror-check-assets: unknown check result "surprise". Failing the build.']);
});
