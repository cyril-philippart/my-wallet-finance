"use client";

import {useActionState,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {portfolioHistory} from "../../src/data/portfolio-history";
import type {StoredWealthPoint} from "../../src/server/wealth-history";
import type {WealthEvent} from "../../src/server/wealth-events";
import {createWealthEventAction,type EventState} from "./event-actions";

const money=(value:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value);
const fullDate=(value:string)=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(new Date(`${value}T12:00:00`));

const initialEventState:EventState={status:"idle"};
const eventLabels={MARKET:"Marché",NEWS:"Actualité",POKEMON:"Pokémon",NOTE:"Note personnelle"};

export function PortfolioHistoryChart({liveHistory,currentPoint,events}:{liveHistory:StoredWealthPoint[];currentPoint:StoredWealthPoint|null;events:WealthEvent[]}){
  const router=useRouter();
  const history=[...new Map([...portfolioHistory,...liveHistory,...(currentPoint?[currentPoint]:[])].map(point=>[point.date,point])).values()].sort((left,right)=>left.date.localeCompare(right.date));
  const[active,setActive]=useState(history.length-1);
  const[modalOpen,setModalOpen]=useState(false);
  const[editingEvent,setEditingEvent]=useState<WealthEvent|null>(null);
  const[pinnedEventId,setPinnedEventId]=useState<string|null>(null);
  const[eventState,eventAction,eventPending]=useActionState(createWealthEventAction,initialEventState);
  useEffect(()=>{if(eventState.status==="success"){setModalOpen(false);router.refresh();}},[eventState,router]);
  useEffect(()=>{if(!pinnedEventId)return;const closePinned=(event:PointerEvent)=>{if(event.target instanceof Element&&event.target.closest(`[data-event-marker="${pinnedEventId}"]`))return;setPinnedEventId(null);};document.addEventListener("pointerdown",closePinned);return()=>document.removeEventListener("pointerdown",closePinned);},[pinnedEventId]);
  if(history.length<2)return null;
  const width=1000,height=300,padX=62,padTop=30,padBottom=42;
  const values=history.flatMap(point=>[point.value,point.withoutPokemon]);
  const minimum=Math.floor((Math.min(...values)-150)/500)*500;
  const maximum=Math.ceil((Math.max(...values)+150)/500)*500;
  const x=(index:number)=>padX+index/(history.length-1)*(width-padX*2);
  const y=(value:number)=>padTop+(maximum-value)/(maximum-minimum)*(height-padTop-padBottom);
  const path=history.map((point,index)=>`${index===0?"M":"L"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  const pathWithoutPokemon=history.map((point,index)=>`${index===0?"M":"L"}${x(index).toFixed(2)},${y(point.withoutPokemon).toFixed(2)}`).join(" ");
  const selected=history[active]!;
  const first=history[0]!;
  const change=selected.value-first.value;
  const ticks=Array.from({length:5},(_,index)=>minimum+(maximum-minimum)*index/4);
  const monthTicks=history.map((point,index)=>({point,index})).filter(({point,index})=>index===0||point.date.slice(0,7)!==history[index-1]?.date.slice(0,7));
  const selectFromPointer=(event:React.PointerEvent<SVGSVGElement>)=>{const bounds=event.currentTarget.getBoundingClientRect();const relative=(event.clientX-bounds.left)/bounds.width;setActive(Math.max(0,Math.min(history.length-1,Math.round((relative*width-padX)/(width-padX*2)*(history.length-1)))));};
  return <section className="historyChartPanel"><header><div><p className="eyebrow">Historique quotidien</p><h2>Évolution du portefeuille</h2></div><div className="historyChartHeaderActions"><div className="historyChartValue"><span>{fullDate(selected.date)}</span><small className={change>=0?"positive":"negative"}>{change>=0?"+":""}{money(change)} · évolution hors versements</small></div><button className="addChartEvent" type="button" onClick={()=>{setEditingEvent(null);setModalOpen(true)}}>+ Ajouter un événement</button></div></header><div className="historyChartLegend"><span><i className="historyLegendPokemon"/>Avec Pokémon <b>{money(selected.value)}</b></span><span><i className="historyLegendWithout"/>Sans Pokémon <b>{money(selected.withoutPokemon)}</b></span></div><div className="historyChartCanvas"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbes quotidiennes de l'évolution du portefeuille avec et sans Pokémon" onPointerMove={selectFromPointer} onPointerDown={selectFromPointer}>
    <defs><linearGradient id="historyArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff715b" stopOpacity=".27"/><stop offset="1" stopColor="#ff715b" stopOpacity=".02"/></linearGradient></defs>
    {ticks.map(tick=><g key={tick}><line className="historyGridLine" x1={padX} x2={width-padX} y1={y(tick)} y2={y(tick)}/><text className="historyAxisValue" x={padX-10} y={y(tick)+4}>{money(tick)}</text></g>)}
    <path className="historyArea" d={`${path} L${x(history.length-1)},${height-padBottom} L${x(0)},${height-padBottom} Z`}/><path className="historyLine historyLinePokemon" d={path}/><path className="historyLine historyLineWithout" d={pathWithoutPokemon}/>
    <line className="historyCursor" x1={x(active)} x2={x(active)} y1={padTop} y2={height-padBottom}/><circle className="historyPoint historyPointPokemon" cx={x(active)} cy={y(selected.value)} r="5"/><circle className="historyPoint historyPointWithout" cx={x(active)} cy={y(selected.withoutPokemon)} r="5"/>
    {events.map(item=>{const index=history.findIndex(point=>point.date===item.date);if(index<0)return null;const markerX=x(index);const markerY=y(history[index]!.value);const tooltipX=Math.min(width-312,Math.max(padX,markerX-140));const tooltipY=Math.max(8,markerY-144);const pinned=pinnedEventId===item.id;const descriptionLines=item.description?.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)??[];return <g data-event-marker={item.id} className={`chartEventMarker event-${item.type.toLowerCase()}${pinned?" is-pinned":""}`} key={item.id} onMouseLeave={()=>setPinnedEventId(current=>current===item.id?null:current)} onClick={()=>setPinnedEventId(current=>current===item.id?null:item.id)}><line x1={markerX} x2={markerX} y1={markerY+4} y2={height-padBottom}/><circle cx={markerX} cy={markerY} r="3.8"/><foreignObject className="chartEventTooltip" x={tooltipX} y={tooltipY} width="300" height="134"><div><small>{eventLabels[item.type]} · {fullDate(item.date)}</small><strong>{item.title}</strong>{descriptionLines.length>0&&<ul>{descriptionLines.map((line,lineIndex)=><li key={`${item.id}-${lineIndex}`}>{line}</li>)}</ul>}<button type="button" title="Modifier l’événement" aria-label="Modifier l’événement" onClick={event=>{event.stopPropagation();setEditingEvent(item);setModalOpen(true)}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Zm12.2-16.2 4 4 1.1-1.1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1.1 1.1Z"/></svg></button></div></foreignObject></g>})}
    {monthTicks.map(({point,index})=><text className="historyMonth" key={point.date} x={x(index)} y={height-13} textAnchor={index===0?"start":"middle"}>{new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(new Date(`${point.date}T12:00:00`))}</text>)}
  </svg></div>{modalOpen&&<div className="chartEventOverlay" onMouseDown={event=>{if(event.target===event.currentTarget&&!eventPending)setModalOpen(false)}}><form key={editingEvent?.id??"new"} className="chartEventModal" action={eventAction}><input name="id" type="hidden" value={editingEvent?.id??""}/><header><div><p className="eyebrow">Annotation</p><h3>{editingEvent?"Modifier l’événement":"Ajouter un événement"}</h3></div><button type="button" disabled={eventPending} onClick={()=>setModalOpen(false)}>×</button></header><label>Date<input name="date" type="date" required defaultValue={editingEvent?.date??selected.date}/></label><label>Type<select name="type" defaultValue={editingEvent?.type??"MARKET"}><option value="MARKET">Marché</option><option value="NEWS">Actualité</option><option value="POKEMON">Pokémon</option><option value="NOTE">Note personnelle</option></select></label><label className="eventTitleField">Titre<input name="title" maxLength={120} required defaultValue={editingEvent?.title??""} placeholder="Ex. Forte baisse du Bitcoin"/></label><label className="eventDescriptionField">Description facultative<textarea name="description" maxLength={500} rows={3} defaultValue={editingEvent?.description??""} placeholder="Ajoute quelques éléments de contexte…"/></label>{eventState.status==="error"&&<p className="formError">{eventState.message}</p>}<footer><button type="button" disabled={eventPending} onClick={()=>setModalOpen(false)}>Annuler</button><button className="primaryButton" disabled={eventPending}>{eventPending?"Enregistrement…":editingEvent?"Modifier":"Enregistrer"}</button></footer></form></div>}</section>;
}
