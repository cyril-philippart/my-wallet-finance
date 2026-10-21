import "server-only";
import {database} from "./database.js";

export interface DividendEntry {id:string;assetName:string;portfolioName:string;occurredOn:string;amountEur:string}
export interface DividendSummary {entries:DividendEntry[];totalEur:string;currentYearEur:string}

export async function getDividendSummary(userId:string):Promise<DividendSummary>{
  const result=await database.query<DividendEntry>(
    `SELECT t.id,a.name "assetName",p.name "portfolioName",t.occurred_at::date::text "occurredOn",
            (t.net_amount*t.fx_to_eur)::text "amountEur"
       FROM transactions t
       JOIN portfolios p ON p.id=t.portfolio_id
       JOIN assets a ON a.id=t.asset_id
      WHERE p.user_id=$1 AND t.kind='DIVIDEND' AND p.name NOT ILIKE 'Mil_n%'
      ORDER BY t.occurred_at DESC,t.sequence_number DESC,t.id DESC`,[userId]);
  const totals=await database.query<{total:string;current_year:string}>(
    `SELECT coalesce(sum(t.net_amount*t.fx_to_eur),0)::text total,
            coalesce(sum(t.net_amount*t.fx_to_eur) FILTER(WHERE date_part('year',t.occurred_at)=date_part('year',current_date)),0)::text current_year
       FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id
      WHERE p.user_id=$1 AND t.kind='DIVIDEND' AND p.name NOT ILIKE 'Mil_n%'`,[userId]);
  return{entries:result.rows,totalEur:totals.rows[0]?.total??"0",currentYearEur:totals.rows[0]?.current_year??"0"};
}
