// An in-memory cache of OpenBook documents, keyed by (object, id). Envelopes
// arrive as `snapshot`/`create` (the whole object) or as a Merge Patch against
// the previous value; both are applied here. Subscribers are notified once per
// applied record, which is what the React bindings use to re-render.
import { applyMergePatch } from "./mergePatch.js";
import { recordKey, type ChangeEnvelope, type EnvelopeRecord, type OpenBookDoc } from "./types.js";

export interface AppliedRecord {
  key: string;
  doc: OpenBookDoc;
  envelope: ChangeEnvelope;
}

export class OpenBookStore {
  private readonly cache = new Map<string, OpenBookDoc>();
  private sequence = 0;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  /** The highest sequence applied so far; the resume cursor. */
  get lastSequence(): number {
    return this.sequence;
  }

  /** Bumps on every applied record; a stable snapshot for `useSyncExternalStore`. */
  getVersion = (): number => this.version;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** The cached document for an object key, or undefined before it arrives. */
  get(object: string, id = ""): OpenBookDoc | undefined {
    return this.cache.get(`${object}:${id}`);
  }

  /** Every cached document of one object type (all fixtures, all markets, ...). */
  all(object: string): OpenBookDoc[] {
    const prefix = `${object}:`;
    const out: OpenBookDoc[] = [];
    for (const [key, value] of this.cache) if (key.startsWith(prefix)) out.push(value);
    return out;
  }

  /** The raw cache key set, for callers that want to enumerate documents. */
  keys(): string[] {
    return [...this.cache.keys()];
  }

  /** Apply one envelope record. Returns the changed document, or null for a control frame. */
  apply(record: EnvelopeRecord): AppliedRecord | null {
    const envelope = record.envelope;
    if (Number.isFinite(record.seq) && record.seq > this.sequence) this.sequence = record.seq;

    if (envelope.action === "heartbeat" || envelope.action === "snapshotComplete") {
      this.emit();
      return null;
    }

    const key = recordKey(envelope);
    if (envelope.action === "delete") {
      this.cache.delete(key);
      this.emit();
      return null;
    }

    const previous = this.cache.get(key);
    const next =
      envelope.action === "snapshot" || envelope.action === "create"
        ? (structuredClone(envelope.changes) as OpenBookDoc)
        : (applyMergePatch(previous ?? {}, envelope.changes) as OpenBookDoc);
    this.cache.set(key, next);
    this.emit();
    return { key, doc: next, envelope };
  }

  applyAll(records: EnvelopeRecord[]): void {
    for (const record of records) this.apply(record);
  }

  /** Forget everything. The resume cursor is reset too. */
  reset(): void {
    this.cache.clear();
    this.sequence = 0;
    this.emit();
  }
}
