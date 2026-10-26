import "server-only";
import { z } from "zod";
import { database } from "./database.js";
import {normalizeTicker} from "../domain/tickers.js";

const referenceSchema=z.object({price:z.number().positive(),observedAt:z.iso.datetime(),fxToEur:z.number().positive().nullable().optional().default(null)}).nullable();
const responseSchema=z.object({ok:z.literal(true),generatedAt:z.iso.datetime(),quotes:z.array(z.object({
  ticker:z.string().min(1),name:z.string(),price:z.number().positive().nullable(),currency:z.string().regex(/^[A-Z]{3}$/),
  status:z.string(),fetchedAt:z.iso.datetime(),observedAt:z.iso.datetime().nullable(),fxToEur:z.number().positive().nullable().optional().default(null),
  references:z.object({day:referenceSchema,month:referenceSchema,year:referenceSchema}).optional(),
}))});

type Reference={price:number;observedAt:string;fxToEur:number|null};
export interface QuoteRegistration{ticker:string;name:string}
export type SyncTriggerSource="manual"|"automatic";
export interface LatestMarketSync{status:"success";updatedAt:string;syncedAt:string;source:SyncTriggerSource}

export async function getLatestMarketSync():Promise<LatestMarketSync|null>{
  const schema=await database.query<{present:boolean}>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='sync_runs' AND column_name='trigger_source') AS present`,
  );
  const result=schema.rows[0]?.present
    ?await database.query<{ended_at:Date;trigger_source:SyncTriggerSource}>(`SELECT ended_at,trigger_source FROM sync_runs WHERE status IN ('SUCCESS','PARTIAL') AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`)
    :await database.query<{ended_at:Date;trigger_source:SyncTriggerSource}>(`SELECT ended_at,'automatic'::text AS trigger_source FROM sync_runs WHERE status IN ('SUCCESS','PARTIAL') AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`);
  const row=result.rows[0];
  if(!row)return null;
  const endedAt=new Date(row.ended_at);
  return{status:"success",updatedAt:endedAt.toLocaleString("fr-FR",{timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),syncedAt:endedAt.toISOString(),source:row.trigger_source};
}

export async function registerGoogleSheetsAssets(assets:QuoteRegistration[]):Promise<number>{
  const endpoint=process.env.GOOGLE_SHEETS_QUOTES_URL,secret=process.env.GOOGLE_SHEETS_SYNC_SECRET;
  if(!endpoint||!secret||!assets.length)return 0;
  const unique=[...new Map(assets.map(asset=>[asset.ticker.trim().toUpperCase(),{ticker:asset.ticker.trim().toUpperCase(),name:asset.name.trim()}])).values()];
  const url=new URL(endpoint);url.searchParams.set("key",secret);
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"upsertAssets",assets:unique}),cache:"no-store",signal:AbortSignal.timeout(60_000)});
  if(!response.ok)throw new Error(`HTTP_${response.status}`);
  const data=await response.json() as {ok?:boolean;added?:number};if(!data.ok)throw new Error("SHEETS_REGISTRATION_FAILED");return data.added??0;
}

async function insertAssetPrice(assetId:string,price:number,currency:string,observedAt:string|null,fetchedAt:string):Promise<void>{
  await database.query(
    `INSERT INTO market_prices(asset_id,price,currency,origin,observed_at,observation_status,fetched_at)
     VALUES($1,$2,$3,'GOOGLEFINANCE',$4,$5,$6) ON CONFLICT DO NOTHING`,
    [assetId,price,currency,observedAt,observedAt?"OBSERVED":"OBSERVATION_TIME_UNKNOWN",fetchedAt]);
}
async function insertBenchmarkPrice(benchmarkId:string,price:number,observedAt:string|null,fetchedAt:string):Promise<void>{
  await database.query(`INSERT INTO market_benchmark_prices(benchmark_id,price,observed_at,fetched_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[benchmarkId,price,observedAt,fetchedAt]);
}
const historicalFetchedAt=(reference:Reference)=>reference.observedAt;
async function insertFxRate(currency:string,rate:number,observedAt:string):Promise<void>{
  if(currency==="EUR")return;
  await database.query(
    `INSERT INTO fx_rates(base_currency,quote_currency,rate,observed_at,source)
     VALUES($1,'EUR',$2,$3,'GOOGLEFINANCE') ON CONFLICT DO NOTHING`,
    [currency,rate,observedAt],
  );
}

