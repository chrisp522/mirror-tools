// @ts-check
import { BUCKET_HOST, localiseBucketAddresses } from "./pattern.mjs";

/**
 * Vite plugin that points Ploy storage-bucket addresses at the local copies in
 * public/ploy-assets/ (downloaded by `mirror-sync-assets`) while the site
 * compiles. The source files are not changed.
 *
 * Two placement rules, both learned from a real build:
 * - It must NOT be `enforce: "pre"`. A pre plugin runs before Tailwind has
 *   inlined imported CSS, so font addresses in an imported theme file are
 *   never seen.
 * - List it AFTER `tailwindcss()` in `vite.plugins`, for the same reason:
 *   `plugins: [tailwindcss(), localPloyAssets()]`.
 *
 * @returns {{ name: string; transform(code: string, id: string): { code: string; map: null } | null }}
 */
export function localPloyAssets() {
  return {
    name: "local-ploy-assets",
    transform(code, id) {
      if (id.includes("node_modules") || !code.includes(BUCKET_HOST)) return null;
      return { code: localiseBucketAddresses(code), map: null };
    },
  };
}
