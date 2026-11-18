#!/usr/bin/env node
// @ts-check
/**
 * Post-build check, run from the mirror's root folder after
 * `astro build --config vercel.astro.config.mjs`. Fails (exit 1) if the output
 * in .vercel/output still points at Ploy's storage bucket, or points at a
 * /ploy-assets/<file> that the build did not ship.
 */

import { checkBuildOutput } from "../src/check.mjs";
import { reportCheck } from "../src/check-report.mjs";

process.exitCode = reportCheck(await checkBuildOutput(process.cwd()), console);
