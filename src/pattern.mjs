// @ts-check
// The one place that knows what a Ploy storage-bucket address looks like and
// where the local copies live. Imported by the Vite plugin (rewrite at build
// time), the sync (download) and the check (after the build).
//
// A bucket address: https://storage.googleapis.com/ployai/<uuid>/user/<filename>
// Local copy:       public/ploy-assets/<filename>, served at /ploy-assets/<filename>

/** Host and path start shared by every bucket address. */
export const BUCKET_HOST = "storage.googleapis.com/ployai";

/** Folder name under public/ (and under the build's static output). */
export const LOCAL_DIR = "ploy-assets";

/** Public path prefix that replaces the bucket prefix, without the trailing slash. */
export const LOCAL_PREFIX = `/${LOCAL_DIR}`;

const PREFIX_SOURCE = String.raw`https://storage\.googleapis\.com/ployai/([0-9a-f-]+)/user`;
const FILENAME_SOURCE = String.raw`[^\s"'\x60()<>\\?#,]+`;

/**
 * The bucket prefix (".../<uuid>/user"), when followed by "/" or the end of a
 * string literal. Matches both full addresses and a prefix stored on its own
 * in a constant (for example `const STORAGE = ".../user"` then `${STORAGE}/x.webp`).
 * Group 1 is the uuid.
 */
export function bucketPrefixRegex() {
  return new RegExp(`${PREFIX_SOURCE}(?=[/"'\x60])`, "g");
}

/** A full bucket address. Group 1 is the uuid, group 2 the filename. */
export function bucketAddressRegex() {
  return new RegExp(`${PREFIX_SOURCE}/(${FILENAME_SOURCE})`, "g");
}

/** A local reference "/ploy-assets/<filename>". Group 1 is the filename. */
export function localReferenceRegex() {
  return new RegExp(`${LOCAL_PREFIX}/(${FILENAME_SOURCE})`, "g");
}

/**
 * Bucket address for a uuid and filename.
 * @param {string} uuid
 * @param {string} filename
 */
export function bucketAddress(uuid, filename) {
  return `https://${BUCKET_HOST}/${uuid}/user/${filename}`;
}

/**
 * Replace every bucket prefix in a piece of code with the local prefix.
 * @param {string} code
 */
export function localiseBucketAddresses(code) {
  return code.replace(bucketPrefixRegex(), LOCAL_PREFIX);
}
