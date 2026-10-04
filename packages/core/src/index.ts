// @openbook/core - read an OpenBook feed over a socket or HTTP, apply the
// standard's change envelopes, and cache the documents. Framework-free; the
// React bindings live in @openbook/react.
export { OpenBookClient, type OpenBookClientOptions } from "./client.js";
export { OpenBookStore, type AppliedRecord } from "./store.js";
export { applyMergePatch, mergePatch } from "./mergePatch.js";
export {
  webSocketSource,
  snapshotSource,
  type OpenBookSource,
  type OpenBookFrame,
  type SourceContext,
  type WebSocketSourceOptions,
  type SnapshotSourceOptions,
} from "./sources.js";
export { recordKey, OPENBOOK_SPEC_VERSION } from "./types.js";
export type { EnvelopeRecord, OpenBookDoc, OpenBookStatus, ChangeEnvelope } from "./types.js";
