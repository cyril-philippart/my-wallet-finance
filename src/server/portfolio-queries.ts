import "server-only";
import Decimal from "decimal.js";
import { projectPosition, type Trade } from "../domain/position.js";
import { database } from "./database.js";

export type AssetCategory="EQUITY"|"ETF"|"CRYPTO"|"SCPI"|"LIFE_INSURANCE"|"OTHER";

export interface PortfolioSummary {
  id:string;name:string;category:AssetCategory;positionCount:number;transactionCount:number;
  investedEur:string;marketValueEur:string|null;gainEur:string|null;performancePct:string|null;weightPct:string|null;
}
export interface PositionSummary {
  portfolioId:string;assetId:string;name:string;symbol:string;googleTicker:string|null;currency:string;quantity:string;
  averageCostNative:string;investedEur:string;currentPrice:string|null;marketValueEur:string|null;
  gainEur:string|null;performancePct:string|null;dayAmountEur:string|null;dayPerformancePct:string|null;
  monthAmountEur:string|null;monthPerformancePct:string|null;priceFetchedAt:string|null;
}
export interface EditableTransaction {id:string;kind:"BUY"|"SELL"|"DIVIDEND";occurredOn:string;quantity:string;unitPrice:string;fees:string;netAmount:string}
export interface BenchmarkSummary {
  id:string;name:string;ticker:string;currency:string;price:string|null;fetchedAt:string|null;
  dayPct:string|null;monthPct:string|null;yearPct:string|null;
  dayAmount:string|null;monthAmount:string|null;yearAmount:string|null;
}
export interface PeriodMetric { percent:string|null;amountEur:string|null;missingAssets?:string[]|undefined }
export interface PortfolioGroupSummary {
  id:"actions"|"etf"|"crypto"|"milan";name:string;positionCount:number;marketValueEur:string|null;investedEur:string;
  day:PeriodMetric;global:PeriodMetric;month:PeriodMetric;year:PeriodMetric;
}
export interface DashboardData {
  portfolios:PortfolioSummary[];positions:PositionSummary[];benchmarks:BenchmarkSummary[];
  totalInvestedEur:string;totalMarketValueEur:string|null;totalGainEur:string|null;globalPerformancePct:string|null;
  availableCapitalEur:string;dividendsEur:string;
  periodPerformance:{day:PeriodMetric;month:PeriodMetric;year:PeriodMetric};
  portfolioGroups:PortfolioGroupSummary[];
}
interface TradeRow {id:string;portfolio_id:string;asset_id:string;name:string;symbol:string|null;google_ticker:string|null;kind:"BUY"|"SELL";occurred_at:Date;sequence_number:string;currency:string;quantity:string;unit_price:string;fees:string;fx_to_eur:string}
interface BenchmarkRow {id:string;name:string;ticker:string;currency:string;price:string|null;fetched_at:Date|null;day_price:string|null;month_price:string|null;year_price:string|null}

const ratio=(current:string|null,reference:string|null)=>current&&reference&&!new Decimal(reference).isZero()?new Decimal(current).div(reference).sub(1).mul(100).toString():null;
const difference=(current:string|null,reference:string|null)=>current&&reference?new Decimal(current).sub(reference).toString():null;
const emptyPeriod=():PeriodMetric=>({percent:null,amountEur:null});
const isMilanPortfolioName=(name:string)=>name.toLocaleLowerCase("fr").normalize("NFD").replace(/\p{Diacritic}/gu,"").startsWith("milan");

function marketPeriodFallback(positions:PositionSummary[],period:"day"|"month"):PeriodMetric{
  const amountKey=period==="day"?"dayAmountEur":"monthAmountEur";
  const covered=positions.filter(position=>position.marketValueEur!==null&&position[amountKey]!==null);
  if(!covered.length)return emptyPeriod();
  const current=covered.reduce((sum,position)=>sum.add(position.marketValueEur!),new Decimal(0));
  const amount=covered.reduce((sum,position)=>sum.add(position[amountKey]!),new Decimal(0));
  const opening=current.sub(amount);
  return{amountEur:amount.toString(),percent:opening.isZero()?null:amount.div(opening).mul(100).toString(),missingAssets:[...new Set(positions.filter(position=>position[amountKey]===null).map(position=>position.name))]};
}

