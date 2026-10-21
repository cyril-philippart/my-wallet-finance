import { describe, expect, it } from "vitest";
import { cashEffect } from "../src/domain/cash-flow.js";

describe("contrat métier des flux", () => {
  it("traite une vente retirée comme un flux externe négatif", () => {
    const effect = cashEffect({ kind: "SELL", netAmount: "120", fxToEur: "1", destination: "EXTERNAL" });
    expect(effect.externalFlow.toString()).toBe("-120");
    expect(effect.technicalCashDelta.isZero()).toBe(true);
  });

  it("conserve explicitement une vente dans la réserve", () => {
    const effect = cashEffect({ kind: "SELL", netAmount: "120", fxToEur: "1", destination: "TECHNICAL_CASH" });
    expect(effect.externalFlow.isZero()).toBe(true);
    expect(effect.technicalCashDelta.toString()).toBe("120");
  });

  it("calcule l'apport complémentaire d'un achat mixte", () => {
    const effect = cashEffect({ kind: "BUY", netAmount: "150", fxToEur: "1", source: "MIXED", technicalCashUsed: "100" });
    expect(effect.technicalCashDelta.toString()).toBe("-100");
    expect(effect.externalFlow.toString()).toBe("50");
  });

  it("compte une seule fois un dividende distribué", () => {
    const effect = cashEffect({ kind: "DIVIDEND", netAmount: "10", fxToEur: "1", destination: "EXTERNAL" });
    expect(effect.externalFlow.isZero()).toBe(true);
    expect(effect.distributedIncome.toString()).toBe("10");
    expect(effect.earnedIncome.toString()).toBe("10");
  });

  it("refuse une réserve supérieure au coût de l'achat", () => {
    expect(() => cashEffect({ kind: "BUY", netAmount: "100", fxToEur: "1", source: "MIXED", technicalCashUsed: "101" })).toThrow("dépasse");
  });
});
