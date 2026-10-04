// The best-price derivation.
//
// It reads the standard's `market` documents — the applied ones a client's
// store hands back, one per source — groups them by market identity
// (fixture, marketType, segment, line), and derives one market whose every
// outcome carries the best odds across the included sources, with the winning
// source kept on the outcome.
//
// The output is an ordinary OpenBook `market` document, published under the
// configured source id with `x_derived: true` (a derived market is not
// official, licensed or observed odds). Feed it what the client already reads
// and re-publish what it emits, and every existing consumer picks it up.
import {
  mergePatch,
  OPENBOOK_SPEC_VERSION,
  type AppliedRecord,
  type ChangeEnvelope,
  type OpenBookDoc,
} from "@openbook/core";
import type {
  BestPriceChange,
  BestPriceMarket,
  BestPriceOutcome,
  BestPriceSettings,
} from "./types.js";

export interface BestPriceStats {
  markets: number;
  sources: number;
  deriveCalls: number;
}

export interface BestPriceBook {
  /** Apply the applied `market` records the client's store returns. */
  apply(records: AppliedRecord[] | AppliedRecord): void;
  /** The derived market document for one identity, or undefined. */
  market(fixture: string, key: string): OpenBookDoc | undefined;
  /** Every derived market document. */
  markets(): OpenBookDoc[];
  /** Every derived market, as a model. */
  models(): BestPriceMarket[];
  /** The derived markets as change envelopes: `snapshot` the first time, then `update`. */
  envelopes(): ChangeEnvelope[];
  /** The same, but only for markets that moved since the last call (and it clears the flag). */
  changes(): ChangeEnvelope[];
  /** Called on every publish. Returns an unsubscribe function. */
  subscribe(listener: (change: BestPriceChange) => void): () => void;
  /** Drop derived markets whose sources have all gone stale. Returns how many. */
  prune(): number;
  stats(): BestPriceStats;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length ? v : undefined);

/** The standard's decimal odds: a string, strictly greater than 1. */
function parseOdds(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 1 ? n : undefined;
}

