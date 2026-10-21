import Decimal from "decimal.js";
import { FinancialDomainError } from "./errors.js";
import { decimal, nonNegative, type DecimalInput } from "./money.js";

export type CalculationStatus = "READY" | "ESTIMATED" | "INCOMPLETE";

export interface PerformancePeriod {
  day: string;
  openingEconomicValueEur: DecimalInput;
  closingEconomicValueEur: DecimalInput;
  externalFlowEur: DecimalInput;
  distributedIncomeEur: DecimalInput;
  hasExactFlowValuation: boolean;
  hasCompletePrices: boolean;
}

export interface PerformanceResult {
  day: string;
  periodReturn: Decimal | null;
  performanceIndex: Decimal | null;
  status: CalculationStatus;
  reasons: string[];
}

/**
 * Convention V1 : tous les flux sont considérés en fin de sous-période.
 * La valeur de clôture est observée après le flux. Un apport est retiré du
 * numérateur, un retrait est réintégré et un revenu distribué est ajouté.
 */
export function calculatePerformance(
  periods: readonly PerformancePeriod[],
  baseIndex: DecimalInput = 100,
): PerformanceResult[] {
  let index = nonNegative(baseIndex, "baseIndex");

  return periods.map((period) => {
    const opening = nonNegative(period.openingEconomicValueEur, "openingEconomicValueEur");
    const closing = nonNegative(period.closingEconomicValueEur, "closingEconomicValueEur");
    const flow = decimal(period.externalFlowEur);
    const distributedIncome = nonNegative(period.distributedIncomeEur, "distributedIncomeEur");
    const reasons: string[] = [];

    if (!period.hasCompletePrices) {
      return {
        day: period.day,
        periodReturn: null,
        performanceIndex: null,
        status: "INCOMPLETE",
        reasons: ["PRICE_OR_FX_MISSING"],
      };
    }

    if (opening.isZero()) {
      const isInitialFunding = closing.eq(flow) && distributedIncome.isZero();
      if (!isInitialFunding) {
        throw new FinancialDomainError("Un rendement ne peut pas être calculé avec une valeur d'ouverture nulle.");
      }
      return {
        day: period.day,
        periodReturn: decimal(0),
        performanceIndex: index,
        status: period.hasExactFlowValuation ? "READY" : "ESTIMATED",
        reasons: period.hasExactFlowValuation ? [] : ["END_OF_PERIOD_FLOW_ASSUMPTION"],
      };
    }

    if (!period.hasExactFlowValuation && (!flow.isZero() || !distributedIncome.isZero())) {
      reasons.push("END_OF_PERIOD_FLOW_ASSUMPTION");
    }

    const adjustedClosing = closing.sub(flow).add(distributedIncome);
    const periodReturn = adjustedClosing.div(opening).sub(1);
    index = index.mul(periodReturn.add(1));

    return {
      day: period.day,
      periodReturn,
      performanceIndex: index,
      status: reasons.length === 0 ? "READY" : "ESTIMATED",
      reasons,
    };
  });
}
