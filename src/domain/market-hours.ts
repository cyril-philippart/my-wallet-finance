export type MarketSchedule="PARIS"|"NEW_YORK"|"ALWAYS_OPEN";

const scheduleByTicker=(ticker:string):MarketSchedule=>{
  const normalized=ticker.toUpperCase().replace(/^CURRENCY:/,"");
  if(normalized==="BTCEUR"||normalized==="ETHEUR")return "ALWAYS_OPEN";
  if(
    normalized.startsWith("INDEXNASDAQ:")||normalized.startsWith("INDEXSP:")||
    normalized.startsWith("NASDAQ:")||normalized.startsWith("NYSE:")||
    normalized.startsWith("NYSEARCA:")||normalized.startsWith("OTCMKTS:")
  )return "NEW_YORK";
  return "PARIS";
};

const localParts=(date:Date,timeZone:string)=>{
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value??"";
  return{weekday:value("weekday"),minutes:Number(value("hour"))*60+Number(value("minute"))};
};

export function isMarketOpen(ticker:string,at=new Date()):boolean{
  const schedule=scheduleByTicker(ticker);if(schedule==="ALWAYS_OPEN")return true;
  const paris=schedule==="PARIS";
  const local=localParts(at,paris?"Europe/Paris":"America/New_York");
  if(local.weekday==="Sat"||local.weekday==="Sun")return false;
  const opening=paris?9*60:9*60+30;
  const closing=paris?17*60+30:16*60;
  return local.minutes>=opening&&local.minutes<closing;
}
