import Decimal from "decimal.js";
import { FinancialDomainError } from "./errors.js";

Decimal.set({ precision: 48, rounding: Decimal.ROUND_HALF_EVEN });

export type DecimalInput = Decimal.Value;

export function decimal(value: DecimalInput): Decimal {
  const result = new Decimal(value);
  if (!result.isFinite()) {
    throw new FinancialDomainError("Une valeur financière doit être finie.");
  }
  return result;
}

export function nonNegative(value: DecimalInput, field: string): Decimal {
  const result = decimal(value);
  if (result.isNegative()) {
    throw new FinancialDomainError(`${field} ne peut pas être négatif.`);
  }
  return result;
}

export function positive(value: DecimalInput, field: string): Decimal {
  const result = decimal(value);
  if (!result.isPositive()) {
    throw new FinancialDomainError(`${field} doit être strictement positif.`);
  }
  return result;
}
