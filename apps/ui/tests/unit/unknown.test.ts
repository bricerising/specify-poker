import { describe, expect, it } from "vitest";

import {
  asRecord,
  hasOwn,
  isRecord,
  readString,
  readStringArray,
  readTrimmedString,
  toNumber,
} from "../../src/utils/unknown";

describe("utils/unknown", () => {
  it("detects plain records", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord({})).toBe(true);
  });

  it("narrows to records", () => {
    expect(asRecord(null)).toBeNull();
    expect(asRecord([])).toBeNull();
    expect(asRecord({ key: "value" })).toEqual({ key: "value" });
  });

  it("checks own properties", () => {
    const record = { ok: true } as const;
    expect(hasOwn(record, "ok")).toBe(true);
    expect(hasOwn(record, "missing")).toBe(false);
  });

  it("reads strings and trimmed strings", () => {
    expect(readString("hello")).toBe("hello");
    expect(readString(123)).toBeNull();
    expect(readTrimmedString("  ok  ")).toBe("ok");
    expect(readTrimmedString("   ")).toBeNull();
  });

  it("reads numbers with fallbacks", () => {
    expect(toNumber(123)).toBe(123);
    expect(toNumber("42")).toBe(42);
    expect(toNumber("invalid", 7)).toBe(7);
  });

  it("reads string arrays", () => {
    expect(readStringArray([" a ", " ", 123, "b"])).toEqual(["a", "b"]);
    expect(readStringArray("nope")).toEqual([]);
  });
});

