"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUser} from "../../src/server/auth.js";
import {database} from "../../src/server/database.js";
import Decimal from "decimal.js";
import {registerGoogleSheetsAssets} from "../../src/server/google-sheets-provider.js";
import {normalizeTicker} from "../../src/domain/tickers.js";

export interface EditAssetState{ok?:boolean;message?:string}
const schema=z.object({assetId:z.uuid(),target:z.enum(["ACTIONS","ETF","BTC","ETH","SCPI"])});
const targets={ACTIONS:{category:"EQUITY",name:"Actions"},ETF:{category:"ETF",name:"ETF"},BTC:{category:"CRYPTO",name:"BTC"},ETH:{category:"CRYPTO",name:"ETH"},SCPI:{category:"SCPI",name:"SCPI"}} as const;
const editRow=z.object({id:z.uuid(),kind:z.enum(["BUY","SELL","DIVIDEND"]),occurredOn:z.iso.date(),quantity:z.string(),unitPrice:z.string(),fees:z.string(),netAmount:z.string()});
const editSchema=z.object({assetId:z.uuid(),target:z.enum(["ACTIONS","ETF","BTC","ETH","SCPI"]),assetName:z.string().trim().min(1).max(200),ticker:z.string().trim().max(40),rows:z.array(editRow).min(1)});

