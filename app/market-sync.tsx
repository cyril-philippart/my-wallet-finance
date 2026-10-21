"use client";
import {startTransition,useActionState,useEffect,useRef,useState} from "react";
import {isMarketOpen} from "../src/domain/market-hours";
import {syncPricesAction,type SyncPricesState} from "./sync-actions";

const initialState:SyncPricesState={status:"idle"};
const AUTO_SYNC_INTERVAL=15*60*1000;
const MARKET_CHECK_INTERVAL=60*1000;

export function MarketSync({configured}:{configured:boolean}){
  const[state,action,pending]=useActionState(syncPricesAction,initialState);
  const[displayState,setDisplayState]=useState<SyncPricesState>(initialState);
  const running=useRef(false);
  const lastSyncAt=useRef(0);

  useEffect(()=>{
    const saved=window.localStorage.getItem("market-last-sync");
    if(saved)try{const parsed=JSON.parse(saved) as SyncPricesState;setDisplayState(parsed);lastSyncAt.current=parsed.syncedAt?Date.parse(parsed.syncedAt):0;}catch{}
  },[]);

  useEffect(()=>{
    if(state.status==="idle")return;
    setDisplayState(state);
    if(state.status==="success"){lastSyncAt.current=state.syncedAt?Date.parse(state.syncedAt):Date.now();window.localStorage.setItem("market-last-sync",JSON.stringify(state));}
  },[state]);

  useEffect(()=>{
    if(!configured)return;
    const synchronizeIfNeeded=()=>{
      const now=new Date();
      const exchangeOpen=isMarketOpen("INDEXEURO:PX1",now)||isMarketOpen("INDEXNASDAQ:.IXIC",now);
      const stale=Date.now()-lastSyncAt.current>=AUTO_SYNC_INTERVAL;
      if(!exchangeOpen||!stale||document.visibilityState!=="visible"||running.current)return;
      running.current=true;
      const data=new FormData();data.set("source","automatic");
      startTransition(()=>{action(data);});
      window.setTimeout(()=>{running.current=false;},60_000);
    };
    const initialTimer=window.setTimeout(synchronizeIfNeeded,500);
    const timer=window.setInterval(synchronizeIfNeeded,MARKET_CHECK_INTERVAL);
    const onVisibility=()=>{if(document.visibilityState==="visible")synchronizeIfNeeded();};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{window.clearTimeout(initialTimer);window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);};
  },[action,configured]);

  if(!configured)return <div className="marketSync warning"><span className="statusDot"/><div><b>Cours de marché</b><small>Google Sheets reste à configurer</small></div></div>;
  const lastUpdate=displayState.status==="success"&&displayState.updatedAt
    ?`Dernière mise à jour le ${displayState.updatedAt} · ${displayState.source==="automatic"?"Automatique":"Manuelle"}`
    :"Aucune mise à jour enregistrée";
  return <div className={`marketSync ${displayState.status}`}><span className="statusDot"/><div className="marketSyncText"><b>{pending?"Mise à jour en cours…":"Cours de marché"}</b><small>{pending?"Lecture de Google Sheets en cours":displayState.status==="error"?(displayState.message??"La mise à jour a échoué."):lastUpdate}</small></div><form action={action}><input type="hidden" name="source" value="manual"/><button className="syncButton" disabled={pending}><span className={pending?"syncIcon spinning":"syncIcon"}>↻</span>{pending?"Actualisation…":"Actualiser"}</button></form></div>;
}
