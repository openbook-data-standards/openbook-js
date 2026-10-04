import { useEffect, useMemo, type ReactNode } from "react";
import { OpenBookClient, webSocketSource, type OpenBookSource } from "@openbook/core";
import { OpenBookContext } from "./context.js";

export interface OpenBookProviderProps {
  /** Socket URL for the default source, e.g. `wss://edge.example/ws/openbook`. */
  url?: string;
  /** A custom source, instead of `url`. */
  source?: OpenBookSource;
  /** An existing client to adopt; the provider owns its lifecycle. */
  client?: OpenBookClient;
  /** Filter the default socket source to these fixture/object ids. */
  events?: string[];
  /** Injectable WebSocket, for tests or a custom runtime. */
  WebSocketImpl?: typeof WebSocket;
  children: ReactNode;
}

/**
 * Holds one OpenBook connection for the tree. Pass `url`, a `source`, or a
 * `client`. With none of them the provider is a no-op and the hooks return
 * empty, so an app works with or without a configured feed.
 */
export function OpenBookProvider({ url, source, client, events, WebSocketImpl, children }: OpenBookProviderProps) {
  const value = useMemo(() => {
    if (client) return client;
    const resolved = source ?? (url ? webSocketSource({ url, events, WebSocketImpl }) : null);
    return resolved ? new OpenBookClient({ source: resolved }) : null;
  }, [client, source, url, events, WebSocketImpl]);

  useEffect(() => {
    if (!value) return;
    value.connect();
    return () => value.close();
  }, [value]);

  return <OpenBookContext.Provider value={value}>{children}</OpenBookContext.Provider>;
}
