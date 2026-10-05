// @openbook/pricing - derive a price across the sources on an OpenBook feed.
// It reads the standard's `market` documents (the applied ones a client's store
// hands back, one per source) and produces one market whose every outcome
// carries the best odds, keeping the source that offered it.
export { bestPrice, type BestPriceBook, type BestPriceStats } from "./bestPrice.js";
export type {
  BestPriceChange,
  BestPriceMarket,
  BestPriceOutcome,
  BestPriceSettings,
} from "./types.js";
