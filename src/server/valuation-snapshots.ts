import "server-only";
import Decimal from "decimal.js";
import { database } from "./database.js";
import { getDashboardData } from "./portfolio-queries.js";
import {getPokemonSummary} from "./zebradex-provider.js";
import {saveDailyWealthEvolution} from "./wealth-history.js";

export async function captureDailyValuations(userId:string):Promise<number>{
  await captureReferenceValuations(userId);
  const dashboard=await getDashboardData(userId);let captured=0;
  for(const portfolio of dashboard.portfolios){
    if(portfolio.positionCount===0||portfolio.marketValueEur===null)continue;
    const flows=await database.query<{external_flow:string;income:string}>(
      `SELECT coalesce(sum(external_flow_amount*fx_to_eur),0)::text external_flow,
              coalesce(sum(distributed_income_amount*fx_to_eur),0)::text income
         FROM cash_movements WHERE portfolio_id=$1 AND occurred_at::date=current_date`,[portfolio.id]);
    const previous=await database.query<{economic_value_eur:string;performance_index:string|null}>(
      `SELECT economic_value_eur::text,performance_index::text FROM valuation_snapshots
        WHERE portfolio_id=$1 AND day<current_date AND status NOT IN('INCOMPLETE','INVALIDATED') ORDER BY day DESC LIMIT 1`,[portfolio.id]);
    const opening=previous.rows[0];const closing=new Decimal(portfolio.marketValueEur);const externalFlow=new Decimal(flows.rows[0]?.external_flow??0);const income=new Decimal(flows.rows[0]?.income??0);
    let index=new Decimal(100);let status:"READY"|"ESTIMATED"="READY";const reasons:string[]=[];
    if(opening){const openValue=new Decimal(opening.economic_value_eur);const priorIndex=new Decimal(opening.performance_index??100);index=openValue.isZero()?priorIndex:priorIndex.mul(closing.sub(externalFlow).add(income).div(openValue));status="ESTIMATED";reasons.push("END_OF_DAY_FLOW_ASSUMPTION");}
    await database.query(
      `INSERT INTO valuation_snapshots(portfolio_id,day,market_value_eur,technical_cash_eur,economic_value_eur,external_flow_eur,distributed_income_eur,earned_dividends_eur,performance_index,calculation_method,calculation_version,status,status_reasons)
       VALUES($1,current_date,$2,0,$2,$3,$4,$4,$5,'END_OF_DAY_EXTERNAL_FLOWS',1,$6,$7)
       ON CONFLICT(portfolio_id,day) DO UPDATE SET market_value_eur=excluded.market_value_eur,economic_value_eur=excluded.economic_value_eur,external_flow_eur=excluded.external_flow_eur,distributed_income_eur=excluded.distributed_income_eur,earned_dividends_eur=excluded.earned_dividends_eur,performance_index=excluded.performance_index,calculation_method=excluded.calculation_method,calculation_version=excluded.calculation_version,status=excluded.status,status_reasons=excluded.status_reasons,computed_at=now()`,
      [portfolio.id,closing.toString(),externalFlow.toString(),income.toString(),index.toString(),status,JSON.stringify(reasons)]);
    captured++;
  }
  if(dashboard.totalGainEur!==null){
    const pokemon=await getPokemonSummary();
    const withoutPokemonValue=new Decimal(dashboard.totalGainEur);
    const withPokemonValue=withoutPokemonValue.add(pokemon?.gainEur??0);
    await saveDailyWealthEvolution(userId,withoutPokemonValue.toString(),withPokemonValue.toString());
  }
  return captured;
}

async function captureReferenceValuations(userId:string):Promise<void>{
  const boundaries=await database.query<{day:string}>(
    `SELECT DISTINCT day::text FROM (VALUES
      (current_date-1),(date_trunc('month',current_date)::date-1),(date_trunc('year',current_date)::date-1)
     ) dates(day)`);
  const portfolios=await database.query<{id:string}>(`SELECT id FROM portfolios WHERE user_id=$1 AND archived_at IS NULL`,[userId]);
  for(const portfolio of portfolios.rows){
    for(const boundary of boundaries.rows){
      const valuation=await database.query<{market_value:string;fallbacks:string;positions:string}>(
        `WITH quantities AS (
           SELECT t.asset_id,sum(CASE WHEN t.kind='BUY' THEN t.quantity ELSE -t.quantity END) quantity
             FROM transactions t WHERE t.portfolio_id=$1 AND t.kind IN('BUY','SELL') AND t.occurred_at::date<=$2::date
            GROUP BY t.asset_id HAVING sum(CASE WHEN t.kind='BUY' THEN t.quantity ELSE -t.quantity END)<>0
         ), valued AS (
           SELECT q.quantity,coalesce(p.price_eur,c.cost_per_unit_eur) price,
                  (p.price_eur IS NULL AND c.cost_per_unit_eur IS NOT NULL) used_cost_fallback
             FROM quantities q
           LEFT JOIN LATERAL(
             SELECT mp.price*coalesce(fx.rate,CASE WHEN mp.currency='EUR' THEN 1 END) price_eur
               FROM market_prices mp
               LEFT JOIN LATERAL(SELECT rate FROM fx_rates WHERE base_currency=mp.currency AND quote_currency='EUR' AND observed_at::date<=mp.observed_at::date ORDER BY observed_at DESC LIMIT 1) fx ON true
              WHERE mp.asset_id=q.asset_id AND mp.observed_at::date<=$2::date
                AND (mp.currency='EUR' OR fx.rate IS NOT NULL)
              ORDER BY mp.observed_at DESC LIMIT 1
           ) p ON true
           LEFT JOIN LATERAL(
             SELECT sum((t.unit_price*t.quantity+t.fees)*t.fx_to_eur)
                    / nullif(sum(t.quantity),0) cost_per_unit_eur
               FROM transactions t
              WHERE t.portfolio_id=$1 AND t.asset_id=q.asset_id AND t.kind='BUY'
                AND t.occurred_at::date<=$2::date
           ) c ON true
         )
         SELECT coalesce(sum(quantity*price),0)::text market_value,
                count(*) FILTER(WHERE used_cost_fallback)::text fallbacks,
                count(*)::text positions
           FROM valued`,
        [portfolio.id,boundary.day]);
      const value=valuation.rows[0];if(!value||value.positions==="0")continue;
      const usedFallback=value.fallbacks!=="0";
      const reasons=usedFallback?["HISTORICAL_CLOSE_REFERENCE","MISSING_HISTORICAL_PRICE_COST_FALLBACK"]:["HISTORICAL_CLOSE_REFERENCE"];
      await database.query(
        `INSERT INTO valuation_snapshots(portfolio_id,day,market_value_eur,technical_cash_eur,economic_value_eur,performance_index,calculation_method,calculation_version,status,status_reasons)
         VALUES($1,$2,$3,0,$3,100,'HISTORICAL_CLOSE_REFERENCE',1,'ESTIMATED',$4::jsonb)
         ON CONFLICT(portfolio_id,day) DO UPDATE SET
           market_value_eur=excluded.market_value_eur,
           technical_cash_eur=0,
           economic_value_eur=excluded.economic_value_eur,
           external_flow_eur=0,
           distributed_income_eur=0,
           earned_dividends_eur=0,
           performance_index=100,
           calculation_method=excluded.calculation_method,
           calculation_version=excluded.calculation_version,
           status=excluded.status,
           status_reasons=excluded.status_reasons,
           computed_at=now()
         WHERE valuation_snapshots.status='INVALIDATED'`,[portfolio.id,boundary.day,value.market_value,JSON.stringify(reasons)]);
    }
  }
}
