import { describe, expect, it } from "vitest";
import { calculatePerformance, type PerformancePeriod } from "../src/domain/performance.js";

const period = (overrides: Partial<PerformancePeriod> = {}): PerformancePeriod => ({
  day: "2026-10-15",
  openingEconomicValueEur: "100",
  closingEconomicValueEur: "100",
  externalFlowEur: "0",
  distributedIncomeEur: "0",
  hasExactFlowValuation: true,
  hasCompletePrices: true,
  ...overrides,
});

describe("rendement pondéré dans le temps", () => {
  it("neutralise un apport externe", () => {
    const [result] = calculatePerformance([period({ closingEconomicValueEur: "150", externalFlowEur: "50" })]);
    expect(result?.periodReturn?.toString()).toBe("0");
    expect(result?.performanceIndex?.toString()).toBe("100");
  });

  it("neutralise une vente avec retrait", () => {
    const [result] = calculatePerformance([period({ closingEconomicValueEur: "60", externalFlowEur: "-40" })]);
    expect(result?.periodReturn?.toString()).toBe("0");
  });

  it("réintègre un dividende distribué une seule fois", () => {
    const [result] = calculatePerformance([period({ closingEconomicValueEur: "90", distributedIncomeEur: "10" })]);
    expect(result?.periodReturn?.toString()).toBe("0");
  });

  it("enchaîne les facteurs de rendement", () => {
    const results = calculatePerformance([
      period({ day: "2026-10-15", closingEconomicValueEur: "110" }),
      period({ day: "2026-10-16", openingEconomicValueEur: "110", closingEconomicValueEur: "99" }),
    ]);
    expect(results[1]?.performanceIndex?.toString()).toBe("99");
  });

  it("signale une estimation sans valorisation exacte au moment du flux", () => {
    const [result] = calculatePerformance([period({ closingEconomicValueEur: "150", externalFlowEur: "50", hasExactFlowValuation: false })]);
    expect(result?.status).toBe("ESTIMATED");
    expect(result?.reasons).toContain("END_OF_PERIOD_FLOW_ASSUMPTION");
  });

  it("refuse de produire un indice avec un prix ou un FX manquant", () => {
    const [result] = calculatePerformance([period({ hasCompletePrices: false })]);
    expect(result?.status).toBe("INCOMPLETE");
    expect(result?.performanceIndex).toBeNull();
  });
});
