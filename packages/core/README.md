# @openbook/core

Framework-free client for an OpenBook feed. It opens one source, applies the
standard's `change` envelopes to a document store, and lets you read the cache.

```bash
npm install @openbook/core
```

## Sources

- `webSocketSource({ url, events?, WebSocketImpl? })` — the live fanout. Resumes
  from the store's last sequence on reconnect, with capped exponential backoff.
- `snapshotSource({ url, fetchImpl? })` — reads the recent envelopes once over
  HTTP, for a client without a socket.

Bring your own by implementing `OpenBookSource`:

```ts
interface OpenBookSource {
  readonly name: string;
  start(context: {
    since: () => number;
    records: (records: EnvelopeRecord[]) => void;
    status: (status: OpenBookStatus) => void;
  }): void;
  stop(): void;
}
```

## Store and Merge Patch

`OpenBookStore` keys documents by `(object, id)`. A `snapshot`/`create` replaces
the document; every other action is a JSON Merge Patch. `applyMergePatch` and
`mergePatch` (RFC 7386) are exported for callers that build or inspect patches.

## Types

`types.generated.ts` is generated from the standard's JSON Schema. Import the
document types (`Fixture`, `Market`, `OddsChange`, ...) and `ChangeEnvelope`.
Unknown fields are preserved (the standard requires a consumer to ignore them),
so documents are read as `Record<string, unknown>` with the generated types
available for the known shape.
