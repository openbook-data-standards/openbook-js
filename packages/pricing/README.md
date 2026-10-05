# @openbook/pricing

Derive a price across the sources on an OpenBook feed. Framework-free.

An OpenBook feed can carry the same market from several sources, each as its own
`market` document (one `source` per document). This package groups those by
market identity `(fixture, marketType, segment, line)` and derives one market
whose every outcome carries the **best odds** across the included sources, with
the source that offered it kept on the outcome.

It is "initiate and set settings": create a book, feed it what the client
already reads, re-publish what it emits.

```ts
import { OpenBookClient, sseSource } from "@openbook/core";
import { bestPrice } from "@openbook/pricing";

const client = new OpenBookClient({ source: sseSource({ url: "/openbook/stream" }) });
const book = bestPrice({ publisher: "kaz-best", sources: ["pinnacle", "draftkings"], margin: 0 });

// The same records the client applies; a store's records are the applied docs.
client.connect();
setInterval(() => {
  book.apply(client.store.records("market"));
  for (const envelope of book.envelopes()) publish(envelope); // fan out
}, 1000);
```

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `sources` | `"*"` | `"*"` uses every source; a list restricts to those `source` ids. |
| `publisher` | `"best"` | The `source` the derived market is published under. Must not collide with a real source. |
| `margin` | `0` | Our margin on top, as a fraction of implied probability. `0` offers the best price as-is; a positive margin shortens it. |
| `minSources` | `1` | How many distinct sources must quote a market before it is published. One source alone is not a "best" of anything. |
| `maxAgeMs` | `0` | A quote older than this is stale and does not count. `0` never expires. |
| `now` | `Date.now` | Injectable clock. |

## The derived document

An ordinary OpenBook `market` document, so any consumer that reads OpenBook
reads it with no change:

```json
{
  "openbookVersion": "0.3.0-draft",
  "sequence": 1,
  "dateModified": "2026-10-04T00:00:00Z",
  "fixture": "evt-1",
  "marketType": "market:moneyline",
  "segment": "segment:soccer:full-time",
  "source": "kaz-best",
  "provenance": "observed",
  "status": "open",
  "limit": { "amount": "250" },
  "outcomes": [
    { "side": "home", "odds": "2.2", "active": true, "x_bestSource": "pinnacle", "x_quoted": 2 },
    { "side": "away", "odds": "1.8", "active": true, "x_bestSource": "draftkings", "x_quoted": 2 }
  ],
  "x_derived": true,
  "x_sources": ["pinnacle", "draftkings"]
}
```

The `limit` is the tightest across the contributing sources: a composite cannot
offer more than the book it is built from.

## A note on provenance

A derived price is neither `official`, `licensed` nor `observed` — the
standard's `provenance` enum. It is recorded as `observed` (we observed the
sources) with `x_derived: true` and `x_sources`, so it validates and the
derivation is explicit. A `derived` provenance is proposed upstream.

## API

- `bestPrice(settings)` → a book.
- `book.apply(records)` — the applied `market` records (from `client.store.records("market")`).
- `book.markets()` / `book.models()` — every derived market, as a document / a model.
- `book.envelopes()` / `book.changes()` — the queued change envelopes (`snapshot` the first time, a Merge Patch after). Reading drains the queue; subscribers hear each change.
- `book.subscribe(fn)` — on every published change.
- `book.prune()` — drop markets whose sources have all gone stale.
- `book.stats()` — markets, sources, derive calls.
