import {redirect} from "next/navigation";
import {getCurrentUser} from "../../src/server/auth.js";
import {getDashboardData} from "../../src/server/portfolio-queries.js";
import {getPokemonTradingData} from "../../src/server/pokemon-resale-queries.js";
import {Sidebar} from "../sidebar";
import {ResaleAnalytics} from "./resale-analytics";
import {ResaleManager} from "./resale-manager";

const eur=(value:string)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value));
const pct=(value:number)=>new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1}).format(value);

export default async function PokemonResalePage(){
  const user=await getCurrentUser();
  if(!user)redirect("/login");
  const[data,trading]=await Promise.all([getDashboardData(user.id),getPokemonTradingData(user.id)]);
  const revenue=Number(trading.revenueEur),profit=Number(trading.profitEur),purchases=Number(trading.purchasedTotalEur);
  const margin=revenue?profit/revenue*100:0;
  const recovery=purchases?revenue/purchases*100:0;
  const tone=(number:number)=>number>0?"positive":number<0?"negative":"";

  return <main className="shell">
    <Sidebar active="revente-pokemon" portfolios={data.portfolios}/>
    <section className="content portfolioPage portfolioPage-pokemon pokemonResalePage">
      <header className="portfolioPageHeader"><div><p className="eyebrow">Activité Pokémon</p><h1>Achat-revente</h1></div><a className="backDashboard" href="/"><span aria-hidden="true">←</span> Retour au Dashboard</a></header>
      <section className="portfolioTotals resaleTotals resaleFinancialMetrics">
        <article><span>Capital engagé</span><strong>{eur(trading.purchasedTotalEur)}</strong><small>Total consacré aux achats</small></article>
        <article><span>Valeur du stock</span><strong>{eur(trading.stockValueEur)}</strong><small>Valorisation au coût d’achat</small></article>
        <article><span>Chiffre d’affaires</span><strong>{eur(trading.revenueEur)}</strong><small>{trading.sales.length} vente{trading.sales.length>1?"s":""} enregistrée{trading.sales.length>1?"s":""}</small></article>
        <article><span>Bénéfice réalisé</span><strong className={tone(profit)}>{eur(trading.profitEur)}</strong><small>Après coût des produits vendus</small></article>
        <article><span>Marge moyenne</span><strong className={tone(margin)}>{pct(margin)} %</strong><small>Sur le chiffre d’affaires</small></article>
        <article><span>Capital récupéré</span><strong>{pct(recovery)} %</strong><small>{eur(trading.revenueEur)} encaissé</small></article>
      </section>
      <ResaleAnalytics data={trading}/>
      <ResaleManager data={trading}/>
    </section>
  </main>;
}
