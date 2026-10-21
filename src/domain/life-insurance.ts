import Decimal from "decimal.js";
import { FinancialDomainError } from "./errors.js";
import { decimal, nonNegative, type DecimalInput } from "./money.js";

export type LifeInsuranceEvent =
  | { id: string; occurredAt: string; sequence: number; kind: "CONTRIBUTION"; amount: DecimalInput }
  | { id: string; occurredAt: string; sequence: number; kind: "WITHDRAWAL"; amount: DecimalInput }
  | { id: string; occurredAt: string; sequence: number; kind: "INTEREST"; amount: DecimalInput }
  | { id: string; occurredAt: string; sequence: number; kind: "VALUATION"; value: DecimalInput };

export interface LifeInsuranceState {
  value: Decimal;
  netContributions: Decimal;
  earnedInterest: Decimal;
  lastValuationAt: string | null;
}

export function projectLifeInsurance(events: readonly LifeInsuranceEvent[]): LifeInsuranceState {
  const ordered = [...events].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id),
  );

  return ordered.reduce<LifeInsuranceState>((state, event) => {
    if (event.kind === "VALUATION") {
      return { ...state, value: nonNegative(event.value, "value"), lastValuationAt: event.occurredAt };
    }

    const amount = nonNegative(event.amount, "amount");
    if (event.kind === "CONTRIBUTION") {
      return { ...state, value: state.value.add(amount), netContributions: state.netContributions.add(amount) };
    }
    if (event.kind === "INTEREST") {
      return { ...state, value: state.value.add(amount), earnedInterest: state.earnedInterest.add(amount) };
    }
    if (amount.gt(state.value)) {
      throw new FinancialDomainError("Le retrait dépasse la valeur constatée du contrat.");
    }
    return { ...state, value: state.value.sub(amount), netContributions: state.netContributions.sub(amount) };
  }, {
    value: decimal(0),
    netContributions: decimal(0),
    earnedInterest: decimal(0),
    lastValuationAt: null,
  });
}
