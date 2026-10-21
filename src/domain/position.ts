import Decimal from "decimal.js";
import { FinancialDomainError } from "./errors.js";
import { decimal, nonNegative, positive, type DecimalInput } from "./money.js";

export type TradeKind = "BUY" | "SELL";

export interface Trade {
  id: string;
  kind: TradeKind;
  occurredAt: string;
  sequence: number;
  currency: string;
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  fees: DecimalInput;
  fxToEur: DecimalInput;
}

export interface PositionState {
  currency: string | null;
  quantity: Decimal;
  historicalCostNative: Decimal;
  historicalCostEur: Decimal;
  realizedGainNative: Decimal;
  realizedGainEur: Decimal;
}

export const emptyPosition = (): PositionState => ({
  currency: null,
  quantity: decimal(0),
  historicalCostNative: decimal(0),
  historicalCostEur: decimal(0),
  realizedGainNative: decimal(0),
  realizedGainEur: decimal(0),
});

function validateCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new FinancialDomainError(`Devise invalide : ${currency}`);
  }
  return normalized;
}

export function applyTrade(state: PositionState, trade: Trade): PositionState {
  const currency = validateCurrency(trade.currency);
  if (state.currency !== null && state.currency !== currency) {
    throw new FinancialDomainError("Une position ne peut pas changer de devise de cotation.");
  }

  const quantity = positive(trade.quantity, "quantity");
  const unitPrice = nonNegative(trade.unitPrice, "unitPrice");
  const fees = nonNegative(trade.fees, "fees");
  const fx = positive(trade.fxToEur, "fxToEur");
  const gross = quantity.mul(unitPrice);

  if (trade.kind === "BUY") {
    const costNative = gross.add(fees);
    return {
      ...state,
      currency,
      quantity: state.quantity.add(quantity),
      historicalCostNative: state.historicalCostNative.add(costNative),
      historicalCostEur: state.historicalCostEur.add(costNative.mul(fx)),
    };
  }

  if (quantity.gt(state.quantity)) {
    throw new FinancialDomainError("La quantité vendue dépasse la position détenue.");
  }

  const ratio = quantity.div(state.quantity);
  const disposedCostNative = state.historicalCostNative.mul(ratio);
  const disposedCostEur = state.historicalCostEur.mul(ratio);
  const netProceedsNative = gross.sub(fees);
  const remainingQuantity = state.quantity.sub(quantity);
  const closesPosition = remainingQuantity.isZero();

  return {
    currency,
    quantity: remainingQuantity,
    historicalCostNative: closesPosition ? decimal(0) : state.historicalCostNative.sub(disposedCostNative),
    historicalCostEur: closesPosition ? decimal(0) : state.historicalCostEur.sub(disposedCostEur),
    realizedGainNative: state.realizedGainNative.add(netProceedsNative.sub(disposedCostNative)),
    realizedGainEur: state.realizedGainEur.add(netProceedsNative.mul(fx).sub(disposedCostEur)),
  };
}

export function projectPosition(trades: readonly Trade[]): PositionState {
  const ordered = [...trades].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id),
  );
  return ordered.reduce(applyTrade, emptyPosition());
}

export function averageUnitCostNative(state: PositionState): Decimal | null {
  return state.quantity.isZero() ? null : state.historicalCostNative.div(state.quantity);
}

export function averageUnitCostEur(state: PositionState): Decimal | null {
  return state.quantity.isZero() ? null : state.historicalCostEur.div(state.quantity);
}
