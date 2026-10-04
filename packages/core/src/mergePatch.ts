// RFC 7386 JSON Merge Patch. OpenBook's `changes` is a Merge Patch (absent =
// unchanged, null = removed), not RFC 6902. This is the reference apply/diff.
// See the standard's `change.schema.json` and decision Q91.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** RFC 7386 apply. Returns a new value; `target` is not mutated. */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return structuredClone(patch);
  const out: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = applyMergePatch(out[key], value);
  }
  return out;
}

/** Minimal RFC 7386 Merge Patch turning `old` into `next`. */
export function mergePatch(old: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(old)) {
    if (!(key in next)) patch[key] = null;
  }
  for (const [key, value] of Object.entries(next)) {
    if (!(key in old)) {
      patch[key] = structuredClone(value);
      continue;
    }
    const before = old[key];
    if (isPlainObject(before) && isPlainObject(value)) {
      const inner = mergePatch(before, value);
      if (Object.keys(inner).length) patch[key] = inner;
    } else if (before !== value || typeof before !== typeof value) {
      patch[key] = structuredClone(value);
    }
  }
  return patch;
}
