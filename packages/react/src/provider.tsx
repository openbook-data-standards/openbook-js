import { useEffect, useMemo, type ReactNode } from "react";
import { OpenBookClient, webSocketSource, sseSource, type OpenBookSource } from "@openbook/core";
import { OpenBookContext } from "./context.js";

export interface OpenBookProviderProps {
  /** URL for the default source, e.g. `/openbook/stream` (SSE) or `wss://edge.example/ws/openbook`. */
  url?: string;
  /** The default source transport; SSE is the browser default. */
  transport?: "sse" | "ws";
  /** A custom source, instead of `url`. */
  source?: OpenBookSource;
  /** An existing client to adopt; the provider owns its lifecycle. */
  client?: OpenBookClient;
  /** Filter the default source to these fixture/object ids. */
  events?: string[];
  /** Injectable WebSocket, for tests or a custom runtime (ignored by SSE). */
  WebSocketImpl?: typeof WebSocket;
  /** Injectable EventSource, for tests or a custom runtime (ignored by WS). */
  EventSourceImpl?: typeof EventSource;
  children: ReactNode;
}

/**
 * Holds one OpenBook connection for the tree. Pass `url`, a `source`, or a
 * `client`. With none of them the provider is a no-op and the hooks return
 * empty, so an app works with or without a configured feed.
 *
 * A browser takes SSE (`transport` defaults to `"sse"`); a runtime without
 * `EventSource` passes `transport="ws"` or its own `source`.
 */
export function OpenBookProvider({ url, transport = "sse", source, client, events, WebSocketImpl, EventSourceImpl, children }: OpenBookProviderProps) {
  const value = useMemo(() => {
    if (client) return client;
    const resolved =
      source ??
      (url
        ? transport === "ws"
          ? webSocketSource({ url, events, WebSocketImpl })
          : sseSource({ url, events, EventSourceImpl })
        : null);
    return resolved ? new OpenBookClient({ source: resolved }) : null;
  }, [client, source, url, transport, events, WebSocketImpl, EventSourceImpl]);

  useEffect(() => {
    if (!value) return;
    value.connect();
    return () => value.close();
  }, [value]);

  return <OpenBookContext.Provider value={value}>{children}</OpenBookContext.Provider>;
}
