# mirror-tools

Build-time tools for running a mirror of a Ploy site on another host (Vercel).

A Ploy site's source points its images and fonts at Ploy's storage bucket:

```
https://storage.googleapis.com/ployai/<uuid>/user/<filename>
```

The mirror keeps its own copies of those files in `public/ploy-assets/` and serves them from its own domain. Ploy owns the source and keeps editing it, so the mirror never edits Ploy's files. Instead these tools download the copies and rewrite the addresses while the site builds.

## The four pieces

- **The sync** (`mirror-sync-assets`): reads the source and downloads every referenced bucket file that `public/ploy-assets/` does not have yet. It never deletes anything. You run it by hand and commit the result.
- **The prune** (`mirror-prune-assets`): a separate command you run by hand. It lists the files in `public/ploy-assets/` that no reference points at, and deletes them only when you add `--delete`.
- **The Vite plugin** (`localPloyAssets` from `mirror-tools/vite`): while Astro builds, replaces each bucket prefix with `/ploy-assets`. The source files on disk stay as Ploy wrote them. Code under `node_modules` is left alone.
- **The check** (`mirror-check-assets`): runs after the build. It fails the build if the output still contains a bucket address, or references a `/ploy-assets/` file the build did not ship.

All four read the address pattern from one internal module, `src/pattern.mjs`. It is not exported. The sync and the prune read references the same way, from one shared module.

### One address, start to finish

1. **Source.** A Ploy page has `<img src="https://storage.googleapis.com/ployai/00000000-0000-4000-8000-000000000000/user/hero.webp">`.
2. **Sync.** `mirror-sync-assets` finds that address, downloads it, and saves it as `public/ploy-assets/hero.webp`. You commit that file.
3. **Build.** The Vite plugin turns the address into `/ploy-assets/hero.webp`. Astro copies `public/` into the output, so the file ships at that path.
4. **Check.** `mirror-check-assets` reads `.vercel/output`. It finds no bucket address and finds `hero.webp` in `.vercel/output/static/ploy-assets/`, so it prints `ok` and the deploy goes ahead.
5. **Later, if Ploy drops the image.** The next sync lists `hero.webp` under `not referenced (left in place)` and keeps it. It goes away only when you run the prune with `--delete`.

### What the sync can read

The sync reads the files in `src/` and `public/` (skipping `public/ploy-assets/`) as text. It finds a bucket file when the source writes it one of two ways:

- A full address: `https://storage.googleapis.com/ployai/<uuid>/user/<filename>`.
- A prefix held in a constant, then joined in a template literal:

  ```js
  const STORAGE = "https://storage.googleapis.com/ployai/<uuid>/user";
  const hero = `${STORAGE}/hero.webp`;
  const wall = `${STORAGE}/wall.webp`;
  ```

  The constant must be declared with `const`, `let` or `var`, must not be exported, and every other mention of it in that file must be `${STORAGE}/<filename>` with a literal filename. The sync has then seen every file the constant can point to. An exported constant, `STORAGE + "/hero.webp"`, or `${STORAGE}/${name}` is a use it cannot read.

Every place the source writes the bucket prefix ends as either a file to download or a problem. A prefix with a slash after it and no literal filename (`const S = ".../user/"`, `".../user/" + "hero.webp"`, `new URL("hero.webp", ".../user/")`) is a problem, not something the sync skips.

A filename ends at whitespace, a quote, `(`, `)`, `<`, `>`, a backslash, `?`, `#`, a comma or `&`. An HTML-escaped quote such as `&quot;` ends it too, so `hero.webp&quot;` reads as `hero.webp`. Any other `&` right after a filename is a problem (see below).

The local filename is the filename from the address with percent sequences decoded, so `my%20image.webp` is saved as `my image.webp`. A name that cannot be decoded, such as `100%.webp`, is saved as written. Either way the download uses the address exactly as the source writes it.

A file already in `public/ploy-assets/` is never downloaded again. Bucket filenames carry a hash or timestamp, so one name is treated as one fixed file. A file there whose name differs from a referenced one only in case (`hero.webp` on disk, `Hero.webp` referenced) is a problem, and nothing is downloaded over it.

### What the sync prints

- `added`: files it downloaded.
- `kept`: referenced files that were already there.
- `not referenced (left in place)`: files in `public/ploy-assets/` that no reference it read points at, apart from dotfiles. They stay where they are. When the list is not empty, the sync names the prune command on the next line.
- When the sync had a problem reading the source, it prints `not referenced: unknown` instead of that list, because a file with no readable reference may still be in use.
- When a referenced file is still not in `public/ploy-assets/` after the sync's run (its download failed, or it is there only in another case), it also prints `not referenced: unknown`, followed by those files. These are the same cases in which the prune refuses.

The sync exits with an error, after downloading what it can, when:

