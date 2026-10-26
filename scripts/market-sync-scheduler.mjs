const intervalMs=5*60*1000;
const endpoint=process.env.MARKET_SYNC_INTERNAL_URL??"http://app:3000/api/internal/market-sync";
const secret=process.env.INTERNAL_CRON_SECRET;

if(!secret)throw new Error("INTERNAL_CRON_SECRET est obligatoire.");

async function synchronize(){
  const startedAt=new Date().toISOString();
  try{
    const response=await fetch(endpoint,{method:"POST",headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(120_000)});
    const body=await response.text();
    if(!response.ok)throw new Error(`HTTP ${response.status}: ${body}`);
    console.log(`[${startedAt}] Synchronisation terminée : ${body}`);
  }catch(error){console.error(`[${startedAt}] Synchronisation échouée`,error);}
}

await synchronize();
setInterval(synchronize,intervalMs);
