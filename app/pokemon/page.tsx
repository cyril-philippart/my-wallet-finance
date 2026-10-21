import {redirect} from "next/navigation";
import {getCurrentUser} from "../../src/server/auth.js";
import {getDashboardData} from "../../src/server/portfolio-queries.js";
import {getPokemonSummary} from "../../src/server/zebradex-provider.js";
import {Sidebar} from "../sidebar";

const eur=(value:string|null)=>value===null?"—":new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value));
const pct=(value:string|null)=>value===null?"—":`${Number(value)>0?"+":""}${new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(Number(value))} %`;
const tone=(value:string|null)=>value===null?"neutral":Number(value)>0?"positive":Number(value)<0?"negative":"";

function Metric({label,percent,amount}:{label:string;percent:string|null;amount:string|null}){
  return <article><span>{label}</span><strong className={tone(percent)}>{pct(percent)}</strong><small className={tone(amount)}>{eur(amount)}</small></article>;
}

export default async function PokemonPage(){
  const user=await getCurrentUser();if(!user)redirect("/login");
  const[data,pokemon]=await Promise.all([getDashboardData(user.id),getPokemonSummary()]);
  return <main className="shell"><Sidebar active="pokemon" portfolios={data.portfolios}/><section className="content portfolioPage portfolioPage-pokemon pokemonPage">
    <header className="portfolioPageHeader"><div><p className="eyebrow">Collection</p><h1>Pokémon</h1></div><a className="backDashboard" href="/"><span aria-hidden="true">←</span> Retour au Dashboard</a></header>
    {!pokemon?<div className="emptyPortfolio"><b>Données ZebraDex indisponibles</b><p>Vérifie l’identifiant de collection ou réessaie dans quelques instants.</p></div>:<>
      <section className="pokemonSummary"><div><span>Objets suivis</span><b>{pokemon.itemsCount??"—"}</b></div><div><span>Données au</span><b>{pokemon.updatedOn?new Intl.DateTimeFormat("fr-FR").format(new Date(`${pokemon.updatedOn}T12:00:00`)):"—"}</b></div><div><span>Source</span><b>ZebraDex</b></div></section>
      <section className="portfolioTotals pokemonMetrics">
        <article><span>Capital investi</span><strong>{eur(pokemon.investedEur)}</strong></article>
        <article><span>Valeur actuelle</span><strong>{eur(pokemon.currentValueEur)}</strong></article>
        <Metric label="Performance du jour" percent={pokemon.dayPercent} amount={pokemon.dayAmountEur}/>
        <Metric label="Performance globale" percent={pokemon.performancePct} amount={pokemon.gainEur}/>
        <Metric label="Performance sur 7 jours" percent={pokemon.sevenDayPercent} amount={pokemon.sevenDayAmountEur}/>
        <Metric label="Performance sur 15 jours" percent={pokemon.fifteenDayPercent} amount={pokemon.fifteenDayAmountEur}/>
      </section>
    </>}
  </section></main>;
}
