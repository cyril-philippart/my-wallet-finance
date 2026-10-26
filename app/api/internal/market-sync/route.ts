import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {database} from "../../../../src/server/database.js";
import {synchronizeGoogleSheetsPrices} from "../../../../src/server/google-sheets-provider.js";
import {captureDailyValuations} from "../../../../src/server/valuation-snapshots.js";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function authorized(request:Request):boolean{
  const expected=process.env.INTERNAL_CRON_SECRET??"";
  const received=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";
  if(!expected||expected.length!==received.length)return false;
  return timingSafeEqual(Buffer.from(expected),Buffer.from(received));
}

export async function POST(request:Request){
  if(!authorized(request))return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  try{
    const user=await database.query<{id:string}>(`SELECT id FROM app_users ORDER BY created_at LIMIT 1`);
    if(!user.rows[0])return NextResponse.json({ok:false,error:"USER_NOT_FOUND"},{status:503});
    const result=await synchronizeGoogleSheetsPrices("automatic");
    if(!result.skipped)await captureDailyValuations(user.rows[0].id);
    return NextResponse.json({ok:true,...result});
  }catch(error){
    console.error("Background market synchronization failed",error);
    return NextResponse.json({ok:false,error:"SYNC_FAILED"},{status:502});
  }
}
