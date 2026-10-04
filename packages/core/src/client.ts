// The client wires one source to one store and reports changes. It holds no
// vendor parsing: the source hands it OpenBook envelope records and the store
// applies them.
import { OpenBookStore } from "./store.js";
import type { OpenBookSource } from "./sources.js";
import type { ChangeEnvelope, EnvelopeRecord, OpenBookDoc, OpenBookStatus } from "./types.js";

export interface OpenBookClientOptions {
  source: OpenBookSource;
  /** Share a store across clients, or supply one that is preloaded. */
  store?: OpenBookStore;
  /** Called for every document that changed, after it is applied. */
  onObject?: (key: string, doc: OpenBookDoc, envelope: ChangeEnvelope) => void;
  /** Called for every record, including control frames. */
  onEnvelope?: (record: EnvelopeRecord) => void;
  /** Called on connection state changes. */
  onStatus?: (status: OpenBookStatus) => void;
}

export class OpenBookClient {
  readonly store: OpenBookStore;
  private readonly source: OpenBookSource;
  private readonly options: OpenBookClientOptions;
  private statusValue: OpenBookStatus = "closed";
  private readonly statusListeners = new Set<(status: OpenBookStatus) => void>();

  constructor(options: OpenBookClientOptions) {
    this.options = options;
    this.source = options.source;
    this.store = options.store ?? new OpenBookStore();
    if (options.onStatus) this.statusListeners.add(options.onStatus);
  }

  get status(): OpenBookStatus {
    return this.statusValue;
  }

  get lastSequence(): number {
    return this.store.lastSequence;
  }

  /** Subscribe to connection state changes. Returns an unsubscribe function. */
  subscribeStatus(listener: (status: OpenBookStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statusValue);
    return () => this.statusListeners.delete(listener);
  }

  /** Open the source. Safe to call once; a source starts a single connection. */
  connect(): void {
    this.source.start({
      since: () => this.store.lastSequence,
      records: (records) => this.receive(records),
      status: (status) => this.setStatus(status),
    });
  }

  /** Close the source. The cache is kept, so a later connect resumes. */
  close(): void {
    this.source.stop();
    this.setStatus("closed");
  }

  /** The cached document for one object, or undefined before it arrives. */
  get(object: string, id = ""): OpenBookDoc | undefined {
    return this.store.get(object, id);
  }

  /** Every cached document of one object type. */
  all(object: string): OpenBookDoc[] {
    return this.store.all(object);
  }

  private receive(records: EnvelopeRecord[]): void {
    for (const record of records) {
      const applied = this.store.apply(record);
      if (applied) this.options.onObject?.(applied.key, applied.doc, record.envelope);
      this.options.onEnvelope?.(record);
    }
  }

  private setStatus(status: OpenBookStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
