export function normalizeTicker(value:string):string{
  const ticker=value.trim().toUpperCase();
  return ticker==="CURRENCY:BTCEUR"?"BTCEUR":ticker==="CURRENCY:ETHEUR"?"ETHEUR":ticker;
}
