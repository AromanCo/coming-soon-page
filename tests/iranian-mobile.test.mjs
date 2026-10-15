import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidIranianMobile,
  normalizeIranianMobile,
} from "../src/lib/iranian-mobile.ts";

const canonical = "+989123456789";

test("normalizes supported Iranian mobile formats to E.164", () => {
  for (const input of [
    "09123456789",
    "0912 345 6789",
    "0912-345-6789",
    "+989123456789",
    "+98 912 345 6789",
    "00989123456789",
  ]) {
    assert.equal(normalizeIranianMobile(input), canonical, input);
  }
});

test("normalizes Persian and Arabic numerals", () => {
  assert.equal(normalizeIranianMobile("۰۹۱۲ ۳۴۵ ۶۷۸۹"), canonical);
  assert.equal(normalizeIranianMobile("٠٠٩٨٩١٢٣٤٥٦٧٨٩"), canonical);
  assert.equal(normalizeIranianMobile("+۹۸-۹۱۲-۳۴۵-۶۷۸۹"), canonical);
});

test("rejects malformed and non-mobile Iranian numbers", () => {
  for (const input of [
    "",
    "02112345678",
    "08123456789",
    "0912345678",
    "091234567890",
    "+988121234567",
    "009809121234567",
    "(0912) 123 4567",
    "0912.123.4567",
    "0912_123_4567",
    "0912\t1234567",
    "mobile09121234567",
    "-09121234567",
  ]) {
    assert.equal(normalizeIranianMobile(input), null, input);
    assert.equal(isValidIranianMobile(input), false, input);
  }
});

test("normalization is canonical and idempotent", () => {
  assert.equal(normalizeIranianMobile(canonical), canonical);
  assert.equal(isValidIranianMobile(canonical), true);
});
