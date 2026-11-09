import type {PokemonTradingData} from "../../src/server/pokemon-resale-queries";

const money=new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:2});
const number=new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2});
const percent=new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1});
const monthLabel=new Intl.DateTimeFormat("fr-FR",{month:"short"});
const value=(input:string)=>Number(input)||0;

export function ResaleAnalytics({data}:{data:PokemonTradingData}){
  const purchaseLots=data.purchases.flatMap(product=>product.lots.map(lot=>({...lot,productName:product.productName})));
  const purchasedUnits=purchaseLots.reduce((sum,lot)=>sum+value(lot.quantity),0);
  const soldUnits=purchaseLots.reduce((sum,lot)=>sum+value(lot.soldQuantity),0);
  const stockUnits=purchaseLots.reduce((sum,lot)=>sum+value(lot.remainingQuantity),0);
  const revenue=value(data.revenueEur),profit=value(data.profitEur);
  const averageSale=data.sales.length?revenue/data.sales.length:0;
  const averageProfit=data.sales.length?profit/data.sales.length:0;
  const now=new Date();
  const remainingLots=purchaseLots.filter(lot=>value(lot.remainingQuantity)>0);
  const totalAgeWeight=remainingLots.reduce((sum,lot)=>sum+Math.max(0,(now.getTime()-new Date(`${lot.purchasedOn}T12:00:00`).getTime())/86_400_000)*value(lot.remainingQuantity),0);
  const averageStockAge=stockUnits?Math.round(totalAgeWeight/stockUnits):0;
  const months=Array.from({length:12},(_,index)=>{
    const date=new Date(now.getFullYear(),now.getMonth()-11+index,1);
    const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
    const purchases=purchaseLots.filter(lot=>lot.purchasedOn.startsWith(key)).reduce((sum,lot)=>sum+value(lot.quantity)*value(lot.unitCostEur),0);
    const sales=data.sales.filter(sale=>sale.soldOn.startsWith(key));
    return{key,label:monthLabel.format(date).replace(".",""),purchases,revenue:sales.reduce((sum,sale)=>sum+value(sale.saleTotalEur),0),profit:sales.reduce((sum,sale)=>sum+value(sale.profitEur),0)};
  });
  const chartMax=Math.max(1,...months.flatMap(month=>[month.purchases,month.revenue,Math.abs(month.profit)]));
  const stock=data.purchases.map(product=>({name:product.productName,seriesName:product.seriesName,quantity:value(product.remainingQuantity)})).filter(product=>product.quantity>0).sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,"fr"));
  const stockTotal=stock.reduce((sum,product)=>sum+product.quantity,0);

  return <section className="resaleAnalytics">
    <div className="resaleOperationalMetrics">
      <article><span>Unités achetées</span><strong>{number.format(purchasedUnits)}</strong></article>
      <article><span>Unités vendues</span><strong>{number.format(soldUnits)}</strong></article>
      <article><span>Unités en stock</span><strong>{number.format(stockUnits)}</strong></article>
      <article><span>Ventes réalisées</span><strong>{data.sales.length}</strong></article>
      <article><span>Vente moyenne</span><strong>{money.format(averageSale)}</strong></article>
      <article><span>Gain moyen / vente</span><strong className={averageProfit<0?"negative":averageProfit>0?"positive":""}>{money.format(averageProfit)}</strong></article>
      <article><span>Âge moyen du stock</span><strong>{averageStockAge} j</strong></article>
    </div>
    <div className="resaleInsightsGrid">
      <article className="resaleChartCard">
        <header><div><p className="eyebrow">Activité sur 12 mois</p><h2>Achats, ventes et bénéfices</h2></div><div className="resaleChartLegend"><span className="purchases">Achats</span><span className="sales">Ventes</span><span className="profits">Bénéfices</span></div></header>
        <div className="resaleMonthlyChart">{months.map(month=><div className="resaleMonth" key={month.key} title={`${month.label} — Achats : ${money.format(month.purchases)} · Ventes : ${money.format(month.revenue)} · Bénéfice : ${money.format(month.profit)}`}><div className="resaleBars"><i className="purchases" style={{height:`${month.purchases/chartMax*100}%`}}/><i className="sales" style={{height:`${month.revenue/chartMax*100}%`}}/><i className={`profits${month.profit<0?" negative":""}`} style={{height:`${Math.abs(month.profit)/chartMax*100}%`}}/></div><b>{month.label}</b></div>)}</div>
      </article>
      <article className="resaleStockCard">
        <header><div><p className="eyebrow">Inventaire</p><h2>Répartition du stock</h2></div></header>
        <div className="resaleStockList">{stock.length?stock.map(product=>{const share=stockTotal?product.quantity/stockTotal*100:0;return <div key={`${product.seriesName}-${product.name}`}><span><b title={product.name}>{product.name}</b><small>{product.seriesName}</small></span><span><b>{number.format(product.quantity)} en stock</b><small>{percent.format(share)} %</small></span><i><em style={{width:`${share}%`}}/></i></div>}):<p>Aucun produit actuellement en stock.</p>}</div>
      </article>
    </div>
  </section>;
}
