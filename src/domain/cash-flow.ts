import Decimal from "decimal.js";
import { FinancialDomainError } from "./errors.js";
import { decimal, nonNegative, positive, type DecimalInput } from "./money.js";

export type FundsDestination = "EXTERNAL" | "TECHNICAL_CASH";
export type AcquisitionSource = "EXTERNAL" | "TECHNICAL_CASH" | "MIXED";

export type CashEvent =
  | { kind: "BUY"; netAmount: DecimalInput; fxToEur: DecimalInput; source: AcquisitionSource; technicalCashUsed?: DecimalInput }
  | { kind: "SELL"; netAmount: DecimalInput; fxToEur: DecimalInput; destination: FundsDestination }
  | { kind: "DIVIDEND"; netAmount: DecimalInput; fxToEur: DecimalInput; destination: FundsDestination };

export interface CashEffect {
  technicalCashDelta: Decimal;
  externalFlow: Decimal;
  distributedIncome: Decimal;
  earnedIncome: Decimal;
}

export function cashEffect(event: CashEvent): CashEffect {
  const amount = nonNegative(event.netAmount, "netAmount");
  positive(event.fxToEur, "fxToEur");
  const zero = decimal(0);

  if (event.kind === "SELL") {
    return event.destination === "EXTERNAL"
      ? { technicalCashDelta: zero, externalFlow: amount.negated(), distributedIncome: zero, earnedIncome: zero }
      : { technicalCashDelta: amount, externalFlow: zero, distributedIncome: zero, earnedIncome: zero };
  }

  if (event.kind === "DIVIDEND") {
    return event.destination === "EXTERNAL"
      ? { technicalCashDelta: zero, externalFlow: zero, distributedIncome: amount, earnedIncome: amount }
      : { technicalCashDelta: amount, externalFlow: zero, distributedIncome: zero, earnedIncome: amount };
  }

  const used = nonNegative(event.technicalCashUsed ?? 0, "technicalCashUsed");
  if (used.gt(amount)) {
    throw new FinancialDomainError("La réserve utilisée dépasse le coût de l'achat.");
  }
  if (event.source === "EXTERNAL" && !used.isZero()) {
    throw new FinancialDomainError("Un achat externe ne peut pas consommer la réserve technique.");
  }
  if (event.source === "TECHNICAL_CASH" && !used.eq(amount)) {
    throw new FinancialDomainError("Un achat financé par la réserve doit être intégralement couvert.");
  }
  if (event.source === "MIXED" && (used.isZero() || used.eq(amount))) {
    throw new FinancialDomainError("Un financement mixte doit combiner réserve et apport externe.");
  }

  return {
    technicalCashDelta: used.negated(),
    externalFlow: amount.sub(used),
    distributedIncome: zero,
    earnedIncome: zero,
  };
}
