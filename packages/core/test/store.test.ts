import { describe, expect, it, vi } from "vitest";
import { OpenBookStore } from "../src/store.js";
import type { ChangeEnvelope, EnvelopeRecord } from "../src/types.js";

function record(
  seq: number,
  object: string,
  id: string,
  action: ChangeEnvelope["action"],
  changes: Record<string, unknown>,
): EnvelopeRecord {
  const envelope = {
    openbookVersion: "0.3.0-draft",
    sequence: seq,
    datePublished: "2026-10-04T00:00:00Z",
    publisher: "test",
    object,
    action,
    sport: "soccer",
    id,
    changes,
  } as unknown as ChangeEnvelope;
  return { seq, topic: `openbook/v1/test/soccer/${object}/${id}/${action}`, envelope, at: "2026-10-04T00:00:00Z" };
}

describe("OpenBookStore", () => {
  it("applies a snapshot then a merge patch", () => {
    const store = new OpenBookStore();
    store.apply(record(1, "fixture", "f1", "snapshot", { id: "f1", eventStatus: "scheduled" }));
    store.apply(record(2, "fixture", "f1", "update", { eventStatus: "live" }));

    expect(store.lastSequence).toBe(2);
    expect(store.get("fixture", "f1")).toEqual({ id: "f1", eventStatus: "live" });
  });

  it("indexes documents by object and notifies subscribers", () => {
    const store = new OpenBookStore();
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(onChange);

    store.apply(record(1, "market", "m1", "snapshot", { id: "m1" }));
    store.apply(record(2, "market", "m2", "snapshot", { id: "m2" }));
    store.apply(record(3, "fixture", "f1", "snapshot", { id: "f1" }));

    expect(store.all("market")).toEqual([{ id: "m1" }, { id: "m2" }]);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(store.getVersion()).toBe(3);

    unsubscribe();
    store.apply(record(4, "market", "m1", "update", { status: "open" }));
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("treats heartbeat as cursor-only and delete as removal", () => {
    const store = new OpenBookStore();
    store.apply(record(5, "fixture", "f1", "snapshot", { id: "f1" }));
    store.apply(record(6, "publisher", "", "heartbeat", {}));
    expect(store.lastSequence).toBe(6);
    expect(store.get("publisher", "")).toBeUndefined();

    store.apply(record(7, "fixture", "f1", "delete", {}));
    expect(store.get("fixture", "f1")).toBeUndefined();
  });
});
