"use client";
import {logoutAction} from "./actions";
import type {PortfolioSummary} from "../src/server/portfolio-queries";
import {TransactionForm} from "./transactions/transaction-form";

const groups=[
  ["actions","Actions"],["etf","ETF"],["crypto","Crypto"],["scpi","SCPI"],["assurance-vie","Assurance-vie"],
] as const;

const DashboardIcon=()=> <svg className="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 17.5a8.7 8.7 0 1 1 15.6 0"/><path d="M12 3.3v3M5.9 6l2.1 2.1M18.1 6 16 8.1M3.3 12h3M17.7 12h3M12 12l-3.1-3.1"/><path className="iconFill" d="M8.2 18.1h7.6v2.2H8.2z"/></svg>;
const WalletIcon=()=> <svg className="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.2 7.2h14.9a2 2 0 0 1 2 2v9.1a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2z"/><path d="m5.4 7.1 4-3.7 3 3.7 2.4-2.2 2.8 2.3M17.1 11.3h4v4.2h-4a2.1 2.1 0 1 1 0-4.2Z"/></svg>;
const DividendIcon=()=> <svg className="navSvg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M14.8 8.8c-.7-.6-1.6-.9-2.7-.9-1.5 0-2.6.7-2.6 1.8 0 2.8 5.2 1.1 5.2 4 0 1.2-1.1 2-2.8 2-1.2 0-2.2-.4-3-1.1M12 6.4v11.2"/></svg>;
const MilanIcon=()=> <svg className="navSvg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.8 19.5c.5-3.4 2.7-5.3 6.2-5.3s5.7 1.9 6.2 5.3"/></svg>;
const HistoryIcon=()=> <svg className="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7.5V3.8M4.5 7.5h3.7M4.8 7.2A8.5 8.5 0 1 1 3.7 14"/><path d="M12 7.5V12l3 1.8"/></svg>;
const PokemonIcon=()=> <svg className="navSvg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M9.2 12a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 0 0-5.6 0Z"/></svg>;

export function Sidebar({active="dashboard",portfolios=[]}:{active?:string;portfolios?:PortfolioSummary[]}){
  return <aside className="sidebar">
    <div className="brand"><span className="brandMark">W</span><span>My Wallet</span></div>
    <div className="sidebarTransaction"><TransactionForm portfolios={portfolios}/></div>
    <nav aria-label="Navigation principale">
      <a className={`navItem ${active==="dashboard"?"active":""}`} href="/"><DashboardIcon/>Dashboard</a>
      <div className="portfolioNav">
        <a className={`navItem ${groups.some(([slug])=>slug===active)?"active":""}`} href="/portefeuilles/actions"><WalletIcon/>Portefeuilles <span className="navChevron" aria-hidden="true">›</span></a>
        <div className="portfolioSubmenu">{groups.map(([slug,label])=><a className={`portfolioLink portfolioLink-${slug} ${active===slug?"active":""}`} href={`/portefeuilles/${slug}`} key={slug}>{label}</a>)}</div>
      </div>
      <a className={`navItem dividendNav ${active==="dividendes"?"active":""}`} href="/dividendes"><DividendIcon/>Dividendes</a>
      <a className={`navItem pokemonNav ${active==="pokemon"?"active":""}`} href="/pokemon"><PokemonIcon/>Pokémon</a>
      <div className="navSeparator"/>
      <a className={`navItem milanNav ${active==="milan"?"active":""}`} href="/milan"><MilanIcon/>Milàn</a>
      <a className={`navItem historyNav ${active==="historique"?"active":""}`} href="/historique"><HistoryIcon/>Historique</a>
    </nav>
    <div className="sideBottom"><div className="profile"><span className="avatar">C</span><span><b>Cyril</b><small>Compte privé</small></span></div><form action={logoutAction}><button className="logoutButton">Se déconnecter</button></form></div>
  </aside>;
}
