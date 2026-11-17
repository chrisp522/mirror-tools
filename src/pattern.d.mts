// Hand-written types for pattern.mjs. TypeScript does not read JSDoc from
// JavaScript inside node_modules, so a consumer's type check needs this file.
// test/declarations.test.mjs fails if its exports and pattern.mjs's drift apart.

/** Host and path start shared by every bucket address. */
export const BUCKET_HOST: string;

/** Folder name under public/ (and under the build's static output). */
export const LOCAL_DIR: string;

/** Public path prefix that replaces the bucket prefix, without the trailing slash. */
export const LOCAL_PREFIX: string;

/** The bucket prefix (".../<uuid>/user"). Group 1 is the uuid. */
export function bucketPrefixRegex(): RegExp;

/** A full bucket address. Group 1 is the uuid, group 2 the filename. */
export function bucketAddressRegex(): RegExp;

/** A local reference "/ploy-assets/<filename>". Group 1 is the filename. */
export function localReferenceRegex(): RegExp;

/** Bucket address for a uuid and filename. */
export function bucketAddress(uuid: string, filename: string): string;

/** Replace every bucket prefix in a piece of code with the local prefix. */
export function localiseBucketAddresses(code: string): string;
