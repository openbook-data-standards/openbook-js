// Transports. A `Source` is anything that can hand the client OpenBook envelope
// records and report a connection status. Two first-party sources ship here: a
// WebSocket source for a live feed (`ws /ws/openbook`) and an HTTP snapshot
// source for a client without a socket, server rendering, tests, or first paint.
// Any other socket or API can feed the same seam.
import type { EnvelopeRecord, OpenBookStatus } from "./types.js";

export interface SourceContext {
  /** The last applied sequence, so a reconnect can resume instead of re-reading. */
  since: () => number;
  /** Hand envelope records to the client (an array per frame). */
  records: (records: EnvelopeRecord[]) => void;
  /** Report connection state. */
  status: (status: OpenBookStatus) => void;
}

export interface OpenBookSource {
  readonly name: string;
  start(context: SourceContext): void;
  stop(): void;
}

/** The frames the OpenBook edge sends over the socket. */
export interface OpenBookFrame {
  type?: string;
  specVersion?: string;
  count?: number;
  from?: number;
  envelopes?: EnvelopeRecord[];
  records?: EnvelopeRecord[];
  message?: string;
}

function parseFrame(raw: unknown): OpenBookFrame | null {
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as OpenBookFrame) : (raw as OpenBookFrame);
  } catch {
    return null;
  }
}

function withCursor(base: string, since: number, events?: string[]): string {
  const url = new URL(base);
  if (since > 0) url.searchParams.set("since", String(since));
  if (events?.length) url.searchParams.set("events", events.join(","));
  return url.toString();
}

export interface WebSocketSourceOptions {
  /** Absolute socket URL, e.g. `wss://edge.example/ws/openbook`. */
  url: string;
  /** Filter to these fixture/object ids. */
  events?: string[];
  /** Injectable for tests and non-browser runtimes. */
  WebSocketImpl?: typeof WebSocket;
  /** Cap for the reconnect backoff. Default 30000. */
  maxBackoffMs?: number;
}

/**
 * The live source: connects to the OpenBook fanout, resumes from the client's
 * cursor, and reconnects with capped exponential backoff. The store survives a
 * reconnect, so the board is never blank while the socket re-establishes.
 */
export function webSocketSource(options: WebSocketSourceOptions): OpenBookSource {
  const maxBackoff = options.maxBackoffMs ?? 30_000;
  let socket: WebSocket | null = null;
  let context: SourceContext | null = null;
  let stopped = true;
  let backoff = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (): void => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const delay = Math.min(backoff, maxBackoff);
    backoff = Math.min(backoff * 2, maxBackoff);
    timer = setTimeout(connect, delay);
  };

  function connect(): void {
    if (stopped || !context) return;
    const Impl = options.WebSocketImpl ?? (typeof WebSocket !== "undefined" ? WebSocket : undefined);
    if (!Impl) {
      context.status("off");
      return;
    }
    const ctx = context;
    ctx.status("connecting");
    let ws: WebSocket;
    try {
      ws = new Impl(withCursor(options.url, ctx.since(), options.events));
    } catch {
      schedule();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      backoff = 1000;
      ctx.status("live");
    };
    ws.onmessage = (event: MessageEvent) => {
      const frame = parseFrame(event.data);
      if (!frame) return;
      const records = frame.envelopes ?? frame.records;
      if (Array.isArray(records)) ctx.records(records);
      if (frame.type === "hello" || frame.type === "snapshot" || frame.type === "resume") ctx.status("live");
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (stopped) return;
      ctx.status("reconnecting");
      schedule();
    };
    ws.onerror = () => {
      // The close handler owns recovery.
    };
  }

  return {
    name: "websocket",
    start(ctx) {
      context = ctx;
      stopped = false;
      backoff = 1000;
      connect();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const ws = socket;
      socket = null;
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* already closing */
        }
      }
    },
  };
}

export interface SnapshotSourceOptions {
  /** Absolute URL of the snapshot endpoint, e.g. `https://edge.example/openbook/snapshot`. */
  url: string;
  /** Injectable for tests and non-browser runtimes. */
  fetchImpl?: typeof fetch;
}

/**
 * The read-once source: fetches the recent envelopes over HTTP. Use it where a
 * socket cannot be held (server rendering, a worker, a smoke test) or to paint
 * the first picture before the socket opens.
 */
export function snapshotSource(options: SnapshotSourceOptions): OpenBookSource {
  let controller: AbortController | null = null;
  let stopped = false;

  return {
    name: "snapshot",
    start(ctx) {
      stopped = false;
      ctx.status("connecting");
      const f = options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
      if (!f) {
        ctx.status("off");
        return;
      }
      const url = withCursor(options.url, ctx.since());
      if (typeof AbortController !== "undefined") controller = new AbortController();
      f(url, controller ? { signal: controller.signal } : undefined)
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return res.json() as Promise<{ envelopes?: EnvelopeRecord[]; records?: EnvelopeRecord[] }>;
        })
        .then((body) => {
          if (stopped) return;
          const records = body.envelopes ?? body.records;
          if (Array.isArray(records)) ctx.records(records);
          ctx.status("live");
        })
        .catch(() => {
          if (!stopped) ctx.status("closed");
        });
    },
    stop() {
      stopped = true;
      controller?.abort();
      controller = null;
    },
  };
}
