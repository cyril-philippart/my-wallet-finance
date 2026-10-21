"use client";

import type { DashboardData } from "../../src/server/portfolio-queries";
import { TransactionForm } from "../transactions/transaction-form";
import { MarketSync } from "../market-sync";
import { CapitalEditor } from "./capital-editor";
import { isMarketOpen } from "../../src/domain/market-hours";
import { useEffect,useState } from "react";
import { Sidebar } from "../sidebar";
import type { PokemonSummary } from "../../src/server/zebradex-provider";
import {PortfolioHistoryChart} from "./portfolio-history-chart";
import type {StoredWealthPoint} from "../../src/server/wealth-history";
import type {WealthEvent} from "../../src/server/wealth-events";

const eur=(value:string|null)=>value===null?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value));
const num=(value:string|null,digits=2)=>value===null?"—":new Intl.NumberFormat("fr-FR",{maximumFractionDigits:digits}).format(Number(value));
const pct=(value:string|null)=>value===null?"—":`${Number(value)>0?"+":""}${num(value)} %`;
const tone=(value:string|null)=>value===null?"neutral":Number(value)>0?"positive":Number(value)<0?"negative":"";
const currencySymbol=(currency:string)=>currency==="EUR"?"€":currency==="USD"?"$":currency;
const marketChange=(percent:string|null,amount:string|null,currency:string)=><span className={`marketChange ${tone(percent)}`}><b>{pct(percent)}</b><small>{amount===null?"":`${num(String(Math.abs(Number(amount))))} ${currencySymbol(currency)}`}</small></span>;
function DailyMarketChange({ticker,percent,amount,currency}:{ticker:string;percent:string|null;amount:string|null;currency:string}){
  const[now,setNow]=useState<Date|null>(null);
  useEffect(()=>{const update=()=>setNow(new Date());update();const timer=window.setInterval(update,60_000);return()=>window.clearInterval(timer);},[]);
  if(now&&!isMarketOpen(ticker,now))return <span className="marketClosed">Closed</span>;
  return marketChange(percent,amount,currency);
}

function PartialWarning({names,period}:{names:string[];period:string}){
  if(!names.length)return null;
  return <sup className="partialMetricWarning">*<span className="partialMetricTooltip"><b>Cotation{names.length>1?"s":""} {period} indisponible{names.length>1?"s":""}</b><ul>{names.map(name=><li key={name}>{name}</li>)}</ul><em>Performance calculée sur les autres positions.</em></span></sup>;
}
function PerformanceCard({label,percent,amount,note,missingAssets=[],warningPeriod="de veille",closed=false}:{label:string;percent:string|null;amount:string|null;note?:string|undefined;missingAssets?:string[]|undefined;warningPeriod?:string|undefined;closed?:boolean|undefined}){
  return <article className="performanceCard"><span>{label}</span>{closed?<strong><span className="marketClosed">Closed</span></strong>:<><strong className={tone(percent)}>{pct(percent)}<PartialWarning names={missingAssets} period={warningPeriod}/></strong><small className={tone(amount)}>{amount===null?(note??"Historique insuffisant"):eur(amount)}</small></>}</article>;
}
function ComparisonPerformanceCard({label,withPercent,withAmount,withoutPercent,withoutAmount,missingAssets=[]}:{label:string;withPercent:string|null;withAmount:string|null;withoutPercent:string|null;withoutAmount:string|null;missingAssets?:string[]|undefined}){
  return <article className="performanceCard comparisonPerformanceCard"><span>{label}</span><div className="comparisonMetrics"><div className="comparisonMetric withPokemon"><small><i/>Avec Pokémon</small><strong className={tone(withPercent)}>{pct(withPercent)}<PartialWarning names={missingAssets} period="de veille"/></strong><em className={tone(withAmount)}>{withAmount===null?"Historique insuffisant":eur(withAmount)}</em></div><div className="comparisonMetric withoutPokemon"><small><i/>Sans Pokémon</small><strong className={tone(withoutPercent)}>{pct(withoutPercent)}<PartialWarning names={missingAssets} period="de veille"/></strong><em className={tone(withoutAmount)}>{withoutAmount===null?"Historique insuffisant":eur(withoutAmount)}</em></div></div></article>;
}
function GroupMetric({label,percent,amount,missingAssets=[],warningPeriod="de veille",closed=false}:{label:string;percent:string|null;amount:string|null;missingAssets?:string[]|undefined;warningPeriod?:string|undefined;closed?:boolean|undefined}){
  return <div className="groupMetric"><span>{label}</span>{closed?<b><span className="marketClosed">Closed</span></b>:<><b className={tone(percent)}>{pct(percent)}<PartialWarning names={missingAssets} period={warningPeriod}/></b><small className={tone(amount)}>{amount===null?"—":eur(amount)}</small></>}</div>;
}

