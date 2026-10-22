import "server-only";
import {database} from "./database.js";
import {ensurePokemonTradingTables} from "./pokemon-resale-queries.js";

export interface ActivityEntry{
  id:string;action:"BUY"|"SELL"|"DIVIDEND"|"MODIFIED"|"DELETED";
  assetName:string;portfolioName:string;occurredOn:string;recordedAt:string;
  quantity:string|null;unitPrice:string|null;amount:string|null;fees:string|null;reason:string|null;
}

export async function getActivityHistory(userId:string):Promise<ActivityEntry[]>{
  await ensurePokemonTradingTables();
  const result=await database.query<{id:string;action:ActivityEntry["action"];asset_name:string;portfolio_name:string;occurred_on:string;recorded_at:Date;quantity:string|null;unit_price:string|null;amount:string|null;fees:string|null;reason:string|null}>(`
    SELECT 'transaction:'||t.id id,t.kind::text action,a.name asset_name,p.name portfolio_name,
           t.occurred_at::date::text occurred_on,t.created_at recorded_at,t.quantity::text,t.unit_price::text,
           t.net_amount::text amount,t.fees::text,NULL::text reason
      FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id JOIN assets a ON a.id=t.asset_id
     WHERE p.user_id=$1
    UNION ALL
    SELECT 'revision:'||r.id,CASE WHEN r.reason='TRANSACTION_DELETED' THEN 'DELETED' ELSE 'MODIFIED' END,
           coalesce(r.old_data->>'asset_name',a.name,'Actif supprimé'),coalesce(r.old_data->>'portfolio_name',p.name,'Portefeuille'),
           coalesce((r.old_data->>'occurred_at')::timestamptz,t.occurred_at,r.changed_at)::date::text,r.changed_at,
           r.old_data->>'quantity',r.old_data->>'unit_price',r.old_data->>'net_amount',r.old_data->>'fees',r.reason
      FROM transaction_revisions r
      LEFT JOIN transactions t ON t.id=r.transaction_id LEFT JOIN portfolios p ON p.id=t.portfolio_id LEFT JOIN assets a ON a.id=t.asset_id
     WHERE r.changed_by=$1
    UNION ALL
    SELECT 'pokemon:'||e.id,e.action,e.product_name,'Resale PokÃ©mon',e.occurred_on::text,e.created_at,
           e.quantity::text,e.unit_price_eur::text,e.amount_eur::text,NULL::text,e.reason
      FROM pokemon_trading_events e WHERE e.user_id=$1
     ORDER BY recorded_at DESC`,[userId]);
  return result.rows.map(row=>({id:row.id,action:row.action,assetName:row.asset_name,portfolioName:row.portfolio_name,occurredOn:row.occurred_on,recordedAt:row.recorded_at.toISOString(),quantity:row.quantity,unitPrice:row.unit_price,amount:row.amount,fees:row.fees,reason:row.reason}));
}
