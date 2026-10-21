import Decimal from "decimal.js";
import {notFound,redirect} from "next/navigation";
import {getCurrentUser} from "../../../src/server/auth.js";
import {getDashboardData,getEditableTransactions,type AssetCategory,type PeriodMetric} from "../../../src/server/portfolio-queries.js";
import {Sidebar} from "../../sidebar";
import {AssetTypeEditor} from "../asset-type-editor";
import {SortableTable} from "../../sortable-table";
import {isMarketOpen} from "../../../src/domain/market-hours";

const definitions:Record<string,{title:string;categories:AssetCategory[]}>= {
  actions:{title:"Actions",categories:["EQUITY"]},etf:{title:"ETF",categories:["ETF"]},crypto:{title:"Crypto",categories:["CRYPTO"]},
  scpi:{title:"SCPI",categories:["SCPI"]},"assurance-vie":{title:"Assurance-vie",categories:["LIFE_INSURANCE"]},
};
const eur=(value:string|null)=>value===null?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value));
const num=(value:string|number|null,digits=2)=>value===null?"—":new Intl.NumberFormat("fr-FR",{maximumFractionDigits:digits}).format(Number(value));
const pct=(value:string|null)=>value===null?"—":`${Number(value)>0?"+":""}${num(value)} %`;
const allocationPct=(value:string|null)=>value===null?"—":`${num(value)} %`;
const tone=(value:string|null)=>value===null?"neutral":Number(value)>0?"positive":Number(value)<0?"negative":"";
const assetLabel=(name:string,max=46)=>name.length<=max?name:`${name.slice(0,max-1).trimEnd()}…`;

function PartialMetricWarning({names,period="de veille"}:{names:string[];period?:string|undefined}){
  return <sup className="partialMetricWarning">*<span className="partialMetricTooltip"><b>Cotation{names.length>1?"s":""} {period} indisponible{names.length>1?"s":""}</b><ul>{names.map(name=><li key={name}>{name}</li>)}</ul><em>Performance calculée sur les autres positions.</em></span></sup>;
}
function PeriodCard({label,metric,warningNames,warningPeriod,closed=false}:{label:string;metric:PeriodMetric|undefined;warningNames?:string[]|undefined;warningPeriod?:string|undefined;closed?:boolean|undefined}){
  return <article><span>{label}</span>{closed?<strong><span className="marketClosed">Closed</span></strong>:<><strong className={tone(metric?.percent??null)}>{pct(metric?.percent??null)}{warningNames?.length?<PartialMetricWarning names={warningNames} period={warningPeriod}/>:null}</strong><small className={tone(metric?.amountEur??null)}>{metric?.amountEur===null||metric===undefined?"Historique insuffisant":eur(metric.amountEur)}</small></>}</article>;
}