export default function Dashboard(props:DashboardData&{priceSyncConfigured:boolean;pokemon:PokemonSummary|null;wealthHistory:StoredWealthPoint[];wealthEvents:WealthEvent[]}){
  const{portfolios,positions,benchmarks,portfolioGroups,totalInvestedEur,totalMarketValueEur,totalGainEur,globalPerformancePct,availableCapitalEur,dividendsEur,periodPerformance,priceSyncConfigured,pokemon,wealthHistory,wealthEvents}=props;
  const[now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer);},[]);
  const quotedPositions=positions.filter(position=>position.googleTicker);
  const allPositionsClosed=quotedPositions.length>0&&quotedPositions.every(position=>!isMarketOpen(position.googleTicker!,now));
  const groupClosed=(groupId:string)=>{const groupPositions=positions.filter(position=>{const portfolio=portfolios.find(item=>item.id===position.portfolioId);if(!portfolio||!position.googleTicker)return false;const milan=portfolio.name.toLocaleLowerCase("fr").startsWith("milàn");if(groupId==="milan")return milan;if(milan)return false;return(groupId==="actions"&&portfolio.category==="EQUITY")||(groupId==="etf"&&portfolio.category==="ETF")||(groupId==="crypto"&&portfolio.category==="CRYPTO");});return groupPositions.length>0&&groupPositions.every(position=>!isMarketOpen(position.googleTicker!,now));};
  const combinedMarket=totalMarketValueEur===null?null:String(Number(totalMarketValueEur)+Number(pokemon?.currentValueEur??0));
  const combinedInvested=String(Number(totalInvestedEur)+Number(pokemon?.investedEur??0));
  const combinedGain=totalGainEur===null?null:String(Number(totalGainEur)+Number(pokemon?.gainEur??0));
  const combinedGlobalPct=combinedGain===null||Number(combinedInvested)===0?null:String(Number(combinedGain)/Number(combinedInvested)*100);
  const combinedDayAmount=periodPerformance.day.amountEur===null?null:String(Number(periodPerformance.day.amountEur)+Number(pokemon?.dayAmountEur??0));
  const combinedDayOpening=combinedDayAmount===null||combinedMarket===null?null:Number(combinedMarket)-Number(combinedDayAmount);
  const combinedDayPct=combinedDayOpening===null||combinedDayOpening===0?null:String(Number(combinedDayAmount)/combinedDayOpening*100);
  return <main className="shell">
    <Sidebar portfolios={portfolios}/>

    <section className="content" id="overview">
      <header className="topbar"><button className="mobileBrand" aria-label="Menu">W</button><div><p className="eyebrow">Tableau de bord</p><h1>Bonjour Cyril.</h1></div><TransactionForm portfolios={portfolios} weeklyBtcReminder/></header>
      <MarketSync configured={priceSyncConfigured}/>

      <section className="wealthGrid">
        <article className="wealthMain"><p className="eyebrow">Patrimoine placé</p><strong>{eur(combinedMarket)}</strong><span>{totalMarketValueEur===null?"Certains cours sont manquants":"Placements financiers et collection Pokémon"}</span></article>
        <article className="wealthMetric"><span>Capital investi</span><strong>{eur(combinedInvested)}</strong><small>Coût des positions et de la collection</small></article>
        <article className="wealthMetric"><span>Capital disponible</span><strong>{eur(availableCapitalEur)}</strong><small>Montant renseigné manuellement</small><CapitalEditor value={availableCapitalEur}/></article>
        <article className="wealthMetric"><span>Dividendes reçus</span><strong>{eur(dividendsEur)}</strong><small>Total net enregistré</small></article>
      </section>

      <section className="performanceGrid" aria-label="Performances">
        <ComparisonPerformanceCard label="Performance du jour" withPercent={combinedDayPct} withAmount={combinedDayAmount} withoutPercent={periodPerformance.day.percent} withoutAmount={periodPerformance.day.amountEur} missingAssets={periodPerformance.day.missingAssets}/>
        <ComparisonPerformanceCard label="Performance globale" withPercent={combinedGlobalPct} withAmount={combinedGain} withoutPercent={globalPerformancePct} withoutAmount={totalGainEur}/>
        <PerformanceCard label="Performance du mois · hors Pokémon" percent={periodPerformance.month.percent} amount={periodPerformance.month.amountEur} missingAssets={periodPerformance.month.missingAssets} warningPeriod="de fin de mois"/>
        <PerformanceCard label="Performance de l’année · hors Pokémon" percent={periodPerformance.year.percent} amount={periodPerformance.year.amountEur}/>
      </section>

      <PortfolioHistoryChart liveHistory={wealthHistory} events={wealthEvents}/>

      <section id="markets">
        <div className="sectionHeading"><div><p className="eyebrow">Points de repère</p><h2>Marchés</h2></div><small className="sectionHint">Les variations apparaîtront après constitution de l’historique.</small></div>
        <div className="benchmarkPanel"><div className="benchmarkHead"><span>Indice</span><span>Jour</span><span>Mois</span><span>Année</span><span>Cours</span></div>{benchmarks.map(item=><div className="benchmarkRow" key={item.id}><div><b>{item.name}</b></div><DailyMarketChange ticker={item.ticker} percent={item.dayPct} amount={item.dayAmount} currency={item.currency}/>{marketChange(item.monthPct,item.monthAmount,item.currency)}{marketChange(item.yearPct,item.yearAmount,item.currency)}<span>{item.price===null?"—":`${num(item.price)} ${currencySymbol(item.currency)}`}</span></div>)}</div>
      </section>

      <section id="portfolios">
        <div className="sectionHeading"><div><p className="eyebrow">Répartition des performances</p><h2>Mes catégories d’investissement</h2></div></div>
        <div className="groupBoard">
          <div className="groupBoardHead"><span>Catégorie</span><span>Performance du jour</span><span>Performance globale</span><span>Performance du mois</span><span>Performance de l’année</span></div>
          {portfolioGroups.filter(group=>group.id!=="milan").map(group=><article className={`groupRow group-${group.id}`} key={group.id}><div className="groupIdentity"><span className="groupMonogram">{group.name.slice(0,1)}</span><div><h3>{group.name}</h3><p>{group.positionCount} position{group.positionCount>1?"s":""} · <b>{eur(group.marketValueEur)}</b></p></div></div><GroupMetric label="Jour" percent={group.day.percent} amount={group.day.amountEur} missingAssets={group.day.missingAssets} closed={groupClosed(group.id)}/><GroupMetric label="Global" percent={group.global.percent} amount={group.global.amountEur}/><GroupMetric label="Mois" percent={group.month.percent} amount={group.month.amountEur} missingAssets={group.month.missingAssets} warningPeriod="de fin de mois"/><GroupMetric label="Année" percent={group.year.percent} amount={group.year.amountEur}/></article>)}
          {pokemon&&<article className="groupRow group-pokemon"><div className="groupIdentity"><span className="groupMonogram">P</span><div><h3>Pokémon</h3><p>{pokemon.itemsCount??"—"} objets · <b>{eur(pokemon.currentValueEur)}</b></p><a className="zebradexLink" href="https://zebradex.fr/stats" target="_blank" rel="noreferrer">Ouvrir ZebraDex <span aria-hidden="true">↗</span></a></div></div><GroupMetric label="Jour" percent={pokemon.dayPercent} amount={pokemon.dayAmountEur}/><GroupMetric label="Global" percent={pokemon.performancePct} amount={pokemon.gainEur}/><GroupMetric label="Mois" percent={null} amount={null}/><GroupMetric label="Année" percent={null} amount={null}/></article>}
          <div className="groupDivider"><span>Portefeuille dédié</span></div>
          {portfolioGroups.filter(group=>group.id==="milan").map(group=><article className={`groupRow group-${group.id}`} key={group.id}><div className="groupIdentity"><span className="groupMonogram">{group.name.slice(0,1)}</span><div><h3>{group.name}</h3><p>{group.positionCount} position{group.positionCount>1?"s":""} · <b>{eur(group.marketValueEur)}</b></p></div></div><GroupMetric label="Jour" percent={group.day.percent} amount={group.day.amountEur} missingAssets={group.day.missingAssets} closed={groupClosed(group.id)}/><GroupMetric label="Global" percent={group.global.percent} amount={group.global.amountEur}/><GroupMetric label="Mois" percent={group.month.percent} amount={group.month.amountEur} missingAssets={group.month.missingAssets} warningPeriod="de fin de mois"/><GroupMetric label="Année" percent={group.year.percent} amount={group.year.amountEur}/></article>)}
        </div>
      </section>

    </section>
  </main>;
}
