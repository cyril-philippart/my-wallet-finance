import Decimal from "decimal.js";
import {redirect} from "next/navigation";
import {getCurrentUser} from "../../src/server/auth.js";
import {getDashboardData,getEditableTransactions,type PeriodMetric} from "../../src/server/portfolio-queries.js";
import {isMarketOpen} from "../../src/domain/market-hours.js";
import {Sidebar} from "../sidebar";
import {AssetTypeEditor} from "../portefeuilles/asset-type-editor";
import {SortableTable} from "../sortable-table";

const isMilan=(name:string)=>name.toLocaleLowerCase("fr").normalize("NFD").replace(/\p{Diacritic}/gu,"").startsWith("milan");
const eur=(value:string|null)=>value===null?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value));
const num=(value:string|number|null,digits=2)=>value===null?"—":new Intl.NumberFormat("fr-FR",{maximumFractionDigits:digits}).format(Number(value));
const pct=(value:string|null)=>value===null?"—":`${Number(value)>0?"+":""}${num(value)} %`;
const tone=(value:string|null)=>value===null?"neutral":Number(value)>0?"positive":Number(value)<0?"negative":"";
const shortName=(name:string)=>name.replace(/^Milàn\s*[—-]\s*/i,"");
const assetLabel=(name:string,max=46)=>name.length<=max?name:`${name.slice(0,max-1).trimEnd()}…`;

function Metric({label,metric,closed=false}:{label:string;metric:PeriodMetric|undefined;closed?:boolean}){
  return <article><span>{label}</span>{closed?<strong><span className="marketClosed">Closed</span></strong>:<><strong className={tone(metric?.percent??null)}>{pct(metric?.percent??null)}</strong><small className={tone(metric?.amountEur??null)}>{metric?.amountEur===null||metric===undefined?"Historique insuffisant":eur(metric.amountEur)}</small></>}</article>;
}

