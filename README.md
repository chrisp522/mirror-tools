# mirror-tools

Build-time tools for running a mirror of a Ploy site on another host (Vercel).

A Ploy site's source points its images and fonts at Ploy's storage bucket:

```
https://storage.googleapis.com/ployai/<uuid>/user/<filename>
```

The mirror keeps its own copies of those files in `public/ploy-assets/` and serves them from its own domain. Ploy owns the source and keeps editing it, so the mirror never edits Ploy's files. Instead these tools download the copies and rewrite the addresses while the site builds.

## The three pieces

- **The sync** (`mirror-sync-assets`): reads the source, downloads every referenced bucket file into `public/ploy-assets/`, and deletes files there that nothing references any more. You run it by hand and commit the result.
- **The Vite plugin** (`localPloyAssets` from `mirror-tools/vite`): while Astro builds, replaces each bucket prefix with `/ploy-assets`. The source files on disk stay as Ploy wrote them. Code under `node_modules` is left alone.
- **The check** (`mirror-check-assets`): runs after the build. It fails the build if the output still contains a bucket address, or references a `/ploy-assets/` file the build did not ship.

All three read the address pattern from one internal module, `src/pattern.mjs`. It is not exported.

### One address, start to finish

1. **Source.** A Ploy page has `<img src="https://storage.googleapis.com/ployai/00000000-0000-4000-8000-000000000000/user/hero.webp">`.
2. **Sync.** `mirror-sync-assets` finds that address, downloads it, and saves it as `public/ploy-assets/hero.webp`. You commit that file.
3. **Build.** The Vite plugin turns the address into `/ploy-assets/hero.webp`. Astro copies `public/` into the output, so the file ships at that path.
4. **Check.** `mirror-check-assets` reads `.vercel/output`. It finds no bucket address and finds `hero.webp` in `.vercel/output/static/ploy-assets/`, so it prints `ok` and the deploy goes ahead.

### What the sync can read

The sync finds a bucket file in `src/` and `public/` (skipping `public/ploy-assets/`) when the source writes it one of two ways:

- A full address: `https://storage.googleapis.com/ployai/<uuid>/user/<filename>`.
- A prefix held in a constant, then joined in a template literal:

  ```js
  const STORAGE = "https://storage.googleapis.com/ployai/<uuid>/user";
  const hero = `${STORAGE}/hero.webp`;
  ```

The local filename is the filename from the address with percent sequences decoded, so `my%20image.webp` is saved as `my image.webp`. A name that cannot be decoded, such as `100%.webp`, is saved as written. Either way the download uses the address exactly as the source writes it.

A file already in `public/ploy-assets/` is never downloaded again. Bucket filenames carry a hash or timestamp, so one name is treated as one fixed file. Files whose names start with a dot (such as `.gitkeep`) are never downloaded over or deleted.

The sync exits with an error, after doing what it can, when:

