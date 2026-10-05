// Types for @openbook/pricing. A derived market is an ordinary OpenBook
// `market` document; these are the settings and the model the derivation
// exposes before it is serialized.

import type { OpenBookDoc } from "@openbook/core";

/** Which sources to consider, and how to combine them. */
export interface BestPriceSettings {
  /**
   * Sources to include. `"*"` (the default) uses every source on the wire; a
   * list restricts to those `source` ids.
   */
  sources?: "*" | readonly string[];
  /**
   * The `source` id the derived market is published under. It must not collide
   * with a real source, or a consumer cannot tell our price from the market's.
   */
  publisher?: string;
  /**
   * Our own margin on top of the best price, as a fraction of implied
   * probability (0.045 is 4.5%). `0` (the default) offers the best price as-is.
   * A positive margin shortens the price, which is what a book sells.
   */
  margin?: number;
  /**
   * How many distinct sources must quote a market before it is published. One
   * source alone is not a "best" of anything; 1 (the default) still allows it.
   */
  minSources?: number;
  /**
   * A source quote older than this (ms) is stale and does not count. `0` (the
   * default) never expires a quote.
   */
  maxAgeMs?: number;
  /** Injectable clock, so staleness is testable. */
  now?: () => number;
}

/** One outcome of a derived market: the best quote and where it came from. */
export interface BestPriceOutcome {
  /** The OpenBook side (home, away, over, yes, ...). */
  side: string;
  /** The best decimal odds across the included sources, as a string. */
  odds: string;
  /** The source that offered the best price. */
  source: string;
  /** How many of the included sources quoted this outcome. */
  quoted: number;
}

/** The derived market, as a model (the wire form is an OpenBook `market`). */
export interface BestPriceMarket {
  /** The fixture this market belongs to. */
  fixture: string;
  /** The market identity: `marketType|segment|line`. */
  key: string;
  marketType: string;
  segment: string;
  line?: string;
  sport: string;
  status: string;
  /** The sources that contributed to this derivation. */
  sources: string[];
  outcomes: BestPriceOutcome[];
}

/** A change to a derived market, handed to a subscriber. */
export interface BestPriceChange {
  fixture: string;
  key: string;
  market: BestPriceMarket;
  /** The OpenBook document, or the Merge Patch when the market already existed. */
  changes: OpenBookDoc;
  action: "snapshot" | "update";
}