export default async function MilanPage(){
  const user=await getCurrentUser();if(!user)redirect("/login");
  const data=await getDashboardData(user.id);
  const portfolios=data.portfolios.filter(portfolio=>isMilan(portfolio.name));
  const portfolioIds=new Set(portfolios.map(portfolio=>portfolio.id));
  const positions=data.positions.filter(position=>portfolioIds.has(position.portfolioId));
  const editableTransactions=await getEditableTransactions(user.id,positions.map(position=>position.assetId));
  const group=data.portfolioGroups.find(item=>item.id==="milan");
  const invested=portfolios.reduce((sum,portfolio)=>sum.add(portfolio.investedEur),new Decimal(0));
  const complete=portfolios.every(portfolio=>portfolio.positionCount===0||portfolio.marketValueEur!==null);
  const value=complete?portfolios.reduce((sum,portfolio)=>sum.add(portfolio.marketValueEur??0),new Decimal(0)):null;
  const gain=value?.sub(invested)??null;
  const globalPct=gain&&!invested.isZero()?gain.div(invested).mul(100).toString():null;
  const quotedPositions=positions.filter(position=>position.googleTicker!==null);
  const allQuotedClosed=quotedPositions.length>0&&quotedPositions.every(position=>!isMarketOpen(position.googleTicker!));
  return <main className="shell"><Sidebar active="milan" portfolios={data.portfolios}/><section className="content portfolioPage portfolioPage-milan">
    <header className="portfolioPageHeader"><div><p className="eyebrow">Portefeuille dédié</p><h1>Milàn</h1></div><a className="backDashboard" href="/"><span aria-hidden="true">←</span> Retour au Dashboard</a></header>
    <div className="portfolioTotals">
      <article><span>Total investi</span><strong>{eur(invested.toString())}</strong></article>
      <article><span>Valeur actuelle</span><strong>{eur(value?.toString()??null)}</strong></article>
      <Metric label="Performance du jour" metric={group?.day} closed={allQuotedClosed}/>
      <article><span>Performance totale</span><strong className={tone(globalPct)}>{pct(globalPct)}</strong><small className={tone(gain?.toString()??null)}>{eur(gain?.toString()??null)}</small></article>
      <Metric label="Performance du mois" metric={group?.month}/>
    </div>
    <SortableTable className="tableWrap portfolioAssetTable"><table><thead><tr><th>Actif</th><th>Quantité</th><th>Total acheté</th><th>Répartition</th><th>Code de cotation</th><th>Cours actuel</th><th>PRU</th><th>Valeur actuelle</th><th>Évol. veille</th><th>Var. €</th><th>Perf. totale</th><th>Gain/perte €</th><th/></tr></thead><tbody>
      {positions.map(position=>{const allocation=invested.isZero()?null:new Decimal(position.investedEur).div(invested).mul(100).toString();const closed=position.googleTicker!==null&&!isMarketOpen(position.googleTicker);const type=position.googleTicker?.toUpperCase().startsWith("BTC")?"BTC":position.googleTicker?.toUpperCase().startsWith("ETH")?"ETH":portfolios.find(portfolio=>portfolio.id===position.portfolioId)?.category==="ETF"?"ETF":"ACTIONS";return <tr key={`${position.portfolioId}:${position.assetId}`}><td><span className="assetLogo">{position.symbol.slice(0,2)}</span><span className="assetNameTooltip" data-full-name={position.name}><b>{assetLabel(position.name)}</b></span></td><td>{num(position.quantity,8)}</td><td>{eur(position.investedEur)}</td><td>{allocation===null?"—":`${num(allocation)} %`}</td><td><code>{position.googleTicker??"—"}</code></td><td>{eur(position.currentPrice)}</td><td>{eur(position.averageCostNative)}</td><td>{eur(position.marketValueEur)}</td><td className={`performanceCell ${tone(position.dayAmountEur)}`}>{closed?<span className="marketClosed">Closed</span>:<b>{pct(position.dayPerformancePct)}</b>}</td><td className={`performanceAmountCell ${tone(position.dayAmountEur)}`}>{closed?"—":<i>{eur(position.dayAmountEur)}</i>}</td><td className={`performanceCell ${tone(position.performancePct)}`}><b>{pct(position.performancePct)}</b></td><td className={`performanceAmountCell ${tone(position.gainEur)}`}><i>{eur(position.gainEur)}</i></td><td><AssetTypeEditor assetId={position.assetId} name={position.name} ticker={position.googleTicker??""} current={type} transactions={editableTransactions.get(position.assetId)??[]}/></td></tr>})}
      {portfolios.filter(portfolio=>portfolio.category==="LIFE_INSURANCE"&&portfolio.positionCount>0).map(portfolio=>{const allocation=invested.isZero()?null:new Decimal(portfolio.investedEur).div(invested).mul(100).toString();return <tr key={portfolio.id}><td><span className="assetLogo">FE</span><span><b>{shortName(portfolio.name)}</b></span></td><td>—</td><td>{eur(portfolio.investedEur)}</td><td>{allocation===null?"—":`${num(allocation)} %`}</td><td><code>Non coté</code></td><td>—</td><td>—</td><td>{eur(portfolio.marketValueEur)}</td><td>—</td><td>—</td><td className={`performanceCell ${tone(portfolio.performancePct)}`}><b>{pct(portfolio.performancePct)}</b></td><td className={`performanceAmountCell ${tone(portfolio.gainEur)}`}><i>{eur(portfolio.gainEur)}</i></td><td/></tr>})}
      <tr className="portfolioTotalRow"><td><b>Total</b></td><td>—</td><td>{eur(invested.toString())}</td><td>100 %</td><td>—</td><td>—</td><td>—</td><td>{eur(value?.toString()??null)}</td><td className={`performanceCell ${tone(group?.day.amountEur??null)}`}><b>{allQuotedClosed?"Closed":pct(group?.day.percent??null)}</b></td><td className={`performanceAmountCell ${tone(group?.day.amountEur??null)}`}>{allQuotedClosed?"—":<i>{eur(group?.day.amountEur??null)}</i>}</td><td className={`performanceCell ${tone(globalPct)}`}><b>{pct(globalPct)}</b></td><td className={`performanceAmountCell ${tone(gain?.toString()??null)}`}><i>{eur(gain?.toString()??null)}</i></td><td/></tr>
    </tbody></table></SortableTable>
  </section></main>;
}
