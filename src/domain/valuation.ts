import Decimal from "decimal.js";
import { nonNegative, positive, type DecimalInput } from "./money.js";

export interface PositionValuationInput {
  quantity: DecimalInput;
  price: DecimalInput | null;
  fxToEur: DecimalInput | null;
  priceIsStale: boolean;
}

export type ValuationStatus = "READY" | "STALE" | "INCOMPLETE";

export interface PositionValuation {
  marketValueEur: Decimal | null;
  status: ValuationStatus;
  reasons: string[];
}

export function valuePosition(input: PositionValuationInput): PositionValuation {
  const quantity = nonNegative(input.quantity, "quantity");
  const reasons: string[] = [];

  if (input.price === null) reasons.push("PRICE_MISSING");
  if (input.fxToEur === null) reasons.push("FX_MISSING");
  if (input.price === null || input.fxToEur === null) {
    return { marketValueEur: null, status: "INCOMPLETE", reasons };
  }

  const price = positive(input.price, "price");
  const fx = positive(input.fxToEur, "fxToEur");
  if (input.priceIsStale) reasons.push("PRICE_STALE");

  return {
    marketValueEur: quantity.mul(price).mul(fx),
    status: reasons.length === 0 ? "READY" : "STALE",
    reasons,
  };
}
