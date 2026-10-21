import {describe,expect,it} from "vitest";
import {isMarketOpen} from "../src/domain/market-hours.js";

describe("horaires des marchés",()=>{
  it("ouvre Paris entre 09:00 et 17:30 heure locale",()=>{
    expect(isMarketOpen("INDEXEURO:PX1",new Date("2026-07-15T07:00:00Z"))).toBe(true);
    expect(isMarketOpen("INDEXEURO:PX1",new Date("2026-07-15T15:30:00Z"))).toBe(false);
  });
  it("ouvre les États-Unis entre 09:30 et 16:00 heure de New York",()=>{
    expect(isMarketOpen("INDEXNASDAQ:.IXIC",new Date("2026-07-15T13:30:00Z"))).toBe(true);
    expect(isMarketOpen("NASDAQ:MSFT",new Date("2026-07-15T13:30:00Z"))).toBe(true);
    expect(isMarketOpen("NASDAQ:META",new Date("2026-07-15T19:59:00Z"))).toBe(true);
    expect(isMarketOpen("NASDAQ:META",new Date("2026-07-15T20:00:00Z"))).toBe(false);
    expect(isMarketOpen("INDEXSP:.INX",new Date("2026-07-15T20:00:00Z"))).toBe(false);
  });
  it("gère la période où les changements d'heure US et français diffèrent",()=>{
    expect(isMarketOpen("INDEXNASDAQ:.IXIC",new Date("2026-03-20T13:30:00Z"))).toBe(true);
  });
  it("ferme les bourses le week-end et laisse les cryptos ouvertes",()=>{
    const saturday=new Date("2026-07-18T14:00:00Z");
    expect(isMarketOpen("INDEXEURO:PX1",saturday)).toBe(false);
    expect(isMarketOpen("INDEXNASDAQ:.IXIC",saturday)).toBe(false);
    expect(isMarketOpen("BTCEUR",saturday)).toBe(true);
    expect(isMarketOpen("CURRENCY:ETHEUR",saturday)).toBe(true);
  });
});
