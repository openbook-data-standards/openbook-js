import { describe, expect, it, vi } from "vitest";
import { snapshotSource, sseSource, webSocketSource } from "../src/sources.js";
import type { EnvelopeRecord, OpenBookStatus } from "../src/types.js";

const rec = (seq: number): EnvelopeRecord =>
  ({
    seq,
    topic: `openbook/v1/test/soccer/fixture/f1/snapshot`,
    at: "2026-10-04T00:00:00Z",
    envelope: {
      openbookVersion: "0.3.0-draft",
      sequence: seq,
      datePublished: "2026-10-04T00:00:00Z",
      publisher: "test",
      object: "fixture",
      action: "snapshot",
      sport: "soccer",
      id: "f1",
      changes: { id: "f1" },
    },
  }) as EnvelopeRecord;

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent);
  }
}

describe("webSocketSource", () => {
  it("connects, delivers frames, and resumes from the cursor", () => {
    FakeSocket.instances = [];
    const statuses: OpenBookStatus[] = [];
    const received: EnvelopeRecord[][] = [];
    let cursor = 7;
    const source = webSocketSource({
      url: "wss://edge.example/ws/openbook",
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    });
    source.start({
      since: () => cursor,
      records: (rs) => received.push(rs),
      status: (s) => statuses.push(s),
    });

    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe("wss://edge.example/ws/openbook?since=7");
    socket.onopen?.();
    socket.emit({ type: "snapshot", envelopes: [rec(8)] });
    socket.emit({ type: "openbook", records: [rec(9)] });

    expect(statuses).toContain("live");
    expect(received).toEqual([[rec(8)], [rec(9)]]);

    cursor = 9;
    source.stop();
    expect(socket.closed).toBe(true);
  });
});

describe("snapshotSource", () => {
  it("reads the snapshot over HTTP", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ envelopes: [rec(1)] }),
    })) as unknown as typeof fetch;
    const statuses: OpenBookStatus[] = [];
    const received: EnvelopeRecord[][] = [];

    snapshotSource({ url: "https://edge.example/openbook/snapshot", fetchImpl }).start({
      since: () => 0,
      records: (rs) => received.push(rs),
      status: (s) => statuses.push(s),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchImpl).toHaveBeenCalledWith("https://edge.example/openbook/snapshot", expect.anything());
    expect(received).toEqual([[rec(1)]]);
    expect(statuses).toContain("live");
  });
});

describe("sseSource", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    private listeners = new Map<string, ((event: MessageEvent) => void)[]>();
    constructor(public url: string) {
      FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, fn: (event: MessageEvent) => void): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type: string, data: unknown): void {
      for (const fn of this.listeners.get(type) ?? []) fn({ data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent);
    }
    close(): void {
      this.closed = true;
    }
  }

  it("resolves a relative URL against an origin and reads the named event", () => {
    FakeEventSource.instances = [];
    const statuses: OpenBookStatus[] = [];
    const received: EnvelopeRecord[][] = [];
    const record = rec(7);
    sseSource({
      url: "/openbook/stream",
      EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
    }).start({
      since: () => 0,
      records: (rs) => received.push(rs),
      status: (s) => statuses.push(s),
    });

    const es = FakeEventSource.instances[0]!;
    expect(es.url).toMatch(/^https?:\/\/.+\/openbook\/stream/);
    es.onopen?.();
    expect(statuses).toContain("live");

    // The edge sends `event: openbook`; each data line is one record.
    es.emit("openbook", record);
    expect(received).toEqual([[record]]);
  });

  it("ignores a frame without an envelope and stops cleanly", () => {
    FakeEventSource.instances = [];
    const received: EnvelopeRecord[][] = [];
    const source = sseSource({ url: "https://edge.example/openbook/stream", EventSourceImpl: FakeEventSource as unknown as typeof EventSource });
    source.start({ since: () => 0, records: (rs) => received.push(rs), status: () => undefined });
    const es = FakeEventSource.instances[0]!;
    es.emit("openbook", { hello: true });
    expect(received).toHaveLength(0);
    source.stop();
    expect(es.closed).toBe(true);
  });
});
