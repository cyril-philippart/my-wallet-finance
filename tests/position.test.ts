import { describe, expect, it } from "vitest";
import { averageUnitCostEur, averageUnitCostNative, projectPosition, type Trade } from "../src/domain/position.js";

const trade = (overrides: Partial<Trade>): Trade => ({
  id: "t1",
  kind: "BUY",
  occurredAt: "2026-01-01T10:00:00Z",
  sequence: 1,
  currency: "EUR",
  quantity: "10",
  unitPrice: "10",
  fees: "2",
  fxToEur: "1",
  ...overrides,
});

describe("projection d'une position au PRU moyen mobile", () => {
  it("inclut les frais de deux achats dans le PRU", () => {
    const state = projectPosition([
      trade({ id: "a", quantity: "10", unitPrice: "10", fees: "2" }),
      trade({ id: "b", occurredAt: "2026-01-02T10:00:00Z", quantity: "5", unitPrice: "20", fees: "1" }),
    ]);

    expect(state.quantity.toString()).toBe("15");
    expect(state.historicalCostNative.toString()).toBe("203");
    expect(averageUnitCostNative(state)?.toFixed(8)).toBe("13.53333333");
  });

  it("conserve le PRU après une vente partielle et calcule le gain net", () => {
    const state = projectPosition([
      trade({ id: "a", quantity: "10", unitPrice: "10", fees: "0" }),
      trade({ id: "b", kind: "SELL", occurredAt: "2026-02-01T10:00:00Z", quantity: "4", unitPrice: "15", fees: "2" }),
    ]);

    expect(state.quantity.toString()).toBe("6");
    expect(averageUnitCostNative(state)?.toString()).toBe("10");
    expect(state.realizedGainNative.toString()).toBe("18");
    expect(state.realizedGainEur.toString()).toBe("18");
  });

  it("utilise le coût EUR historique et le FX de vente", () => {
    const state = projectPosition([
      trade({ id: "a", currency: "USD", quantity: "10", unitPrice: "10", fees: "0", fxToEur: "0.8" }),
      trade({ id: "b", kind: "SELL", currency: "USD", occurredAt: "2026-02-01T10:00:00Z", quantity: "10", unitPrice: "10", fees: "0", fxToEur: "1" }),
    ]);

    expect(state.realizedGainNative.toString()).toBe("0");
    expect(state.realizedGainEur.toString()).toBe("20");
    expect(averageUnitCostEur(state)).toBeNull();
  });

  it("refuse une vente supérieure à la quantité détenue", () => {
    expect(() => projectPosition([
      trade({ id: "a", quantity: "1" }),
      trade({ id: "b", kind: "SELL", occurredAt: "2026-02-01T10:00:00Z", quantity: "2" }),
    ])).toThrow("dépasse");
  });

  it("rejoue les transactions dans l'ordre métier", () => {
    const state = projectPosition([
      trade({ id: "sell", kind: "SELL", occurredAt: "2026-01-02T10:00:00Z", quantity: "1", unitPrice: "12", fees: "0" }),
      trade({ id: "buy", occurredAt: "2026-01-01T10:00:00Z", quantity: "1", unitPrice: "10", fees: "0" }),
    ]);

    expect(state.quantity.isZero()).toBe(true);
    expect(state.realizedGainNative.toString()).toBe("2");
  });
});
