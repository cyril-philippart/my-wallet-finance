import { describe, expect, it } from "vitest";
import { projectLifeInsurance, type LifeInsuranceEvent } from "../src/domain/life-insurance.js";

describe("assurance-vie en fonds euros", () => {
  it("suit les versements, retraits et intérêts sans unités fictives", () => {
    const events: LifeInsuranceEvent[] = [
      { id: "1", occurredAt: "2024-01-01T00:00:00Z", sequence: 1, kind: "CONTRIBUTION", amount: "1000" },
      { id: "2", occurredAt: "2024-12-31T00:00:00Z", sequence: 1, kind: "INTEREST", amount: "20" },
      { id: "3", occurredAt: "2025-01-02T00:00:00Z", sequence: 1, kind: "WITHDRAWAL", amount: "100" },
    ];
    const state = projectLifeInsurance(events);
    expect(state.value.toString()).toBe("920");
    expect(state.netContributions.toString()).toBe("900");
    expect(state.earnedInterest.toString()).toBe("20");
  });

  it("une valorisation remplace la valeur constatée sans recréditer les intérêts", () => {
    const state = projectLifeInsurance([
      { id: "1", occurredAt: "2024-01-01T00:00:00Z", sequence: 1, kind: "CONTRIBUTION", amount: "1000" },
      { id: "2", occurredAt: "2024-12-31T00:00:00Z", sequence: 1, kind: "INTEREST", amount: "20" },
      { id: "3", occurredAt: "2025-01-01T00:00:00Z", sequence: 1, kind: "VALUATION", value: "1020" },
    ]);
    expect(state.value.toString()).toBe("1020");
    expect(state.earnedInterest.toString()).toBe("20");
  });

  it("refuse un retrait supérieur à la valeur du contrat", () => {
    expect(() => projectLifeInsurance([
      { id: "1", occurredAt: "2024-01-01T00:00:00Z", sequence: 1, kind: "CONTRIBUTION", amount: "100" },
      { id: "2", occurredAt: "2024-02-01T00:00:00Z", sequence: 1, kind: "WITHDRAWAL", amount: "101" },
    ])).toThrow("dépasse");
  });
});
