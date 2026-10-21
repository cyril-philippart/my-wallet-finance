import {redirect} from "next/navigation";
import {getCurrentUser} from "../../src/server/auth.js";
import {getActivityHistory} from "../../src/server/activity-queries.js";
import {getDashboardData} from "../../src/server/portfolio-queries.js";
import {Sidebar} from "../sidebar";

const labels={BUY:"Achat",SELL:"Vente",DIVIDEND:"Dividende",MODIFIED:"Modification",DELETED:"Suppression"} as const;
const date=(value:string,withTime=false)=>new Intl.DateTimeFormat("fr-FR",withTime?{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Paris"}:{dateStyle:"medium",timeZone:"Europe/Paris"}).format(new Date(value));
const number=(value:string|null)=>value===null?"—":new Intl.NumberFormat("fr-FR",{maximumFractionDigits:8}).format(Number(value));
const eur=(value:string|null)=>value===null?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value));

export default async function HistoryPage(){
  const user=await getCurrentUser();if(!user)redirect("/login");
  const[data,entries]=await Promise.all([getDashboardData(user.id),getActivityHistory(user.id)]);
  return <main className="shell"><Sidebar active="historique" portfolios={data.portfolios}/><section className="content historyPage">
    <header className="portfolioPageHeader"><div><p className="eyebrow">Journal d’activité</p><h1>Historique des opérations</h1></div><a className="backDashboard" href="/"><span aria-hidden="true">←</span> Retour au Dashboard</a></header>
    {entries.length===0?<div className="emptyState"><strong>Aucune opération</strong><span>Les achats, ventes et modifications apparaîtront ici.</span></div>:<div className="historyList">{entries.map(entry=><article className="historyEntry" key={entry.id}>
      <span className={`historyIcon history-${entry.action.toLowerCase()}`}>{entry.action==="BUY"?"+":entry.action==="SELL"?"−":entry.action==="MODIFIED"?"✎":entry.action==="DELETED"?"×":"€"}</span>
      <div className="historyMain"><div><b>{labels[entry.action]}</b><span>{entry.assetName}</span></div><small>{entry.portfolioName} · opération du {date(entry.occurredOn)}</small></div>
      <div className="historyValues"><span>{entry.quantity!==null&&<>Qté {number(entry.quantity)}</>}</span><span>{entry.unitPrice!==null&&<>à {eur(entry.unitPrice)}</>}</span><b>{eur(entry.amount)}</b></div>
      <time dateTime={entry.recordedAt}>{date(entry.recordedAt,true)}</time>
    </article>)}</div>}
  </section></main>;
}