export async function changeAssetTypeAction(_state:EditAssetState,formData:FormData):Promise<EditAssetState>{
  const user=await getCurrentUser();if(!user)return{message:"Session expirée."};
  const parsed=schema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{message:"Modification invalide."};
  const client=await database.connect();
  try{
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    const owned=await client.query<{portfolio_id:string;name:string}>(
      `SELECT p.id portfolio_id,p.name FROM portfolios p
        WHERE p.user_id=$2 AND EXISTS(SELECT 1 FROM transactions t WHERE t.portfolio_id=p.id AND t.asset_id=$1)
        FOR UPDATE OF p`,[parsed.data.assetId,user.id]);
    if(!owned.rowCount)throw new Error("ASSET_NOT_FOUND");
    const isMilan=owned.rows.some(row=>row.name.toLocaleLowerCase("fr").startsWith("milàn"));
    const target=targets[parsed.data.target];
    const targetName=isMilan?`Milàn — ${target.name}`:target.name;
    const portfolio=await client.query<{id:string}>(`SELECT id FROM portfolios WHERE user_id=$1 AND name=$2 AND archived_at IS NULL`,[user.id,targetName]);
    const targetId=portfolio.rows[0]?.id;if(!targetId)throw new Error("TARGET_NOT_FOUND");
    const oldIds=owned.rows.map(row=>row.portfolio_id);
    const revised=await client.query<{id:string}>(`SELECT t.id FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id WHERE t.asset_id=$1 AND p.user_id=$2 FOR UPDATE OF t`,[parsed.data.assetId,user.id]);
    for(const row of revised.rows)await client.query(`INSERT INTO transaction_revisions(transaction_id,revision_number,old_data,reason,changed_by) SELECT t.id,coalesce((SELECT max(revision_number)+1 FROM transaction_revisions WHERE transaction_id=t.id),1),to_jsonb(t)||jsonb_build_object('asset_name',a.name,'google_ticker',a.google_ticker,'portfolio_name',p.name),'ASSET_TYPE_CHANGED',$2 FROM transactions t JOIN assets a ON a.id=t.asset_id JOIN portfolios p ON p.id=t.portfolio_id WHERE t.id=$1`,[row.id,user.id]);
    await client.query(`UPDATE assets SET category=$2 WHERE id=$1`,[parsed.data.assetId,target.category]);
    await client.query(`INSERT INTO portfolio_assets(portfolio_id,asset_id,category) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[targetId,parsed.data.assetId,target.category]);
    const transactionIds=await client.query<{id:string}>(`UPDATE transactions SET portfolio_id=$1,updated_at=now() WHERE asset_id=$2 AND portfolio_id=ANY($3::uuid[]) RETURNING id`,[targetId,parsed.data.assetId,oldIds]);
    await client.query(`UPDATE cash_movements SET portfolio_id=$1 WHERE transaction_id=ANY($2::uuid[])`,[targetId,transactionIds.rows.map(row=>row.id)]);
    await client.query(`DELETE FROM portfolio_assets WHERE asset_id=$1 AND portfolio_id=ANY($2::uuid[]) AND portfolio_id<>$3`,[parsed.data.assetId,oldIds,targetId]);
    await client.query(`UPDATE valuation_snapshots SET status='INVALIDATED',status_reasons='["EDITED_TRANSACTION"]'::jsonb,computed_at=now() WHERE portfolio_id=ANY($1::uuid[])`,[[...new Set([...oldIds,targetId])]]);
    await client.query("COMMIT");
    revalidatePath("/");revalidatePath("/portefeuilles/actions");revalidatePath("/portefeuilles/etf");revalidatePath("/portefeuilles/scpi");
    return{ok:true,message:`Actif déplacé vers ${targetName}.`};
  }catch(error){await client.query("ROLLBACK");const code=error instanceof Error?error.message:"";return{message:code==="TARGET_NOT_FOUND"?"Le portefeuille de destination est introuvable.":code==="ASSET_NOT_FOUND"?"Actif introuvable.":"La modification n’a pas pu être enregistrée."};}
  finally{client.release();}
}

export async function editAssetTransactionsAction(_state:EditAssetState,formData:FormData):Promise<EditAssetState>{
  let payload:unknown;try{payload=JSON.parse(String(formData.get("payload")??""));}catch{return{message:"Données de modification invalides."};}
  const parsed=editSchema.safeParse(payload);if(!parsed.success)return{message:"Vérifie tous les champs saisis."};
  const user=await getCurrentUser();if(!user)return{message:"Session expirée."};
  const client=await database.connect();
  try{
    await client.query("BEGIN");await client.query("SET CONSTRAINTS ALL DEFERRED");
    const owned=await client.query<{portfolio_id:string;name:string;id:string;google_ticker:string|null}>(`SELECT p.id portfolio_id,p.name,t.id,a.google_ticker FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id JOIN assets a ON a.id=t.asset_id WHERE t.asset_id=$1 AND p.user_id=$2 FOR UPDATE OF t,p,a`,[parsed.data.assetId,user.id]);
    if(!owned.rowCount)throw new Error("ASSET_NOT_FOUND");
    const ownedIds=new Set(owned.rows.map(row=>row.id));if(parsed.data.rows.some(row=>!ownedIds.has(row.id))||parsed.data.rows.length!==ownedIds.size)throw new Error("TRANSACTION_MISMATCH");
    const isMilan=owned.rows.some(row=>row.name.toLocaleLowerCase("fr").startsWith("milàn"));const target=targets[parsed.data.target];const targetName=isMilan?`Milàn — ${target.name}`:target.name;
    const destination=await client.query<{id:string}>(`SELECT id FROM portfolios WHERE user_id=$1 AND name=$2 AND archived_at IS NULL`,[user.id,targetName]);const targetId=destination.rows[0]?.id;if(!targetId)throw new Error("TARGET_NOT_FOUND");
    const oldIds=[...new Set(owned.rows.map(row=>row.portfolio_id))];const ticker=parsed.data.target==="SCPI"?"":normalizeTicker(parsed.data.target==="BTC"?"BTCEUR":parsed.data.target==="ETH"?"ETHEUR":parsed.data.ticker);if(parsed.data.target!=="SCPI"&&!ticker)throw new Error("INVALID_TICKER");const symbol=parsed.data.target==="SCPI"?`SCPI-${parsed.data.assetName.toUpperCase().replace(/[^A-Z0-9]+/g,"-").slice(0,30)}`:ticker.split(":").at(-1)??ticker;
    for(const row of parsed.data.rows)await client.query(`INSERT INTO transaction_revisions(transaction_id,revision_number,old_data,reason,changed_by) SELECT t.id,coalesce((SELECT max(revision_number)+1 FROM transaction_revisions WHERE transaction_id=t.id),1),to_jsonb(t)||jsonb_build_object('asset_name',a.name,'google_ticker',a.google_ticker,'portfolio_name',p.name),'TRANSACTION_EDITED',$2 FROM transactions t JOIN assets a ON a.id=t.asset_id JOIN portfolios p ON p.id=t.portfolio_id WHERE t.id=$1`,[row.id,user.id]);
    await client.query(`UPDATE assets SET category=$2,name=$3,external_symbol=$4,google_ticker=nullif($5,''),pricing_method=$6 WHERE id=$1`,[parsed.data.assetId,target.category,parsed.data.assetName,symbol,ticker,parsed.data.target==="SCPI"?"MANUAL":"GOOGLEFINANCE"]);
    await client.query(`INSERT INTO portfolio_assets(portfolio_id,asset_id,category) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[targetId,parsed.data.assetId,target.category]);
    const ids=parsed.data.rows.map(row=>row.id);await client.query(`UPDATE transactions SET portfolio_id=$1 WHERE id=ANY($2::uuid[])`,[targetId,ids]);await client.query(`UPDATE cash_movements SET portfolio_id=$1 WHERE transaction_id=ANY($2::uuid[])`,[targetId,ids]);
    for(const row of parsed.data.rows){
      const fees=new Decimal(row.fees.replace(",","."));if(fees.isNegative())throw new Error("INVALID_AMOUNT");let quantity:string|null=null,unitPrice:string|null=null,gross:Decimal,net:Decimal;
      if(row.kind==="DIVIDEND"){net=new Decimal(row.netAmount.replace(",","."));gross=net;if(!net.isPositive())throw new Error("INVALID_AMOUNT");}
      else{quantity=row.quantity.replace(",",".");unitPrice=row.unitPrice.replace(",",".");const q=new Decimal(quantity),price=new Decimal(unitPrice);if(!q.isPositive()||price.isNegative())throw new Error("INVALID_AMOUNT");gross=q.mul(price);net=row.kind==="BUY"?gross.add(fees):gross.sub(fees);}
      await client.query(`UPDATE transactions SET kind=$2,occurred_at=$3,quantity=$4,unit_price=$5,fees=$6,gross_amount=$7,net_amount=$8,currency='EUR',fx_to_eur=1,sale_destination=$9,dividend_destination=$10,buy_source=$11,updated_at=now() WHERE id=$1`,[row.id,row.kind,`${row.occurredOn}T12:00:00+02:00`,quantity,unitPrice,fees.toString(),gross.toString(),net.toString(),row.kind==="SELL"?"EXTERNAL":null,row.kind==="DIVIDEND"?"EXTERNAL":null,row.kind==="BUY"?"EXTERNAL":null]);
      await client.query(`UPDATE cash_movements SET occurred_at=$2,kind=$3,currency='EUR',external_flow_amount=$4,distributed_income_amount=$5,fx_to_eur=1 WHERE transaction_id=$1`,[row.id,`${row.occurredOn}T12:00:00+02:00`,row.kind==="BUY"?"BUY_FUNDING":row.kind==="SELL"?"SALE_PROCEEDS":"DIVIDEND",row.kind==="BUY"?net.toString():row.kind==="SELL"?net.negated().toString():"0",row.kind==="DIVIDEND"?net.toString():"0"]);
    }
    await client.query(`DELETE FROM portfolio_assets WHERE asset_id=$1 AND portfolio_id=ANY($2::uuid[]) AND portfolio_id<>$3`,[parsed.data.assetId,oldIds,targetId]);
    await client.query(`UPDATE valuation_snapshots SET status='INVALIDATED',status_reasons='["EDITED_TRANSACTION"]'::jsonb,computed_at=now() WHERE portfolio_id=ANY($1::uuid[])`,[[...new Set([...oldIds,targetId])]]);
    const tickerChanged=(owned.rows[0]?.google_ticker??"").toUpperCase()!==ticker;
    await client.query("COMMIT");if(tickerChanged&&parsed.data.target!=="SCPI")try{await registerGoogleSheetsAssets([{ticker,name:parsed.data.assetName}]);}catch{}
    revalidatePath("/");revalidatePath("/portefeuilles/actions");revalidatePath("/portefeuilles/etf");revalidatePath("/portefeuilles/scpi");return{ok:true,message:"Opération modifiée."};
  }catch(error){await client.query("ROLLBACK");const code=error instanceof Error?error.message:"";return{message:code==="TARGET_NOT_FOUND"?"Le portefeuille de destination est introuvable.":code==="INVALID_AMOUNT"?"Un montant saisi est invalide.":"La modification n’a pas pu être enregistrée."};}finally{client.release();}
}

