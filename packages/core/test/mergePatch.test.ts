import { describe, expect, it } from "vitest";
import { applyMergePatch, mergePatch } from "../src/mergePatch.js";

describe("applyMergePatch", () => {
  it("merges nested objects and removes null keys", () => {
    const target = { a: 1, b: { c: 2, d: 3 }, keep: true };
    const out = applyMergePatch(target, { b: { c: 9, d: null }, e: 4 }) as Record<string, unknown>;
    expect(out).toEqual({ a: 1, b: { c: 9 }, keep: true, e: 4 });
    // target is not mutated
    expect(target).toEqual({ a: 1, b: { c: 2, d: 3 }, keep: true });
  });

  it("replaces arrays rather than merging them", () => {
    const out = applyMergePatch({ xs: [1, 2, 3] }, { xs: [9] }) as Record<string, unknown>;
    expect(out).toEqual({ xs: [9] });
  });
});

describe("mergePatch", () => {
  it("round-trips through applyMergePatch", () => {
    const before = { a: 1, b: { c: 2, d: 3 }, gone: true };
    const after = { a: 1, b: { c: 5 }, added: [1, 2] };
    const patch = mergePatch(before, after);
    expect(applyMergePatch(before, patch)).toEqual(after);
  });
});
