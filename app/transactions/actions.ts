"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "../../src/server/auth.js";
import { recordTransaction,recordTransactionWithClient } from "../../src/server/record-transaction.js";
import { database } from "../../src/server/database.js";
import {registerGoogleSheetsAssets,synchronizeGoogleSheetsPrices} from "../../src/server/google-sheets-provider.js";
import {normalizeTicker} from "../../src/domain/tickers.js";
export interface TransactionState { ok?: boolean; message?: string }
const decimal = (positive: boolean) => z.string().trim().regex(/^\d+(?:[.,]\d+)?$/).transform(v => v.replace(",", ".")).refine(v => !positive || Number(v) > 0);
const optionalField = z.string().optional().default("");
const schema = z.object({ portfolioId:z.uuid(), kind:z.enum(["BUY","SELL","DIVIDEND"]), assetName:z.string().trim().min(1).max(200), symbol:z.string().trim().min(1).max(40), occurredOn:z.iso.date(), currency:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), quantity:optionalField, unitPrice:optionalField, fees:optionalField, netAmount:optionalField, fxToEur:optionalField });
const valuationSchema=z.object({portfolioId:z.uuid(),occurredOn:z.iso.date(),currency:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),currentValue:decimal(true),fxToEur:decimal(true)});
const batchRowSchema=z.object({type:z.enum(["ACTIONS","ETF","BTC","ETH","SCPI","FUND_EURO"]),isMilan:z.boolean(),lifeOwner:z.enum(["Cyril","Inès"]),kind:z.enum(["BUY","SELL","DIVIDEND"]),assetName:z.string(),googleTicker:z.string(),occurredOn:z.iso.date(),quantity:z.string(),unitPrice:z.string(),netAmount:z.string(),currentValue:z.string(),fees:z.string()});
const batchSchema=z.array(batchRowSchema).min(1).max(50);
export async function createTransactionAction(_state:TransactionState, formData:FormData):Promise<TransactionState>{
  const user=await getCurrentUser(); if(!user)return{message:"Session expirée. Rechargez la page."};
  const batchValue=formData.get("batch");
  if(typeof batchValue==="string"){
    let decoded:unknown;try{decoded=JSON.parse(batchValue);}catch{return{message:"La liste des opérations est invalide."};}
    const batch=batchSchema.safeParse(decoded);if(!batch.success)return{message:"Vérifiez les champs de chaque opération."};
    const client=await database.connect();
    try{
      await client.query("BEGIN");
      const portfolioRows=await client.query<{id:string;name:string}>(`SELECT id,name FROM portfolios WHERE user_id=$1 AND archived_at IS NULL`,[user.id]);
      const byName=new Map(portfolioRows.rows.map(portfolio=>[portfolio.name,portfolio.id]));
      for(let index=0;index<batch.data.length;index++){
        const row=batch.data[index]!;const portfolioName=row.isMilan?(row.type==="FUND_EURO"?"Milàn — Fonds euros":`Milàn — ${row.type==="ACTIONS"?"Actions":row.type}`):(row.type==="FUND_EURO"?`Assurance-vie ${row.lifeOwner}`:row.type==="ACTIONS"?"Actions":row.type);const portfolioId=byName.get(portfolioName);
        if(!portfolioId)throw new Error(`Ligne ${index+1} : portefeuille introuvable.`);
        if(row.type==="FUND_EURO"){
          const value=decimal(true).safeParse(row.currentValue);if(!value.success)throw new Error(`Ligne ${index+1} : valorisation invalide.`);
          await client.query(`INSERT INTO life_insurance_valuations(portfolio_id,effective_at,value,currency,fx_to_eur,origin,source_label) VALUES($1,$2,$3,'EUR',1,'MANUAL','Saisie manuelle') ON CONFLICT(portfolio_id,effective_at) DO UPDATE SET value=excluded.value,currency='EUR',fx_to_eur=1,origin='MANUAL',source_label='Saisie manuelle'`,[portfolioId,`${row.occurredOn}T12:00:00+02:00`,value.data]);
          continue;
        }
        const trade=row.kind!=="DIVIDEND",quantity=trade?decimal(true).safeParse(row.quantity):null,unitPrice=trade?decimal(false).safeParse(row.unitPrice):null,fees=decimal(false).safeParse(trade?(row.fees||"0"):"0"),net=!trade?decimal(true).safeParse(row.netAmount):null;
        if((quantity&&!quantity.success)||(unitPrice&&!unitPrice.success)||!fees.success||(net&&!net.success))throw new Error(`Ligne ${index+1} : montants invalides.`);
        const googleTicker=!trade||row.type==="SCPI"?"":normalizeTicker(row.type==="BTC"?"BTCEUR":row.type==="ETH"?"ETHEUR":row.googleTicker);
        if(!row.assetName.trim()||(trade&&row.type!=="SCPI"&&!googleTicker))throw new Error(`Ligne ${index+1} : actif ou code Google manquant.`);
        const nameSymbol=row.assetName.trim().toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,30);
        const symbol=!trade?`DIV-${nameSymbol}`:row.type==="BTC"?"BTC":row.type==="ETH"?"ETH":row.type==="SCPI"?`SCPI-${nameSymbol}`:googleTicker.split(":").at(-1)??googleTicker;
        await recordTransactionWithClient(client,{userId:user.id,portfolioId,kind:row.kind,assetName:row.assetName.trim(),symbol,googleTicker,occurredAt:`${row.occurredOn}T12:00:00+02:00`,currency:"EUR",quantity:quantity?.data,unitPrice:unitPrice?.data,fees:fees.data,netAmount:net?.data,fxToEur:"1"});
      }
      await client.query("COMMIT");
      const assets=batch.data.filter(row=>row.kind!=="DIVIDEND"&&row.type!=="FUND_EURO"&&row.type!=="SCPI").map(row=>({ticker:normalizeTicker(row.type==="BTC"?"BTCEUR":row.type==="ETH"?"ETHEUR":row.googleTicker),name:row.assetName}));
      let quotePending=false;
      if(assets.length){try{await registerGoogleSheetsAssets(assets);await synchronizeGoogleSheetsPrices();}catch{quotePending=true;}}
      const quoteMessage=assets.length?(quotePending?" Cours en attente de synchronisation.":" Cotations synchronisées."):"";
      revalidatePath("/");revalidatePath("/dividendes");return{ok:true,message:`${batch.data.length} opération${batch.data.length>1?"s":""} enregistrée${batch.data.length>1?"s":""}.${quoteMessage}`};
    }catch(error){await client.query("ROLLBACK");return{message:error instanceof Error?error.message:"L’enregistrement groupé a échoué."};}finally{client.release();}
  }
  if(formData.get("mode")==="VALUATION"){
    const valuation=valuationSchema.safeParse(Object.fromEntries(formData));if(!valuation.success)return{message:"Vérifiez la valorisation saisie."};
    const result=await database.query(
      `INSERT INTO life_insurance_valuations(portfolio_id,effective_at,value,currency,fx_to_eur,origin,source_label)
       SELECT p.id,$3,$4,$5,$6,'MANUAL','Saisie manuelle' FROM portfolios p WHERE p.id=$1 AND p.user_id=$2 AND p.category='LIFE_INSURANCE'
       ON CONFLICT(portfolio_id,effective_at) DO UPDATE SET value=excluded.value,currency=excluded.currency,fx_to_eur=excluded.fx_to_eur,origin='MANUAL',source_label='Saisie manuelle'
       RETURNING id`,[valuation.data.portfolioId,user.id,`${valuation.data.occurredOn}T12:00:00+02:00`,valuation.data.currentValue,valuation.data.currency,valuation.data.fxToEur]);
    if(!result.rowCount)return{message:"Portefeuille d’assurance-vie introuvable."};revalidatePath("/");return{ok:true,message:"Valorisation du fonds euros enregistrée."};
  }
  const parsed=schema.safeParse(Object.fromEntries(formData)); if(!parsed.success)return{message:"Vérifiez les champs saisis."};
  const trade=parsed.data.kind!=="DIVIDEND", quantity=trade?decimal(true).safeParse(parsed.data.quantity):null, unitPrice=trade?decimal(false).safeParse(parsed.data.unitPrice):null, fees=decimal(false).safeParse(parsed.data.fees||"0"), net=!trade?decimal(true).safeParse(parsed.data.netAmount):null, fx=decimal(true).safeParse(parsed.data.fxToEur);
  if((quantity&&!quantity.success)||(unitPrice&&!unitPrice.success)||!fees.success||(net&&!net.success)||!fx.success)return{message:"Les montants saisis ne sont pas valides."};
  try { await recordTransaction({userId:user.id,portfolioId:parsed.data.portfolioId,kind:parsed.data.kind,assetName:parsed.data.assetName,symbol:parsed.data.symbol,occurredAt:`${parsed.data.occurredOn}T12:00:00+02:00`,currency:parsed.data.currency,quantity:quantity?.data,unitPrice:unitPrice?.data,fees:fees.data,netAmount:net?.data,fxToEur:fx.data}); revalidatePath("/");revalidatePath("/dividendes"); return{ok:true,message:"Transaction enregistrée."}; }
  catch(error){const code=error instanceof Error?error.message:"";const messages:Record<string,string>={ASSET_NOT_FOUND:"Cet actif doit d’abord être créé par un achat.",INSUFFICIENT_QUANTITY:"La quantité vendue dépasse la position détenue à cette date.",LIFE_INSURANCE_REQUIRES_SPECIFIC_OPERATION:"Les fonds euros utilisent un formulaire spécifique.",PORTFOLIO_NOT_FOUND:"Portefeuille introuvable."};return{message:messages[code]??"La transaction n’a pas pu être enregistrée."};}
}
