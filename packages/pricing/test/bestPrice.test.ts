import { describe, expect, it } from "vitest";
import type { AppliedRecord, ChangeEnvelope, OpenBookDoc } from "@openbook/core";
import { bestPrice } from "../src/bestPrice.js";

const at = "2026-10-04T00:00:00Z";

function record(
  fixture: string,
  source: string,
  outcomes: { side: string; odds: string }[],
  over: { datePublished?: string; status?: string; limit?: string } = {},
): AppliedRecord {
  const doc: OpenBookDoc = {
    openbookVersion: "0.3.0-draft",
    sequence: 1,
    dateModified: at,
    fixture,
    marketType: "market:moneyline",
    segment: "segment:soccer:full-time",
    source,
    provenance: "official",
    status: over.status ?? "open",
    limit: { amount: over.limit ?? "500" },
    outcomes,
  };
  const envelope = {
    openbookVersion: "0.3.0-draft",
    sequence: 1,
    datePublished: over.datePublished ?? at,
    publisher: source,
    object: "market",
    action: "snapshot",
    sport: "soccer",
    id: fixture,
    changes: doc,
  } as unknown as ChangeEnvelope;
  return { key: `market:${fixture}`, doc, envelope };
}

const HOME = { side: "home", odds: "2.10" };
const AWAY = { side: "away", odds: "1.80" };

describe("bestPrice", () => {
  it("takes the best odds per outcome and records the source that offered it", () => {
    const book = bestPrice({ publisher: "kaz-best" });
    book.apply([
      record("f1", "pinnacle", [{ side: "home", odds: "2.20" }, { side: "away", odds: "1.70" }]),
      record("f1", "draftkings", [{ side: "home", odds: "2.10" }, { side: "away", odds: "1.80" }]),
    ]);

    const markets = book.models();
    expect(markets).toHaveLength(1);
    const home = markets[0]!.outcomes.find((o) => o.side === "home")!;
    const away = markets[0]!.outcomes.find((o) => o.side === "away")!;
    // Best home is pinnacle's 2.20; best away is draftkings' 1.80.
    expect(home.odds).toBe("2.2");
    expect(home.source).toBe("pinnacle");
    expect(away.odds).toBe("1.8");
    expect(away.source).toBe("draftkings");
    expect(home.quoted).toBe(2);
  });

  it("marks the derived document as derived, with its sources", () => {
    const book = bestPrice({ publisher: "kaz-best" });
    book.apply([record("f1", "pinnacle", [HOME, AWAY]), record("f1", "draftkings", [HOME, AWAY])]);
    const doc = book.markets()[0]!;
    expect(doc).toMatchObject({ source: "kaz-best", provenance: "observed", x_derived: true });
    expect(doc.x_sources).toEqual(["pinnacle", "draftkings"]);
  });

  it("restricts to the configured sources", () => {
    const book = bestPrice({ sources: ["draftkings"] });
    book.apply([
      record("f1", "pinnacle", [{ side: "home", odds: "2.20" }]),
      record("f1", "draftkings", [{ side: "home", odds: "2.10" }]),
    ]);
    expect(book.models()[0]!.outcomes[0]!.odds).toBe("2.1");
    expect(book.models()[0]!.sources).toEqual(["draftkings"]);
  });

  it("withholds a market until minSources quote it", () => {
    const book = bestPrice({ minSources: 2 });
    book.apply([record("f1", "pinnacle", [HOME, AWAY])]);
    expect(book.markets()).toHaveLength(0);
    book.apply([record("f1", "draftkings", [HOME, AWAY])]);
    expect(book.markets()).toHaveLength(1);
  });

  it("applies our margin on top of the best price", () => {
    const raw = bestPrice({});
    raw.apply([record("f1", "pinnacle", [{ side: "home", odds: "2.00" }])]);
    const withMargin = bestPrice({ margin: 0.05 });
    withMargin.apply([record("f1", "pinnacle", [{ side: "home", odds: "2.00" }])]);
    // 2.00 at a 5% margin is 1/ (0.5 * 1.05) = 1.9048.
    expect(Number(raw.models()[0]!.outcomes[0]!.odds)).toBeCloseTo(2, 3);
    expect(Number(withMargin.models()[0]!.outcomes[0]!.odds)).toBeCloseTo(1.9048, 3);
  });

  it("queues one change per market when a batch carries every source at once", () => {
    const book = bestPrice({ publisher: "kaz-best" });
    book.apply([record("f1", "pinnacle", [HOME, AWAY]), record("f1", "draftkings", [HOME, AWAY])]);
    // Two sources, one market: one snapshot, not one per source.
    const envelopes = book.envelopes();
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]!.action).toBe("snapshot");
  });

  it("emits a snapshot then a Merge Patch update, and changes() only for what moved", () => {
    const book = bestPrice({ publisher: "kaz-best" });
    book.apply([record("f1", "pinnacle", [HOME, AWAY])]);

    const first = book.envelopes();
    expect(first).toHaveLength(1);
    expect(first[0]!.action).toBe("snapshot");
    expect(first[0]!.object).toBe("market");
    expect(first[0]!.x_derived).toBe(true);

    // No move: changes() is empty.
    expect(book.changes()).toHaveLength(0);

    book.apply([record("f1", "pinnacle", [{ side: "home", odds: "2.40" }, AWAY])]);
    const moved = book.changes();
    expect(moved).toHaveLength(1);
    expect(moved[0]!.action).toBe("update");
    // A patch carries only what moved.
    expect(Object.keys(moved[0]!.changes)).toContain("outcomes");
  });

  it("drops a stale source, and prune() forgets a market with none left", () => {
    let clock = Date.parse("2026-10-04T00:00:00Z");
    const book = bestPrice({ maxAgeMs: 1000, now: () => clock });
    book.apply([record("f1", "pinnacle", [{ side: "home", odds: "2.20" }]), record("f1", "draftkings", [{ side: "home", odds: "2.10" }])]);
    expect(book.models()[0]!.outcomes[0]!.source).toBe("pinnacle");

    // Everything ages out.
    clock += 5000;
    expect(book.prune()).toBe(1);
    expect(book.markets()).toHaveLength(0);
  });

  it("carries the tightest limit across the sources it is built from", () => {
    const book = bestPrice({});
    book.apply([record("f1", "pinnacle", [HOME, AWAY], { limit: "500" }), record("f1", "draftkings", [HOME, AWAY], { limit: "250" })]);
    expect(book.markets()[0]!.limit).toEqual({ amount: "250" });
  });

  it("subscribers hear each published change", () => {
    const seen: string[] = [];
    const book = bestPrice({ publisher: "kaz-best" });
    const off = book.subscribe((c) => seen.push(`${c.fixture}:${c.action}`));
    book.apply([record("f1", "pinnacle", [HOME, AWAY])]);
    book.changes();
    book.apply([record("f1", "pinnacle", [{ side: "home", odds: "2.50" }, AWAY])]);
    book.changes();
    off();
    expect(seen).toEqual(["f1:snapshot", "f1:update"]);
  });
});
