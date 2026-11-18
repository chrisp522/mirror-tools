import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUCKET_HOST,
  LOCAL_DIR,
  LOCAL_PREFIX,
  bucketAddress,
  bucketPrefixRegex,
  filenameAt,
  isEscapedQuoteAt,
  decodeFilename,
  localReferenceRegex,
  localiseBucketAddresses,
} from "../src/pattern.mjs";

const UUID = "00000000-0000-4000-8000-000000000000";
const PREFIX = `https://storage.googleapis.com/ployai/${UUID}/user`;

test("constants describe the bucket and the local folder", () => {
  assert.equal(BUCKET_HOST, "storage.googleapis.com/ployai");
  assert.equal(LOCAL_DIR, "ploy-assets");
  assert.equal(LOCAL_PREFIX, "/ploy-assets");
});

test("bucketAddress builds a full address", () => {
  assert.equal(bucketAddress(UUID, "a.webp"), `${PREFIX}/a.webp`);
});

test("bucketPrefixRegex matches a full address and a prefix-only string literal", () => {
  const full = `"${PREFIX}/a.webp"`;
  const constant = `const STORAGE = "${PREFIX}";`;
  const template = "const S = `" + PREFIX + "`;";
  const single = `const S = '${PREFIX}';`;
  for (const text of [full, constant, template, single]) {
    const matches = [...text.matchAll(bucketPrefixRegex())];
    assert.equal(matches.length, 1, text);
    assert.equal(matches[0][1], UUID);
  }
});

test("things that must not match", () => {
  const cases = [
    // another bucket
    `"https://storage.googleapis.com/otherbucket/${UUID}/user/a.webp"`,
    // not under /user
    `"https://storage.googleapis.com/ployai/${UUID}/public/a.webp"`,
    // no uuid segment
    `"https://storage.googleapis.com/ployai/user/a.webp"`,
    // uuid with characters outside hex and dash
    `"https://storage.googleapis.com/ployai/not-a-uuid-xyz/user/a.webp"`,
    // prefix followed by something other than "/" or the end of a literal
    `"${PREFIX}s/a.webp"`,
    `${PREFIX} trailing`,
    // http, not https
    `"http://storage.googleapis.com/ployai/${UUID}/user/a.webp"`,
  ];
  for (const text of cases) {
    assert.equal([...text.matchAll(bucketPrefixRegex())].length, 0, `prefix: ${text}`);
  }
});

test("localReferenceRegex finds /ploy-assets/<file>", () => {
  const text = `src="/ploy-assets/a.webp" url(/ploy-assets/b%20c.woff2) "/other/x.png"`;
  assert.deepEqual(
    [...text.matchAll(localReferenceRegex())].map((m) => m[1]),
    ["a.webp", "b%20c.woff2"],
  );
});

test("localiseBucketAddresses rewrites full addresses and prefix-only constants", () => {
  const code = [
    `<img src="${PREFIX}/a.webp">`,
    `const STORAGE = "${PREFIX}";`,
    "const img = `${STORAGE}/b.webp`;",
    `url('${PREFIX}/f.woff2')`,
  ].join("\n");
  assert.equal(
    localiseBucketAddresses(code),
    [
      `<img src="/ploy-assets/a.webp">`,
      `const STORAGE = "/ploy-assets";`,
      "const img = `${STORAGE}/b.webp`;",
      `url('/ploy-assets/f.woff2')`,
    ].join("\n"),
  );
});

test("localiseBucketAddresses leaves other code alone", () => {
  const code = `"https://storage.googleapis.com/otherbucket/${UUID}/user/a.webp" "${PREFIX}s/x"`;
  assert.equal(localiseBucketAddresses(code), code);
});

test("regex factories return fresh global regexes", () => {
  const a = bucketPrefixRegex();
  const b = bucketPrefixRegex();
  assert.notEqual(a, b);
  assert.ok(a.global && localReferenceRegex().global);
});

test("decodeFilename decodes percent sequences", () => {
  assert.equal(decodeFilename("my%20image.webp"), "my image.webp");
  assert.equal(decodeFilename("..%2Fx.webp"), "../x.webp");
  assert.equal(decodeFilename("plain.webp"), "plain.webp");
});

test("decodeFilename keeps a name that cannot be decoded as written", () => {
  assert.equal(decodeFilename("100%.webp"), "100%.webp");
  assert.equal(decodeFilename("a%zzb.webp"), "a%zzb.webp");
});


test("filenameAt reads a filename up to its first delimiter", () => {
  const cases = [
    ["a.webp?w=10", "a.webp"],
    ["b.webp#top", "b.webp"],
    ["c.webp 1x,d.webp 2x", "c.webp"],
    ["d.webp,e.webp", "d.webp"],
    ['e.webp"', "e.webp"],
    ["f.webp&quot;]}", "f.webp"],
    ["x%20y.png)", "x%20y.png"],
  ];
  for (const [text, name] of cases) assert.equal(filenameAt(`/${text}`, 1), name, text);
  assert.equal(filenameAt('/"', 1), "");
});

test("localReferenceRegex stops at &, so HTML-escaped text does not run into the name", () => {
  const text = `props="{&quot;src&quot;:[0,&quot;/ploy-assets/hero.webp&quot;]}"`;
  assert.deepEqual([...text.matchAll(localReferenceRegex())].map((m) => m[1]), ["hero.webp"]);
});

test("isEscapedQuoteAt recognises HTML-escaped quotes only", () => {
  for (const quote of ["&quot;", "&#34;", "&#x22;", "&apos;", "&#39;", "&#x27;", "&QUOT;"]) {
    assert.equal(isEscapedQuoteAt(`a${quote}b`, 1), true, quote);
  }
  for (const other of ["&amp;", "&pepper.webp", "&lt;", "&quot"]) {
    assert.equal(isEscapedQuoteAt(`a${other}`, 1), false, other);
  }
});