export async function getEditableTransactions(userId:string,assetIds:string[]):Promise<Map<string,EditableTransaction[]>>{
  if(!assetIds.length)return new Map();
  const result=await database.query<{id:string;asset_id:string;kind:"BUY"|"SELL"|"DIVIDEND";occurred_on:string;quantity:string|null;unit_price:string|null;fees:string;net_amount:string|null}>(
    `SELECT t.id,t.asset_id,t.kind,t.occurred_at::date::text occurred_on,t.quantity::text,t.unit_price::text,t.fees::text,t.net_amount::text
       FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id
      WHERE p.user_id=$1 AND t.asset_id=ANY($2::uuid[]) AND t.kind IN('BUY','SELL','DIVIDEND')
      ORDER BY t.occurred_at,t.sequence_number,t.id`,[userId,assetIds]);
  const grouped=new Map<string,EditableTransaction[]>();
  for(const row of result.rows)grouped.set(row.asset_id,[...(grouped.get(row.asset_id)??[]),{id:row.id,kind:row.kind,occurredOn:row.occurred_on,quantity:row.quantity??"",unitPrice:row.unit_price??"",fees:row.fees,netAmount:row.net_amount??""}]);
  return grouped;
}

export async function getDashboardData(userId:string):Promise<DashboardData>{
  const portfolioResult=await database.query<{id:string;name:string;category:AssetCategory}>(
    `SELECT id,name,category FROM portfolios WHERE user_id=$1 AND archived_at IS NULL ORDER BY created_at,name`,[userId]);
  const tradeResult=await database.query<TradeRow>(
    `SELECT t.id,t.portfolio_id,t.asset_id,a.name,a.external_symbol AS symbol,a.google_ticker,t.kind,t.occurred_at,
            t.sequence_number::text,t.currency,t.quantity::text,t.unit_price::text,t.fees::text,t.fx_to_eur::text
       FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id JOIN assets a ON a.id=t.asset_id
      WHERE p.user_id=$1 AND t.kind IN ('BUY','SELL') ORDER BY t.occurred_at,t.sequence_number,t.id`,[userId]);
  const grouped=new Map<string,TradeRow[]>();
  for(const row of tradeResult.rows){const key=`${row.portfolio_id}:${row.asset_id}`;grouped.set(key,[...(grouped.get(key)??[]),row]);}
  const positions:PositionSummary[]=[];const investedByPortfolio=new Map<string,Decimal>();const transactionCount=new Map<string,number>();
  for(const row of tradeResult.rows)transactionCount.set(row.portfolio_id,(transactionCount.get(row.portfolio_id)??0)+1);
  for(const rows of grouped.values()){
    const first=rows[0]!;const trades:Trade[]=rows.map(row=>({id:row.id,kind:row.kind,occurredAt:row.occurred_at.toISOString(),sequence:Number(row.sequence_number),currency:row.currency,quantity:row.quantity,unitPrice:row.unit_price,fees:row.fees,fxToEur:row.fx_to_eur}));
    const state=projectPosition(trades);if(state.quantity.isZero())continue;
    investedByPortfolio.set(first.portfolio_id,(investedByPortfolio.get(first.portfolio_id)??new Decimal(0)).add(state.historicalCostEur));
    positions.push({portfolioId:first.portfolio_id,assetId:first.asset_id,name:first.name,symbol:first.symbol??"—",googleTicker:first.google_ticker,currency:first.currency,quantity:state.quantity.toString(),averageCostNative:state.historicalCostNative.div(state.quantity).toString(),investedEur:state.historicalCostEur.toString(),currentPrice:null,marketValueEur:null,gainEur:null,performancePct:null,dayAmountEur:null,dayPerformancePct:null,monthAmountEur:null,monthPerformancePct:null,priceFetchedAt:null});
  }
  if(positions.length){
    const prices=await database.query<{asset_id:string;price_eur:string;day_price_eur:string|null;month_price_eur:string|null;fetched_at:Date}>(`SELECT ids.asset_id,latest.price_eur::text,previous.price_eur::text day_price_eur,month_ref.price_eur::text month_price_eur,latest.fetched_at
      FROM unnest($1::uuid[]) ids(asset_id)
      JOIN LATERAL(
        SELECT mp.price*coalesce(fx.rate,CASE WHEN mp.currency='EUR' THEN 1 END) price_eur,mp.fetched_at
          FROM market_prices mp
          LEFT JOIN LATERAL(SELECT rate FROM fx_rates WHERE base_currency=mp.currency AND quote_currency='EUR' AND observed_at<=coalesce(mp.observed_at,mp.fetched_at) ORDER BY observed_at DESC LIMIT 1) fx ON true
         WHERE mp.asset_id=ids.asset_id AND (mp.currency='EUR' OR fx.rate IS NOT NULL) ORDER BY mp.fetched_at DESC LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL(
        SELECT mp.price*coalesce(fx.rate,CASE WHEN mp.currency='EUR' THEN 1 END) price_eur
          FROM market_prices mp
          LEFT JOIN LATERAL(SELECT rate FROM fx_rates WHERE base_currency=mp.currency AND quote_currency='EUR' AND observed_at<=mp.observed_at ORDER BY observed_at DESC LIMIT 1) fx ON true
         WHERE mp.asset_id=ids.asset_id AND mp.observed_at<date_trunc('day',now()) AND (mp.currency='EUR' OR fx.rate IS NOT NULL) ORDER BY mp.observed_at DESC LIMIT 1
      ) previous ON true
      LEFT JOIN LATERAL(
        SELECT mp.price*coalesce(fx.rate,CASE WHEN mp.currency='EUR' THEN 1 END) price_eur
          FROM market_prices mp
          LEFT JOIN LATERAL(SELECT rate FROM fx_rates WHERE base_currency=mp.currency AND quote_currency='EUR' AND observed_at<=mp.observed_at ORDER BY observed_at DESC LIMIT 1) fx ON true
         WHERE mp.asset_id=ids.asset_id AND mp.observed_at<date_trunc('month',now()) AND (mp.currency='EUR' OR fx.rate IS NOT NULL) ORDER BY mp.observed_at DESC LIMIT 1
      ) month_ref ON true`,[positions.map(position=>position.assetId)]);
    const byAsset=new Map(prices.rows.map(price=>[price.asset_id,price]));
    for(const position of positions){const price=byAsset.get(position.assetId);if(price){const current=new Decimal(price.price_eur);const value=new Decimal(position.quantity).mul(current);const gain=value.sub(position.investedEur);position.currentPrice=current.toString();position.currency="EUR";position.marketValueEur=value.toString();position.gainEur=gain.toString();position.performancePct=new Decimal(position.investedEur).isZero()?null:gain.div(position.investedEur).mul(100).toString();if(price.day_price_eur){const previous=new Decimal(price.day_price_eur);position.dayAmountEur=current.sub(previous).mul(position.quantity).toString();position.dayPerformancePct=previous.isZero()?null:current.div(previous).sub(1).mul(100).toString();}if(price.month_price_eur){const previous=new Decimal(price.month_price_eur);position.monthAmountEur=current.sub(previous).mul(position.quantity).toString();position.monthPerformancePct=previous.isZero()?null:current.div(previous).sub(1).mul(100).toString();}position.priceFetchedAt=price.fetched_at.toISOString();}}
  }
  // Une SCPI n'a pas de cours de marché. Tant qu'aucune valorisation manuelle
  // distincte n'existe, sa valeur comptable est son coût historique : elle reste
  // neutre dans les performances au lieu de rendre tout le patrimoine incomplet.
  const scpiPortfolioIds=new Set(portfolioResult.rows.filter(portfolio=>portfolio.category==="SCPI").map(portfolio=>portfolio.id));
  for(const position of positions.filter(position=>scpiPortfolioIds.has(position.portfolioId))){
    position.currentPrice=null;position.marketValueEur=position.investedEur;position.gainEur="0";position.performancePct="0";
    position.dayAmountEur="0";position.dayPerformancePct="0";position.monthAmountEur="0";position.monthPerformancePct="0";position.priceFetchedAt=null;
  }
  const lifeRows=await database.query<{portfolio_id:string;current_eur:string;initial_eur:string}>(
    `SELECT p.id portfolio_id,(latest.value*latest.fx_to_eur)::text current_eur,(initial.value*initial.fx_to_eur)::text initial_eur
       FROM portfolios p
       JOIN LATERAL(SELECT value,fx_to_eur FROM life_insurance_valuations WHERE portfolio_id=p.id ORDER BY effective_at DESC LIMIT 1) latest ON true
       JOIN LATERAL(SELECT value,fx_to_eur FROM life_insurance_valuations WHERE portfolio_id=p.id ORDER BY effective_at ASC LIMIT 1) initial ON true
      WHERE p.user_id=$1 AND p.category='LIFE_INSURANCE'`,[userId]);
  const lifeByPortfolio=new Map(lifeRows.rows.map(row=>[row.portfolio_id,row]));
  for(const row of lifeRows.rows)investedByPortfolio.set(row.portfolio_id,new Decimal(row.initial_eur));
  const portfolios:PortfolioSummary[]=portfolioResult.rows.map(portfolio=>{const owned=positions.filter(position=>position.portfolioId===portfolio.id);const life=lifeByPortfolio.get(portfolio.id);const complete=owned.every(position=>position.marketValueEur!==null);const invested=investedByPortfolio.get(portfolio.id)??new Decimal(0);const assetMarket=complete?owned.reduce((sum,position)=>sum.add(position.marketValueEur!),new Decimal(0)):null;const market=assetMarket===null?null:assetMarket.add(life?.current_eur??0);const gain=market?.sub(invested)??null;return{...portfolio,positionCount:owned.length+(life?1:0),transactionCount:transactionCount.get(portfolio.id)??0,investedEur:invested.toString(),marketValueEur:market?.toString()??null,gainEur:gain?.toString()??null,performancePct:gain&&!invested.isZero()?gain.div(invested).mul(100).toString():null,weightPct:null};});
  const personalPortfolios=portfolios.filter(portfolio=>!isMilanPortfolioName(portfolio.name));
  const personalPortfolioIds=new Set(personalPortfolios.map(portfolio=>portfolio.id));
  const personalPositions=positions.filter(position=>personalPortfolioIds.has(position.portfolioId));
  const totalInvestedEur=personalPortfolios.reduce((sum,portfolio)=>sum.add(portfolio.investedEur),new Decimal(0));
  const fullyValued=personalPortfolios.every(portfolio=>portfolio.positionCount===0||portfolio.marketValueEur!==null);const totalMarketValue=fullyValued?personalPortfolios.reduce((sum,portfolio)=>sum.add(portfolio.marketValueEur??0),new Decimal(0)):null;
  for(const portfolio of portfolios)if(portfolio.marketValueEur&&totalMarketValue&&!totalMarketValue.isZero())portfolio.weightPct=new Decimal(portfolio.marketValueEur).div(totalMarketValue).mul(100).toString();
  const preferences=await database.query<{available_capital_eur:string}>(`SELECT available_capital_eur::text FROM app_preferences WHERE user_id=$1`,[userId]);
  const dividends=await database.query<{total:string}>(`SELECT coalesce(sum(t.net_amount*t.fx_to_eur),0)::text total FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id WHERE p.user_id=$1 AND t.kind='DIVIDEND' AND p.name NOT ILIKE 'Mil_n%'`,[userId]);
  const benchmarkRows=await database.query<BenchmarkRow>(
    `SELECT b.id,b.name,b.ticker,b.currency,
      latest.price::text,latest.fetched_at,day_ref.price::text day_price,month_ref.price::text month_price,year_ref.price::text year_price
     FROM market_benchmarks b
     LEFT JOIN LATERAL(SELECT price,fetched_at FROM market_benchmark_prices WHERE benchmark_id=b.id ORDER BY fetched_at DESC LIMIT 1) latest ON true
     LEFT JOIN LATERAL(SELECT price FROM market_benchmark_prices WHERE benchmark_id=b.id AND fetched_at < date_trunc('day',now()) ORDER BY fetched_at DESC LIMIT 1) day_ref ON true
     LEFT JOIN LATERAL(SELECT price FROM market_benchmark_prices WHERE benchmark_id=b.id AND fetched_at < date_trunc('month',now()) ORDER BY fetched_at DESC LIMIT 1) month_ref ON true
     LEFT JOIN LATERAL(SELECT price FROM market_benchmark_prices WHERE benchmark_id=b.id AND fetched_at < date_trunc('year',now()) ORDER BY fetched_at DESC LIMIT 1) year_ref ON true
     ORDER BY b.display_order`);
  const benchmarks=benchmarkRows.rows.map(row=>({id:row.id,name:row.name,ticker:row.ticker,currency:row.currency,price:row.price,fetchedAt:row.fetched_at?.toISOString()??null,dayPct:ratio(row.price,row.day_price),monthPct:ratio(row.price,row.month_price),yearPct:ratio(row.price,row.year_price),dayAmount:difference(row.price,row.day_price),monthAmount:difference(row.price,row.month_price),yearAmount:difference(row.price,row.year_price)}));
  const valuedPortfolios=personalPortfolios.filter(portfolio=>portfolio.positionCount>0&&portfolio.marketValueEur!==null);
  async function periodMetric(boundary:"day"|"month"|"year",selected=valuedPortfolios):Promise<PeriodMetric>{
    if(!selected.length)return emptyPeriod();let opening=new Decimal(0);let closing=new Decimal(0);let adjustment=new Decimal(0);const missingAssets:string[]=[];
    for(const portfolio of selected){
      const reference=await database.query<{day:string;economic_value_eur:string}>(
        `SELECT day::text,economic_value_eur::text FROM valuation_snapshots WHERE portfolio_id=$1 AND day<date_trunc($2,now())::date AND status NOT IN('INCOMPLETE','INVALIDATED') ORDER BY day DESC LIMIT 1`,[portfolio.id,boundary]);
      const row=reference.rows[0];
      // Un portefeuille ouvert pendant la pÃ©riode n'a logiquement aucune
      // valeur d'ouverture. Ses achats restent toutefois des flux externes :
      // ils ne doivent pas empÃªcher le calcul des autres portefeuilles.
      const movements=row
        ?await database.query<{external_flow:string;income:string}>(
          `SELECT coalesce(sum(external_flow_amount*fx_to_eur),0)::text external_flow,coalesce(sum(distributed_income_amount*fx_to_eur),0)::text income FROM cash_movements WHERE portfolio_id=$1 AND occurred_at::date>$2::date`,[portfolio.id,row.day])
        :await database.query<{external_flow:string;income:string}>(
          `SELECT coalesce(sum(external_flow_amount*fx_to_eur),0)::text external_flow,coalesce(sum(distributed_income_amount*fx_to_eur),0)::text income FROM cash_movements WHERE portfolio_id=$1 AND occurred_at>=date_trunc($2::text,now())`,[portfolio.id,boundary]);
      const externalFlow=new Decimal(movements.rows[0]?.external_flow??0);
      const income=new Decimal(movements.rows[0]?.income??0);
      if(!row&&externalFlow.isZero()&&income.isZero()){
        if(portfolio.category!=="LIFE_INSURANCE"&&portfolio.category!=="SCPI")missingAssets.push(portfolio.name);
        continue;
      }
      if(row)opening=opening.add(row.economic_value_eur);
      closing=closing.add(portfolio.marketValueEur!);adjustment=adjustment.sub(externalFlow).add(income);
    }
    if(opening.isZero())return{...emptyPeriod(),missingAssets};const amount=closing.sub(opening).add(adjustment);return{amountEur:amount.toString(),percent:amount.div(opening).mul(100).toString(),missingAssets};
  }
  const[snapshotMonth,year]=await Promise.all([periodMetric("month"),periodMetric("year")]);
  // La performance journalière doit toujours partir des clôtures de veille.
  // Un snapshot pris pendant une séance (notamment avant la clôture US) n'est
  // pas une valeur d'ouverture fiable et peut fortement gonfler le résultat.
  const day=marketPeriodFallback(personalPositions,"day");
  const month=snapshotMonth.percent===null?marketPeriodFallback(personalPositions,"month"):snapshotMonth;
  const groupDefinitions=[
    {id:"actions" as const,name:"Actions",match:(portfolio:PortfolioSummary)=>!isMilanPortfolioName(portfolio.name)&&portfolio.category==="EQUITY"},
    {id:"etf" as const,name:"ETF",match:(portfolio:PortfolioSummary)=>!isMilanPortfolioName(portfolio.name)&&portfolio.category==="ETF"},
    {id:"crypto" as const,name:"Crypto",match:(portfolio:PortfolioSummary)=>!isMilanPortfolioName(portfolio.name)&&portfolio.category==="CRYPTO"},
    {id:"milan" as const,name:"Milàn",match:(portfolio:PortfolioSummary)=>isMilanPortfolioName(portfolio.name)},
  ];
  const portfolioGroups:PortfolioGroupSummary[]=await Promise.all(groupDefinitions.map(async definition=>{
    const members=portfolios.filter(definition.match);const active=members.filter(portfolio=>portfolio.positionCount>0&&portfolio.marketValueEur!==null);
    const invested=members.reduce((sum,portfolio)=>sum.add(portfolio.investedEur),new Decimal(0));
    const complete=members.every(portfolio=>portfolio.marketValueEur!==null);const market=complete?members.reduce((sum,portfolio)=>sum.add(portfolio.marketValueEur!),new Decimal(0)):null;
    const gain=market?.sub(invested)??null;const global=gain===null||invested.isZero()?emptyPeriod():{amountEur:gain.toString(),percent:gain.div(invested).mul(100).toString()};
    const[snapshotGroupMonth,groupYear]=await Promise.all([periodMetric("month",active),periodMetric("year",active)]);
    const memberIds=new Set(members.map(portfolio=>portfolio.id));
    const groupPositions=positions.filter(position=>memberIds.has(position.portfolioId));
    const groupDay=marketPeriodFallback(groupPositions,"day");
    const groupMonth=snapshotGroupMonth.percent===null?marketPeriodFallback(groupPositions,"month"):snapshotGroupMonth;
    return{id:definition.id,name:definition.name,positionCount:members.reduce((sum,portfolio)=>sum+portfolio.positionCount,0),marketValueEur:market?.toString()??null,investedEur:invested.toString(),day:groupDay,global,month:groupMonth,year:groupYear};
  }));
  const totalGain=totalMarketValue?.sub(totalInvestedEur)??null;
  return{portfolios,positions,benchmarks,totalInvestedEur:totalInvestedEur.toString(),totalMarketValueEur:totalMarketValue?.toString()??null,totalGainEur:totalGain?.toString()??null,globalPerformancePct:totalGain&&!totalInvestedEur.isZero()?totalGain.div(totalInvestedEur).mul(100).toString():null,availableCapitalEur:preferences.rows[0]?.available_capital_eur??"0",dividendsEur:dividends.rows[0]?.total??"0",periodPerformance:{day,month,year},portfolioGroups};
}
