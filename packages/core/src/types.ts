// Shared wire types for the OpenBook client. The document and envelope shapes
// come from `types.generated.ts`, which is generated from the standard's JSON
// Schema. This file adds only the transport-level types the client needs.
import type { ChangeEnvelope } from "./types.generated.js";

export type { ChangeEnvelope };
export { OPENBOOK_SPEC_VERSION } from "./types.generated.js";
export type {
  Action,
  ObjectType,
  OddsChange,
  Fixture,
  Market,
  MarketOutcome,
  Score,
  Grade,
  League,
  Season,
  Stage,
  Participant,
  Player,
  Lineup,
  Publisher,
  Region,
  Sport,
  Stall,
  Toss,
  Series,
  MarketType,
  Discovery,
} from "./types.generated.js";

/** One stored envelope, with the topic it was published on and when. */
export interface EnvelopeRecord {
  seq: number;
  topic: string;
  envelope: ChangeEnvelope;
  at: string;
}

/** A document as the client caches it: an object, keyed by (object, id). */
export type OpenBookDoc = Record<string, unknown>;

export type OpenBookStatus = "connecting" | "live" | "reconnecting" | "closed" | "off";

/** The cache key for a document: the object plus its id. */
export function recordKey(envelope: Pick<ChangeEnvelope, "object" | "id">): string {
  return `${envelope.object}:${envelope.id ?? ""}`;
}