export default async function PortfolioGroupPage({params}:{params:Promise<{group:string}>}){
  const user=await getCurrentUser();if(!user)redirect("/login");
  const{group}=await params;const definition=definitions[group];if(!definition)notFound();
  const isScpi=group==="scpi";
  const data=await getDashboardData(user.id);
  const portfolioIds=new Set(data.portfolios.filter(item=>definition.categories.includes(item.category)&&!item.name.toLocaleLowerCase("fr").startsWith("milàn")).map(item=>item.id));
  const positions=data.positions.filter(item=>portfolioIds.has(item.portfolioId));
  const editableTransactions=await getEditableTransactions(user.id,positions.map(item=>item.assetId));
  const portfolios=data.portfolios.filter(item=>portfolioIds.has(item.id));
  const totalInvested=positions.reduce((sum,item)=>sum.add(item.investedEur),new Decimal(0));
  const allPositionsValued=positions.every(item=>item.marketValueEur!==null);
  const totalValue=positions.reduce((sum,item)=>item.marketValueEur===null?sum:sum.add(item.marketValueEur),new Decimal(0));
  const totalGain=allPositionsValued?totalValue.sub(totalInvested):null;
  const dailyPositions=positions.filter(item=>item.marketValueEur!==null&&item.dayAmountEur!==null);
  const missingDailyPositions=positions.filter(item=>item.dayAmountEur===null);
  const totalDay=dailyPositions.reduce((sum,item)=>sum.add(item.dayAmountEur!),new Decimal(0));
  const monthlyPositions=positions.filter(item=>item.marketValueEur!==null&&item.monthAmountEur!==null);
  const missingMonthlyPositions=positions.filter(item=>item.monthAmountEur===null);
  const totalMonth=monthlyPositions.reduce((sum,item)=>sum.add(item.monthAmountEur!),new Decimal(0));
  const totalPerformancePct=totalGain===null||totalInvested.isZero()?null:totalGain.div(totalInvested).mul(100).toString();
  const editableType=group==="actions"?"ACTIONS":group==="etf"?"ETF":group==="scpi"?"SCPI":group==="crypto"?"CRYPTO":null;
  const summaryGroup=data.portfolioGroups.find(item=>item.id===group);
  const coveredDayValue=dailyPositions.reduce((sum,item)=>sum.add(item.marketValueEur!),new Decimal(0));
  const previousDayValue=dailyPositions.length?coveredDayValue.sub(totalDay):null;
  const fallbackDay:PeriodMetric={amountEur:dailyPositions.length?totalDay.toString():null,percent:previousDayValue&&!previousDayValue.isZero()?totalDay.div(previousDayValue).mul(100).toString():null};
  const usesFallback=summaryGroup?.day.percent===null||summaryGroup?.day.percent===undefined;
  const displayedDay=usesFallback?fallbackDay:summaryGroup!.day;
  const missingDailyNames=usesFallback?missingDailyPositions.map(item=>item.name):[];
  const coveredMonthValue=monthlyPositions.reduce((sum,item)=>sum.add(item.marketValueEur!),new Decimal(0));
  const previousMonthValue=monthlyPositions.length?coveredMonthValue.sub(totalMonth):null;
  const fallbackMonth:PeriodMetric={amountEur:monthlyPositions.length?totalMonth.toString():null,percent:previousMonthValue&&!previousMonthValue.isZero()?totalMonth.div(previousMonthValue).mul(100).toString():null};
  const usesMonthFallback=summaryGroup?.month.percent===null||summaryGroup?.month.percent===undefined;
  const displayedMonth=usesMonthFallback?fallbackMonth:summaryGroup!.month;
  const missingMonthlyNames=usesMonthFallback?missingMonthlyPositions.map(item=>item.name):[];
  const allPositionsClosed=positions.some(position=>position.googleTicker)&&positions.filter(position=>position.googleTicker).every(position=>!isMarketOpen(position.googleTicker!));
  return <main className="shell"><Sidebar active={group} portfolios={data.portfolios}/><section className={`content portfolioPage portfolioPage-${group}`}>
    <header className="portfolioPageHeader"><div><p className="eyebrow">Portefeuilles</p><h1>{definition.title}</h1></div><a className="backDashboard" href="/"><span aria-hidden="true">←</span> Retour au Dashboard</a></header>
    {group==="assurance-vie"?<div className="portfolioSummaryGrid">{portfolios.map(portfolio=><article key={portfolio.id}><span>{portfolio.name}</span><strong>{eur(portfolio.marketValueEur)}</strong><small>{eur(portfolio.investedEur)} investi</small></article>)}</div>:
    positions.length===0?<div className="emptyState"><strong>Aucun actif</strong><span>Les actifs de cette catégorie apparaîtront ici.</span></div>:<>
      <div className="portfolioTotals">
        <article><span>Total investi</span><strong>{eur(totalInvested.toString())}</strong></article>
        {isScpi?<article><span>Valorisation</span><strong>Manuelle</strong><small>Les SCPI ne sont pas cotées en bourse</small></article>:<>
        <article><span>Valeur actuelle</span><strong>{eur(allPositionsValued?totalValue.toString():null)}</strong></article>
        <PeriodCard label="Performance du jour" metric={displayedDay} warningNames={missingDailyNames} closed={allPositionsClosed}/>
        <article><span>Performance totale</span><strong className={tone(totalGain?.toString()??null)}>{pct(totalPerformancePct)}</strong><small className={tone(totalGain?.toString()??null)}>{eur(totalGain?.toString()??null)}</small></article>
        <PeriodCard label="Performance du mois" metric={displayedMonth} warningNames={missingMonthlyNames} warningPeriod="de fin de mois"/>
        </>}
      </div>
      {isScpi?<SortableTable className="tableWrap portfolioAssetTable scpiAssetTable"><table><thead><tr><th>SCPI</th><th>Nombre de parts</th><th>Total acheté</th><th>Répartition</th><th>Prix moyen d’achat</th><th/></tr></thead><tbody>
        {positions.map(position=>{const allocation=totalInvested.isZero()?null:new Decimal(position.investedEur).div(totalInvested).mul(100).toString();return <tr key={`${position.portfolioId}:${position.assetId}`}><td><span className="assetLogo">{position.symbol.slice(0,2)}</span><span className="assetNameTooltip" data-full-name={position.name}><b>{assetLabel(position.name)}</b></span></td><td>{num(position.quantity,8)}</td><td>{eur(position.investedEur)}</td><td>{allocationPct(allocation)}</td><td>{eur(position.averageCostNative)}</td><td><AssetTypeEditor assetId={position.assetId} name={position.name} ticker="" current="SCPI" transactions={editableTransactions.get(position.assetId)??[]}/></td></tr>})}
        <tr className="portfolioTotalRow"><td><b>Total</b></td><td>{num(positions.reduce((sum,item)=>sum+Number(item.quantity),0),8)}</td><td>{eur(totalInvested.toString())}</td><td>100 %</td><td>—</td><td/></tr>
      </tbody></table></SortableTable>:
      <SortableTable className="tableWrap portfolioAssetTable"><table><thead><tr><th>Actif</th><th>Quantité</th><th>Total acheté</th><th>Répartition</th><th>Code de cotation</th><th>Cours actuel</th><th>PRU</th><th>Valeur actuelle</th><th>Évolution veille</th><th>Performance totale</th>{editableType&&<th/>}</tr></thead><tbody>
        {positions.map(position=>{const allocation=totalInvested.isZero()?null:new Decimal(position.investedEur).div(totalInvested).mul(100).toString();const closed=position.googleTicker!==null&&!isMarketOpen(position.googleTicker);const rowType=editableType==="CRYPTO"?(position.googleTicker?.toUpperCase().startsWith("BTC")?"BTC":"ETH"):editableType;return <tr key={`${position.portfolioId}:${position.assetId}`}><td><span className="assetLogo">{position.symbol.slice(0,2)}</span><span className="assetNameTooltip" data-full-name={position.name}><b>{assetLabel(position.name)}</b></span></td><td>{num(position.quantity,8)}</td><td>{eur(position.investedEur)}</td><td>{allocationPct(allocation)}</td><td><code>{position.googleTicker??"—"}</code></td><td>{eur(position.currentPrice)}</td><td>{eur(position.averageCostNative)}</td><td>{eur(position.marketValueEur)}</td><td className={`performanceCell ${tone(position.dayAmountEur)}`}>{closed?<span className="marketClosed">Closed</span>:<><b>{pct(position.dayPerformancePct)}</b><small>{eur(position.dayAmountEur)}</small></>}</td><td className={`performanceCell ${tone(position.performancePct)}`}><b>{pct(position.performancePct)}</b><small>{eur(position.gainEur)}</small></td>{rowType&&<td><AssetTypeEditor assetId={position.assetId} name={position.name} ticker={position.googleTicker??""} current={rowType} transactions={editableTransactions.get(position.assetId)??[]}/></td>}</tr>})}
        <tr className="portfolioTotalRow"><td><b>Total</b></td><td>{num(positions.reduce((sum,item)=>sum+Number(item.quantity),0),8)}</td><td>{eur(totalInvested.toString())}</td><td>100 %</td><td>—</td><td>—</td><td>—</td><td>{eur(allPositionsValued?totalValue.toString():null)}</td><td className={`performanceCell ${tone(displayedDay.amountEur)}`}>{allPositionsClosed?<span className="marketClosed">Closed</span>:<><b>{pct(displayedDay.percent)}{missingDailyNames.length?<PartialMetricWarning names={missingDailyNames}/>:null}</b><small>{eur(displayedDay.amountEur)}</small></>}</td><td className={`performanceCell ${tone(totalGain?.toString()??null)}`}><b>{pct(totalPerformancePct)}</b><small>{eur(totalGain?.toString()??null)}</small></td>{editableType&&<td/>}</tr>
      </tbody></table></SortableTable>}
    </>}
  </section></main>;
}