- a download fails;
- two different addresses would save to the same filename, or to names that differ only in case;
- a referenced filename is on disk only in another case;
- a filename, once decoded, contains a slash (`/` or `\`) or is `.` or `..`;
- the bucket prefix is followed by a slash and no literal filename;
- a filename is built from a template expression (`.../user/hero-${size}.webp`);
- a filename contains an `&` that is not an HTML-escaped quote (`.../user/salt&pepper.webp`);
- the source holds a bucket prefix that is not a simple `const`, `let` or `var` string (for example a prefix inside an object);
- a prefix constant breaks the rule above: it is exported, it has a use in another form, or it has no use the sync can read.

Each message says what it is about: the source file (with the line, for a prefix with no filename or a constant use in another form), the address, or the names on disk.

### The prune

```
node node_modules/mirror-tools/bin/mirror-prune-assets.mjs           # dry run: lists, deletes nothing
node node_modules/mirror-tools/bin/mirror-prune-assets.mjs --delete  # deletes exactly that list
```

- Without a flag it prints `would delete (n)` and the files, and deletes nothing.
- With `--delete` it deletes exactly the files it would list and prints `deleted (n)`.
- It refuses, exits 1 and deletes nothing when the source has any problem the sync reports while reading references. Fix those first.
- It also refuses, exits 1 and deletes nothing when a referenced file is not in `public/ploy-assets/` under its exact name. It prints those files, each with the name on disk when it is there only in another case. A missing file means the last sync did not finish, or the reader cut a name short, so the list of unused files cannot be trusted. Run the sync and fix what it reports first.
- It never deletes a file whose name starts with a dot (`.gitkeep`, `.DS_Store`), or one that a reference matches ignoring case.
- It takes no other argument, and never asks a question, so it also runs in a script.

Read the dry-run list before you run `--delete`. The list is only as good as the sync's reading of the source (see "Limits").

## Install

Add it to the mirror's `package.json` as a git dependency, pinned to a tag:

```json
"mirror-tools": "github:chrisp522/mirror-tools#v1.0.5"
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
5. `node node_modules/mirror-tools/bin/mirror-sync-assets.mjs` (downloads new files; deletes nothing)
6. Optional, only when step 5 ran clean: `node node_modules/mirror-tools/bin/mirror-prune-assets.mjs`, read the list, then run it again with `--delete` if every file on it is really unused.
7. Commit, including every change under `public/ploy-assets/`.
8. Push the branch and open a pull request. The host builds a preview, and the check runs as part of that build. Look at the preview too.

## When the check fails

The check reads plain `/ploy-assets/<file>` references only. A URL-encoded one, such as `/_vercel/image?url=%2Fploy-assets%2Fhero.webp`, is not checked.

The build log starts with `mirror-check-assets: FAILED` and lists one or both of:

- **"Build output still points at storage.googleapis.com/ployai"**, with the output files and how many addresses each holds. The plugin did not rewrite those addresses. Check the plugin order in the Vercel-side Astro config first. If the order is right, the address was built in a way the plugin's pattern does not match; find it in the named output file and then in the source.
- **"Build output references /ploy-assets/ files that were not shipped"**, with each missing filename and the output files that use it. The rewrite worked, but the file is not in `public/ploy-assets/`.

For either one:

1. Run `node node_modules/mirror-tools/bin/mirror-sync-assets.mjs` and read its output.
2. If it added files, commit `public/ploy-assets/`, push, and let the build run again.
3. If it added nothing and the check still fails, the source builds that address in a way the sync cannot read (see "What the sync can read" and "Limits"). You can download the file into `public/ploy-assets/` by hand and commit it; the sync never deletes it. The prune will list it as not referenced, so leave it off any `--delete` run. The lasting fixes are to have the source changed in Ploy to one of the two readable forms, or to teach the sync the new form in this package.

If the sync itself fails, its last lines list each problem.

## Limits

The sync and the prune read source files as text. They do not run or parse the code. These forms are not read, so a file referenced only this way is not downloaded by the sync and can appear on the prune's list:

- a bucket address in a file outside `src/` and `public/` (for example a root `lib/` folder);
- a prefix assembled from pieces, so the full `https://storage.googleapis.com/ployai/<uuid>/user` never appears as written;
- a constant set in a classic inline `<script>` and read as a global from another file;
- a comment between `export` and `const` (`export /* note */ const S = ...`), which hides that the constant is exported;
- a constant used through spread (`...S`) or written with a unicode escape (`\u0053`);
- a filename that really contains `(`, `)`, `,` or `'`, which is cut short at that character. The sync then tries to download the shortened name (`it's.webp` becomes `it`). When the bucket has no file by that name, the download fails, and the prune refuses while `it` is missing from disk. When the bucket does have a file by that name, the sync saves that other file, and the prune's list can then include the real one;
- a file with a zero byte in its first 8000 bytes, which is treated as binary and skipped;
- a symbolic link, which is skipped.

What protects you:

- The check after the build fails on any bucket address left in the output and on any plain-text `/ploy-assets/<file>` reference to a file that was not shipped. It does not see a reference that the build output writes in another form.
- The preview build of each pull request. Look at it.
- The sync never deletes. The prune is a separate, manual step: run it only when the sync ran clean, and read its dry-run list before `--delete`. It refuses on its own when the sync could not read the source or a referenced file is missing from disk.

## Develop

```
npm test
```

Runs the tests with Node's built-in test runner. They use temporary folders and never touch the network.