export async function deleteTransactionAction(transactionId:string,assetId:string):Promise<EditAssetState>{
  const parsed=z.object({transactionId:z.uuid(),assetId:z.uuid()}).safeParse({transactionId,assetId});if(!parsed.success)return{message:"Opération invalide."};
  const user=await getCurrentUser();if(!user)return{message:"Session expirée."};
  const client=await database.connect();
  try{
    await client.query("BEGIN");
    const owned=await client.query<{id:string;portfolio_id:string}>(
      `SELECT t.id,t.portfolio_id FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id
        WHERE t.id=$1 AND t.asset_id=$2 AND p.user_id=$3 FOR UPDATE OF t`,[parsed.data.transactionId,parsed.data.assetId,user.id]);
    const operation=owned.rows[0];if(!operation)throw new Error("TRANSACTION_NOT_FOUND");
    await client.query(
      `INSERT INTO transaction_revisions(transaction_id,revision_number,old_data,reason,changed_by)
       SELECT t.id,coalesce((SELECT max(revision_number)+1 FROM transaction_revisions WHERE transaction_id=t.id),1),
              to_jsonb(t)||jsonb_build_object('asset_name',a.name,'google_ticker',a.google_ticker,'portfolio_name',p.name),
              'TRANSACTION_DELETED',$2
         FROM transactions t JOIN assets a ON a.id=t.asset_id JOIN portfolios p ON p.id=t.portfolio_id WHERE t.id=$1`,[operation.id,user.id]);
    await client.query(`DELETE FROM transactions WHERE id=$1`,[operation.id]);
    await client.query(`DELETE FROM portfolio_assets pa WHERE pa.asset_id=$1 AND pa.portfolio_id=$2 AND NOT EXISTS(SELECT 1 FROM transactions t WHERE t.asset_id=pa.asset_id AND t.portfolio_id=pa.portfolio_id)`,[parsed.data.assetId,operation.portfolio_id]);
    await client.query(`UPDATE valuation_snapshots SET status='INVALIDATED',status_reasons='["DELETED_TRANSACTION"]'::jsonb,computed_at=now() WHERE portfolio_id=$1`,[operation.portfolio_id]);
    await client.query("COMMIT");
    revalidatePath("/");revalidatePath("/historique");revalidatePath("/portefeuilles/actions");revalidatePath("/portefeuilles/etf");revalidatePath("/portefeuilles/crypto");revalidatePath("/portefeuilles/scpi");
    return{ok:true,message:"Opération supprimée."};
  }catch(error){await client.query("ROLLBACK");return{message:error instanceof Error&&error.message==="TRANSACTION_NOT_FOUND"?"Cette opération n’existe plus.":"La suppression n’a pas pu être effectuée."};}
  finally{client.release();}
}