export async function synchronizeGoogleSheetsPrices(source:SyncTriggerSource="automatic"):Promise<{imported:number;ignored:number;skipped?:boolean}>{
  const endpoint=process.env.GOOGLE_SHEETS_QUOTES_URL,secret=process.env.GOOGLE_SHEETS_SYNC_SECRET;
  if(!endpoint||!secret)throw new Error("GOOGLE_SHEETS_NOT_CONFIGURED");
  const lockClient=await database.connect();
  const lockKey="my_wallet_market_sync";
  const lock=await lockClient.query<{locked:boolean}>(`SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,[lockKey]);
  if(!lock.rows[0]?.locked){lockClient.release();return{imported:0,ignored:0,skipped:true};}
  const url=new URL(endpoint);url.searchParams.set("key",secret);
  const run=await database.query<{id:string}>(`INSERT INTO sync_runs(provider,status,trigger_source) VALUES('GOOGLE_SHEETS','RUNNING',$1) RETURNING id`,[source]);const runId=run.rows[0]!.id;
  try{
    let response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(60_000)});
    if(!response.ok&&(response.status===404||response.status>=500))response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(60_000)});
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    const parsed=responseSchema.safeParse(await response.json());if(!parsed.success)throw new Error("INVALID_PROVIDER_RESPONSE");
    let imported=0,ignored=0;
    const fxQuotes=new Map(parsed.data.quotes.filter(quote=>/^CURRENCY:[A-Z]{3}EUR$/.test(quote.ticker)&&quote.price!==null).map(quote=>[quote.ticker.slice(9,12),quote]));
    for(const quote of parsed.data.quotes){
      const normalizedTicker=normalizeTicker(quote.ticker);
      if(quote.ticker.startsWith("CURRENCY:")&&normalizedTicker===quote.ticker.toUpperCase()){ignored++;continue;}
      const fxQuote=quote.currency==="EUR"?null:fxQuotes.get(quote.currency);
      const currentFx=quote.fxToEur??fxQuote?.price??null;
      if(quote.status!=="OK"||quote.price===null||(quote.currency!=="EUR"&&currentFx===null)){ignored++;continue;}
      const asset=await database.query<{id:string}>(`SELECT id FROM assets WHERE upper(regexp_replace(google_ticker,'^CURRENCY:','','i'))=upper($1)`,[normalizedTicker]);
      const benchmark=await database.query<{id:string}>(`SELECT id FROM market_benchmarks WHERE upper(ticker)=upper($1)`,[normalizedTicker]);
      let matched=false;
      if(asset.rows[0]){
        await insertFxRate(quote.currency,currentFx??1,quote.observedAt??quote.fetchedAt);
        await insertAssetPrice(asset.rows[0].id,quote.price,quote.currency,quote.observedAt,quote.fetchedAt);
        for(const period of ["day","month","year"] as const){const reference=quote.references?.[period];if(!reference)continue;const referenceFx=reference.fxToEur??fxQuote?.references?.[period]?.price??null;if(quote.currency!=="EUR"&&referenceFx===null)continue;await insertFxRate(quote.currency,referenceFx??1,reference.observedAt);await insertAssetPrice(asset.rows[0].id,reference.price,quote.currency,reference.observedAt,historicalFetchedAt(reference));}
        matched=true;
      }
      if(benchmark.rows[0]){
        await insertBenchmarkPrice(benchmark.rows[0].id,quote.price,quote.observedAt,quote.fetchedAt);
        for(const reference of Object.values(quote.references??{}).filter((value):value is Reference=>value!==null&&value!==undefined))await insertBenchmarkPrice(benchmark.rows[0].id,reference.price,reference.observedAt,historicalFetchedAt(reference));
        matched=true;
      }
      if(matched)imported++;else ignored++;
    }
    await database.query(`UPDATE sync_runs SET status=$1,ended_at=now(),imported_count=$2 WHERE id=$3`,[ignored?"PARTIAL":"SUCCESS",imported,runId]);
    return{imported,ignored};
  }catch(error){await database.query(`UPDATE sync_runs SET status='FAILED',ended_at=now(),error_message=$1 WHERE id=$2`,[error instanceof Error?error.message:"UNKNOWN",runId]);throw error;}
  finally{await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`,[lockKey]);lockClient.release();}
}
