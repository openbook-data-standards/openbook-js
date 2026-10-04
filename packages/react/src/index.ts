// @openbook/react - a provider that holds one OpenBook connection and hooks
// that read the cached documents. The wire client lives in @openbook/core.
export { OpenBookProvider, type OpenBookProviderProps } from "./provider.js";
export { OpenBookContext } from "./context.js";
export {
  useOpenBookClient,
  useOpenBookVersion,
  useOpenBookDoc,
  useOpenBookDocs,
  useOpenBookRecord,
  useOpenBookRecords,
  useOpenBookStatus,
  useOpenBookLastSequence,
} from "./hooks.js";

export type {
  AppliedRecord,
  OpenBookClient,
  OpenBookDoc,
  OpenBookStatus,
  OpenBookSource,
  ChangeEnvelope,
  EnvelopeRecord,
} from "@openbook/core";