- a download fails;
- two different addresses would save to the same filename;
- a filename, once decoded, contains a slash (`/` or `\`) or is `.` or `..`;
- the source holds a bucket prefix that is not a simple `const`, `let` or `var` string (for example a prefix inside an object). The sync cannot tell which files go with it.

When any of the last three happens, the sync could not read every reference. It still downloads what it can, but it deletes nothing, because a file it saw no reference to may still be in use. Its output then reads `removed (skipped: ...)`.

## Install

Add it to the mirror's `package.json` as a git dependency, pinned to a tag:

```json
"mirror-tools": "github:chrisp522/mirror-tools#v1.0.2"
```

Then install with the mirror's package manager. Node 20 or later. The package has no dependencies of its own.

This is a git dependency, not one from the npm registry. The `.npmrc` in Ploy's site template sets `allow-git=none`, and with that setting `npm install` refuses it (`EALLOWGIT`). bun does not read that setting, so a mirror that installs with bun installs it normally. State the installer in the mirror's `vercel.json` (`"installCommand": "bun install"`) so it is stated rather than detected.

## Use it in the mirror

### The Vercel-side Astro config

Keep Ploy's config files as they are. Which file you add depends on what Ploy's repo already has.

**Ploy's repo already ships a Vercel config** (for example `vercel.astro.config.mjs`). Do not copy or edit it. Add a new file, for example `mirror.astro.config.mjs`, that imports it and appends the plugin:

```js
import { localPloyAssets } from "mirror-tools/vite";
import ployVercelConfig from "./vercel.astro.config.mjs";

export default {
  ...ployVercelConfig,
  vite: {
    ...ployVercelConfig.vite,
    plugins: [...(ployVercelConfig.vite?.plugins ?? []), localPloyAssets()],
  },
};
```

Do not wrap this in `defineConfig()` a second time. Ploy's file already did, and a second pass breaks type inference on the finished config. Appending puts the plugin after Ploy's own plugins, `tailwindcss()` included.

**Ploy's repo has no Vercel config.** Add your own, for example `vercel.astro.config.mjs`, with Ploy's settings from `astro.config.mjs` and the Vercel adapter:

```js
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";
import { localPloyAssets } from "mirror-tools/vite";

export default defineConfig({
  // ...the rest of Ploy's settings, copied from astro.config.mjs
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss(), localPloyAssets()],
  },
});
```

Two placement rules. Both come from a real build that missed font addresses:

- `localPloyAssets()` goes **after** `tailwindcss()` in `vite.plugins`.
- It is **not** an `enforce: "pre"` plugin, and should not be made one.

Either mistake makes the plugin run before Tailwind has inlined an imported CSS file. Font addresses inside that file then reach the output unchanged, and the check fails.

### vercel.json

Install with bun, build with the config you added, then run the check:

```json
{
  "framework": "astro",
  "installCommand": "bun install",
  "buildCommand": "astro build --config vercel.astro.config.mjs && node node_modules/mirror-tools/bin/mirror-check-assets.mjs"
}
```

Use the name of the file you added after `--config` (`mirror.astro.config.mjs` in the first case above).

The check is called through `node` and its file path. If the package is missing, that fails loudly. `npx mirror-check-assets` would instead fall back to looking the name up on the public npm registry, where anyone could publish a package by that name.

## Taking in Ploy's edits

Ploy commits to its own repo. The mirror has Ploy's repo as a remote named `ploy` (fetch only) and its own repo as `origin`.

1. `git fetch ploy`
2. `git switch -c <branch> origin/main`
3. `git merge ploy/main`
4. `bun install` (a fresh clone has no `node_modules/mirror-tools` until this runs, and Ploy's edits may change dependencies)
5. `node node_modules/mirror-tools/bin/mirror-sync-assets.mjs` (downloads new files, deletes unused ones)
6. Commit, including every change under `public/ploy-assets/`.
7. Push the branch and open a pull request. The host builds a preview, and the check runs as part of that build.

## When the check fails

The build log starts with `mirror-check-assets: FAILED` and lists one or both of:

- **"Build output still points at storage.googleapis.com/ployai"**, with the output files and how many addresses each holds. The plugin did not rewrite those addresses. Check the plugin order in the Vercel-side Astro config first. If the order is right, the address was built in a way the plugin's pattern does not match; find it in the named output file and then in the source.
- **"Build output references /ploy-assets/ files that were not shipped"**, with each missing filename and the output files that use it. The rewrite worked, but the file is not in `public/ploy-assets/`.

For either one:

1. Run `node node_modules/mirror-tools/bin/mirror-sync-assets.mjs` and read its output.
2. If it added files, commit `public/ploy-assets/`, push, and let the build run again.
3. If it added nothing and the check still fails, the source builds that address in a way the sync cannot read (see "What the sync can read"). Adding the file to `public/ploy-assets/` by hand does not last: any later sync that reads every reference deletes the files it saw no reference to. The lasting fixes are to have the source changed in Ploy to one of the two forms, or to teach the sync the new form in this package.

If the sync itself fails, its last lines list each problem.

## Develop

```
npm test
```

Runs the tests with Node's built-in test runner. They use temporary folders and never touch the network.