function formatOdds(decimal: number): string {
  return decimal.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function outcomesOf(doc: OpenBookDoc): Record<string, unknown>[] {
  const raw = doc.outcomes;
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

interface Identity {
  fixture: string;
  marketType: string;
  segment: string;
  line?: string;
  key: string;
}

/** The market identity, or undefined when the document is not a keyable market. */
function identityOf(doc: OpenBookDoc): Identity | undefined {
  const fixture = str(doc.fixture);
  const marketType = str(doc.marketType);
  if (!fixture || !marketType) return undefined;
  const segment = str(doc.segment) ?? "segment:unknown:unknown";
  const line = str(doc.line);
  return {
    fixture,
    marketType,
    segment,
    ...(line !== undefined ? { line } : {}),
    key: `${fixture}|${marketType}|${segment}|${line ?? ""}`,
  };
}

interface SourceEntry {
  doc: OpenBookDoc;
  at: number;
}

interface MarketEntry extends Identity {
  sport: string;
  bySource: Map<string, SourceEntry>;
  /** the latest derived content (no header), and the last published document */
  current?: OpenBookDoc;
  published?: OpenBookDoc;
  publishedSeq?: number;
}

export function bestPrice(settings: BestPriceSettings = {}): BestPriceBook {
  const include: "*" | readonly string[] = settings.sources ?? "*";
  const publisher = settings.publisher ?? "best";
  const margin = settings.margin ?? 0;
  const minSources = Math.max(1, settings.minSources ?? 1);
  const maxAgeMs = Math.max(0, settings.maxAgeMs ?? 0);
  const now = settings.now ?? (() => Date.now());

  const markets = new Map<string, MarketEntry>();
  const listeners = new Set<(change: BestPriceChange) => void>();
  let sequence = 0;
  let deriveCalls = 0;

  const allowed = (source: string): boolean => include === "*" || include.includes(source);

  const fresh = (entry: SourceEntry): boolean => maxAgeMs === 0 || now() - entry.at <= maxAgeMs;

  /** The sources that are fresh (and, when a market has none, it is not derived). */
  const freshSources = (entry: MarketEntry): [string, SourceEntry][] =>
    [...entry.bySource.entries()].filter(([, e]) => fresh(e));

  /** The current content for one market (no header), or null when not derivable. */
  function derive(entry: MarketEntry): OpenBookDoc | null {
    deriveCalls += 1;
    const sources = freshSources(entry);
    if (sources.length < minSources) return null;

    const sides: string[] = [];
    for (const [, { doc }] of sources) {
      for (const o of outcomesOf(doc)) {
        const side = str(o.side);
        if (side && !sides.includes(side)) sides.push(side);
      }
    }
    sides.sort();

    const outcomes: Record<string, unknown>[] = [];
    for (const side of sides) {
      let best: number | undefined;
      let bestSource: string | undefined;
      let bestLine: unknown;
      let quoted = 0;
      for (const [source, { doc }] of sources) {
        const outcome = outcomesOf(doc).find((o) => str(o.side) === side);
        if (!outcome) continue;
        const decimal = parseOdds(outcome.odds);
        if (decimal === undefined) continue;
        quoted += 1;
        if (best === undefined || decimal > best) {
          best = decimal;
          bestSource = source;
          bestLine = outcome.line;
        }
      }
      if (best === undefined || bestSource === undefined) continue;
      // The best price IS the decimal odds. Our margin shortens it: odds offered
      // are the best odds divided by (1 + margin); 0 offers it as-is.
      const offered = margin > 0 ? best / (1 + margin) : best;
      outcomes.push({
        side,
        odds: formatOdds(offered),
        ...(bestLine !== undefined ? { line: bestLine } : {}),
        active: true,
        // Attribution: which source offered the best price, and how many quoted.
        x_bestSource: bestSource,
        x_quoted: quoted,
      });
    }
    if (!outcomes.length) return null;

    // The tightest limit across the contributing sources: a composite cannot
    // offer more than the book it is built from.
    const limits = sources
      .map(([, { doc }]) => Number((doc.limit as { amount?: unknown } | undefined)?.amount))
      .filter((n) => Number.isFinite(n) && n > 0);
    const limit = limits.length ? String(Math.min(...limits)) : "0";

    const status = sources.some(([, { doc }]) => doc.status === "open") ? "open" : str(sources[0]![1].doc.status) ?? "open";

    return {
      openbookVersion: OPENBOOK_SPEC_VERSION,
      fixture: entry.fixture,
      marketType: entry.marketType,
      segment: entry.segment,
      ...(entry.line !== undefined ? { line: entry.line } : {}),
      source: publisher,
      provenance: "observed",
      status,
      limit: { amount: limit },
      outcomes,
      // A derived market is none of official/licensed/observed; it is our own
      // contribution, so the sources it is built from are recorded explicitly.
      x_derived: true,
      x_sources: sources.map(([source]) => source),
    };
  }

  /** The content of a document, without the per-message header. */
  const contentOf = (doc: OpenBookDoc): string => {
    const { sequence: _s, dateModified: _d, ...rest } = doc;
    return JSON.stringify(rest);
  };

  /** Changes derived but not yet read. Reading is side-effect free. */
  const pending = { envelopes: [] as ChangeEnvelope[], changes: [] as BestPriceChange[] };

  function model(entry: MarketEntry): BestPriceMarket {
    const doc = entry.current!;
    const outcomes: BestPriceOutcome[] = outcomesOf(doc).map((o) => ({
      side: String(o.side),
      odds: String(o.odds),
      source: String(o.x_bestSource ?? ""),
      quoted: Number(o.x_quoted ?? 0),
    }));
    return {
      fixture: entry.fixture,
      key: entry.key,
      marketType: entry.marketType,
      segment: entry.segment,
      ...(entry.line !== undefined ? { line: entry.line } : {}),
      sport: entry.sport,
      status: String(doc.status ?? "open"),
      sources: (doc.x_sources as string[] | undefined) ?? [],
      outcomes,
    };
  }

  /**
   * Re-derive a market and, when its content moved, queue the change envelope:
   * a snapshot the first time, a Merge Patch against the last published document
   * after that. Reading (`markets`, `changes`) never recomputes.
   */
  function deriveAndQueue(entry: MarketEntry): void {
    const content = derive(entry);
    if (!content) {
      entry.current = undefined;
      entry.published = undefined;
      entry.publishedSeq = undefined;
      return;
    }
    const changed = !entry.current || contentOf(entry.current) !== contentOf(content);
    entry.current = content;
    if (!changed) return;

    const seq = ++sequence;
    const doc: OpenBookDoc = { ...content, sequence: seq, dateModified: new Date(now()).toISOString() };
    const action: "snapshot" | "update" = entry.publishedSeq === undefined ? "snapshot" : "update";
    const changes = entry.published ? mergePatch(entry.published, doc) : doc;
    entry.published = doc;
    entry.publishedSeq = seq;
    const envelope: ChangeEnvelope = {
      openbookVersion: OPENBOOK_SPEC_VERSION,
      sequence: seq,
      datePublished: doc.dateModified as string,
      publisher,
      object: "market",
      action,
      sport: entry.sport,
      id: entry.fixture,
      changes,
      x_derived: true,
      x_sources: doc.x_sources,
    };
    pending.envelopes.push(envelope);
    pending.changes.push({ fixture: entry.fixture, key: entry.key, market: model(entry), changes, action });
  }

  /** Hand the queued changes to a reader and to the subscribers, then clear. */
  function drain(): ChangeEnvelope[] {
    const out = pending.envelopes.splice(0);
    const changes = pending.changes.splice(0);
    for (const change of changes) for (const listener of listeners) listener(change);
    return out;
  }

  return {
    apply(records) {
      const list = Array.isArray(records) ? records : [records];
      for (const record of list) {
        if (record.envelope.object !== "market") continue;
        const doc = record.doc;
        const identity = identityOf(doc);
        if (!identity) continue;
        const source = str(doc.source);
        if (!source || !allowed(source)) continue;

        let entry = markets.get(identity.key);
        if (!entry) {
          entry = { ...identity, sport: str(record.envelope.sport) ?? str(doc.sport) ?? "unknown", bySource: new Map() };
          markets.set(identity.key, entry);
        }
        const at = Date.parse(record.envelope.datePublished);
        entry.bySource.set(source, { doc, at: Number.isFinite(at) ? at : now() });
        deriveAndQueue(entry);
      }
    },

    market(fixture, key) {
      return markets.get(`${fixture}|${key}`)?.published;
    },

    markets() {
      return [...markets.values()].map((e) => e.published).filter((d): d is OpenBookDoc => Boolean(d));
    },

    models() {
      return [...markets.values()].filter((e) => e.published).map(model);
    },

    envelopes() {
      return drain();
    },

    changes() {
      return drain();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    prune() {
      let dropped = 0;
      for (const [key, entry] of markets) {
        const sources = freshSources(entry);
        if (sources.length) {
          entry.bySource = new Map(sources);
          continue;
        }
        markets.delete(key);
        dropped += 1;
      }
      if (dropped) {
        const live = new Set(markets.keys());
        pending.envelopes = pending.envelopes.filter((e) => [...markets.values()].some((m) => m.fixture === e.id));
        pending.changes = pending.changes.filter((c) => live.has(c.key));
      }
      return dropped;
    },

    stats() {
      const sources = new Set<string>();
      for (const entry of markets.values()) for (const source of entry.bySource.keys()) sources.add(source);
      return { markets: markets.size, sources: sources.size, deriveCalls };
    },
  };
}
