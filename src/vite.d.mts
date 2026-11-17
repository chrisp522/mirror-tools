// Hand-written types for vite.mjs. TypeScript does not read JSDoc from
// JavaScript inside node_modules, so a consumer's type check needs this file.
// test/declarations.test.mjs fails if its exports and vite.mjs's drift apart.

/**
 * The plugin object, typed by its shape so this package needs no Vite types.
 * It is assignable to a Vite `Plugin` in `vite.plugins`.
 */
export interface LocalPloyAssetsPlugin {
  name: string;
  transform(code: string, id: string): { code: string; map: null } | null;
}

/**
 * Vite plugin that points Ploy storage-bucket addresses at the local copies in
 * public/ploy-assets/ while the site compiles. List it after `tailwindcss()`
 * in `vite.plugins`, and never make it `enforce: "pre"`.
 */
export function localPloyAssets(): LocalPloyAssetsPlugin;
