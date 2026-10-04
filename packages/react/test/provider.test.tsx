import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { OpenBookClient, OpenBookStore } from "@openbook/core";
import { OpenBookProvider, useOpenBookDoc, useOpenBookStatus } from "../src/index.js";

function Probe() {
  const doc = useOpenBookDoc("fixture", "f1");
  const status = useOpenBookStatus();
  return (
    <span>
      {status}:{String(doc?.id ?? "none")}
    </span>
  );
}

describe("@openbook/react", () => {
  it("renders children and reads the cache for a preloaded client", () => {
    const store = new OpenBookStore();
    store.apply({
      seq: 1,
      topic: "openbook/v1/test/soccer/fixture/f1/snapshot",
      at: "2026-10-04T00:00:00Z",
      envelope: {
        openbookVersion: "0.3.0-draft",
        sequence: 1,
        datePublished: "2026-10-04T00:00:00Z",
        publisher: "test",
        object: "fixture",
        action: "snapshot",
        sport: "soccer",
        id: "f1",
        changes: { id: "f1" },
      },
    } as never);
    const client = new OpenBookClient({ source: { name: "test", start() {}, stop() {} }, store });

    const html = renderToString(
      <OpenBookProvider client={client}>
        <Probe />
      </OpenBookProvider>,
    );
    expect(html).toContain("closed");
    expect(html).toContain("f1");
  });

  it("is a no-op without a feed", () => {
    const html = renderToString(
      <OpenBookProvider>
        <Probe />
      </OpenBookProvider>,
    );
    expect(html).toContain("off");
    expect(html).toContain("none");
  });
});
