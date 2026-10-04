# @openbook/react

React bindings for [`@openbook/core`](https://www.npmjs.com/package/@openbook/core).
One provider holds the connection; hooks read the cached documents.

```bash
npm install @openbook/react
```

```tsx
import { OpenBookProvider, useOpenBookDoc } from "@openbook/react";

function Market({ id }: { id: string }) {
  const market = useOpenBookDoc("market", id);
  if (!market) return null;
  return <span>{String(market.marketType)}</span>;
}

export function App() {
  return (
    <OpenBookProvider url="wss://edge.example/ws/openbook">
      <Market id="market-1" />
    </OpenBookProvider>
  );
}
```

## Provider

`OpenBookProvider` takes a `url` (the default WebSocket source), a custom
`source`, or an existing `client`. It owns the connection lifecycle. With none of
them it is a no-op and the hooks return empty.

## Hooks

| Hook | Returns |
| --- | --- |
| `useOpenBookClient()` | the client, or `null` |
| `useOpenBookDoc(object, id?)` | one document, or `undefined` |
| `useOpenBookDocs(object)` | every document of one type |
| `useOpenBookStatus()` | `connecting` / `live` / `reconnecting` / `closed` / `off` |
| `useOpenBookVersion()` | a number that changes on any update |
| `useOpenBookLastSequence()` | the resume cursor |

Subscriptions are built on `useSyncExternalStore`, so a component re-renders when
the documents it reads change. React 18+ is required.
