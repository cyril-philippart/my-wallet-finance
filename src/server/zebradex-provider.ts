import "server-only";

interface ZebraDexResponse {
  ok:boolean;current_value:number;current_cost:number;profit:number;profit_pct:number;
  change_1d:number;change_1d_pct:number;change_period:number;change_period_pct:number;
  raw?:{labels?:string[];items_count?:number;items_with_history?:number;items_without_history?:number};
}

export interface PokemonSummary {
  currentValueEur:string;investedEur:string;gainEur:string;performancePct:string;
  dayAmountEur:string;dayPercent:string;sevenDayAmountEur:string;sevenDayPercent:string;
  fifteenDayAmountEur:string;fifteenDayPercent:string;itemsCount:number|null;updatedOn:string|null;
}

const percent=(ratio:number)=>String(ratio*100);

async function fetchPeriod(contextId:string,days:7|15):Promise<ZebraDexResponse>{
  const base=(process.env.ZEBRADEX_API_URL??"https://zebradex-proxy.onrender.com").replace(/\/$/,"");
  const response=await fetch(`${base}/zebradex/value?context_id=${encodeURIComponent(contextId)}&days=${days}`,{next:{revalidate:900}});
  if(!response.ok)throw new Error(`ZebraDex HTTP ${response.status}`);
  const data=await response.json() as ZebraDexResponse;
  if(!data.ok)throw new Error("ZebraDex a refusé la demande.");
  return data;
}

export async function getPokemonSummary():Promise<PokemonSummary|null>{
  const contextId=process.env.ZEBRADEX_CONTEXT_ID?.trim()??"20aa5517d7d3d84548b013f5";
  try{
    const[data7,data15]=await Promise.all([fetchPeriod(contextId,7),fetchPeriod(contextId,15)]);
    const labels=data7.raw?.labels??[];
    return{
      currentValueEur:String(data7.current_value),investedEur:String(data7.current_cost),gainEur:String(data7.profit),performancePct:percent(data7.profit_pct),
      dayAmountEur:String(data7.change_1d),dayPercent:percent(data7.change_1d_pct),sevenDayAmountEur:String(data7.change_period),sevenDayPercent:percent(data7.change_period_pct),
      fifteenDayAmountEur:String(data15.change_period),fifteenDayPercent:percent(data15.change_period_pct),itemsCount:data7.raw?.items_count??null,updatedOn:labels.at(-1)??null,
    };
  }catch(error){console.error("Synchronisation ZebraDex impossible",error);return null;}
}
