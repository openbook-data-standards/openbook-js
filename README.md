# openbook-js

JavaScript client for [OpenBook](https://github.com/openbook-data-standards/openbook),
the open standard for sportsbook & gambling data.

It reads an OpenBook feed — the standard's `change` envelopes over a WebSocket or
an HTTP snapshot — applies the JSON Merge Patch (`changes`), and caches the
documents by `(object, id)`. `@openbook/react` binds that cache to React.

- Framework-free core: `@openbook/core`.
- React provider and hooks: `@openbook/react`.
- Types generated from the standard's JSON Schema, so they cannot drift.

## Install

```bash
npm install @openbook/core
# or, in React
npm install @openbook/react
```

## Read a feed

```ts
import { OpenBookClient, webSocketSource } from "@openbook/core";

const client = new OpenBookClient({
  source: webSocketSource({ url: "wss://edge.example/ws/openbook" }),
  onObject: (key, doc, envelope) => {
    if (envelope.object === "market") render(key, doc);
  },
});
client.connect();

client.get("fixture", "fixture-1"); // the cached document, or undefined
```

A feed without a socket (server rendering, a worker, a smoke test) uses the
snapshot source; any other socket or API can implement the small `OpenBookSource`
seam:

```ts
import { snapshotSource } from "@openbook/core";
const source = snapshotSource({ url: "https://edge.example/openbook/snapshot" });
```

## React

```tsx
import { OpenBookProvider, useOpenBookDocs } from "@openbook/react";

function Board() {
  const markets = useOpenBookDocs("market");
  return <ul>{markets.map((m) => <li key={String(m.id)}>{String(m.marketType)}</li>)}</ul>;
}

export function App() {
  return (
    <OpenBookProvider url="wss://edge.example/ws/openbook">
      <Board />
    </OpenBookProvider>
  );
}
```

With no `url`, `source`, or `client`, the provider is a no-op and the hooks
return empty, so an app works with or without a configured feed.

## The wire

OpenBook has two tiers: reference objects (sport, league, participant, fixture,
market type, side) and a live tier (fixture, market, odds/change, score, grade,
lineup, series). Every message is one envelope: one `object`, one `action`, a
monotonic `sequence`, and `changes` as a JSON Merge Patch (absent = unchanged,
`null` = removed). See the standard's `change.schema.json`.

The vendor wire never reaches this client. A feed is translated to OpenBook at
its edge and re-published.

## Packages

| Package | What it is |
| --- | --- |
| [`@openbook/core`](packages/core) | Envelope types, Merge Patch, the document store, and the WebSocket and HTTP-snapshot sources. |
| [`@openbook/react`](packages/react) | `OpenBookProvider` and the `useOpenBook*` hooks. |

## Schema and versioning

`schema/` is a pinned copy of the standard's schemas (CC BY 4.0), and
`openbook-spec-version` is the version they were copied from. `scripts/gen-types.mjs`
turns them into `packages/core/src/types.generated.ts`; `scripts/sync-schema.mjs`
refreshes the copy and detects drift. npm versions track the spec version
(`0.3.x` while the spec is `0.3.0-draft`).

Do not edit `types.generated.ts` or `schema/` by hand:

```bash
npm run sync          # refresh schema/ + the stamp from the spec
npm run gen           # regenerate the types
npm run ci            # drift check, generated-types check, typecheck, test, build
```

## License

The code is Apache-2.0 (see `LICENSE`). The vendored schema files remain CC BY
4.0 (see `NOTICE` and `schema/LICENSE`).
