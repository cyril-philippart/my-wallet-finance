import "server-only";
import {database} from "./database.js";

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

async function ensureCacheTable(){
  await database.query(`CREATE TABLE IF NOT EXISTS zebradex_summary_cache(context_id text PRIMARY KEY,payload jsonb NOT NULL,fetched_at timestamptz NOT NULL DEFAULT now())`);
}

async function readCachedSummary(contextId:string):Promise<PokemonSummary|null>{
  try{
    await ensureCacheTable();
    const result=await database.query<{payload:PokemonSummary}>(`SELECT payload FROM zebradex_summary_cache WHERE context_id=$1`,[contextId]);
    return result.rows[0]?.payload??null;
  }catch{return null;}
}

async function cacheSummary(contextId:string,summary:PokemonSummary):Promise<void>{
  try{
    await ensureCacheTable();
    await database.query(`INSERT INTO zebradex_summary_cache(context_id,payload,fetched_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(context_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at`,[contextId,JSON.stringify(summary)]);
  }catch(error){console.warn(`[ZebraDex] Cache local non mis à jour : ${error instanceof Error?error.message:"erreur inconnue"}`);}
}

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
    const summary:PokemonSummary={
      currentValueEur:String(data7.current_value),investedEur:String(data7.current_cost),gainEur:String(data7.profit),performancePct:percent(data7.profit_pct),
      dayAmountEur:String(data7.change_1d),dayPercent:percent(data7.change_1d_pct),sevenDayAmountEur:String(data7.change_period),sevenDayPercent:percent(data7.change_period_pct),
      fifteenDayAmountEur:String(data15.change_period),fifteenDayPercent:percent(data15.change_period_pct),itemsCount:data7.raw?.items_count??null,updatedOn:labels.at(-1)??null,
    };
    await cacheSummary(contextId,summary);
    return summary;
  }catch(error){
    const reason=error instanceof Error?error.message:"erreur inconnue";
    const cached=await readCachedSummary(contextId);
    console.warn(`[ZebraDex] Données temporairement indisponibles : ${reason}${cached?" · cache local utilisé":""}`);
    return cached;
  }
}
