import { describe, expect, it } from "vitest";
import { valuePosition } from "../src/domain/valuation.js";

describe("valorisation des positions", () => {
  it("convertit une position en EUR", () => {
    const result = valuePosition({ quantity: "2.5", price: "100", fxToEur: "0.92", priceIsStale: false });
    expect(result.marketValueEur?.toString()).toBe("230");
    expect(result.status).toBe("READY");
  });

  it("ne remplace jamais un prix absent par zéro", () => {
    const result = valuePosition({ quantity: "2", price: null, fxToEur: "1", priceIsStale: false });
    expect(result.marketValueEur).toBeNull();
    expect(result.status).toBe("INCOMPLETE");
  });

  it("signale un prix périmé tout en conservant la valeur", () => {
    const result = valuePosition({ quantity: "2", price: "10", fxToEur: "1", priceIsStale: true });
    expect(result.marketValueEur?.toString()).toBe("20");
    expect(result.status).toBe("STALE");
  });
});
