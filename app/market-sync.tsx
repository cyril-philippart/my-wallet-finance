"use client";
import {useActionState,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {syncPricesAction,type SyncPricesState} from "./sync-actions";

const idleState:SyncPricesState={status:"idle"};
const DASHBOARD_REFRESH_INTERVAL=5*60*1000;

export function MarketSync({configured,initialState=idleState}:{configured:boolean;initialState?:SyncPricesState}){
  const router=useRouter();
  const[state,action,pending]=useActionState(syncPricesAction,initialState);
  const[displayState,setDisplayState]=useState<SyncPricesState>(initialState);

  useEffect(()=>{if(state.status!=="idle")setDisplayState(state);},[state]);
  useEffect(()=>{setDisplayState(initialState);},[initialState]);
  useEffect(()=>{
    if(!configured)return;
    const refresh=()=>router.refresh();
    const timer=window.setInterval(refresh,DASHBOARD_REFRESH_INTERVAL);
    const onVisibility=()=>{if(document.visibilityState==="visible")refresh();};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisibility);};
  },[configured,router]);

  if(!configured)return <div className="marketSync warning"><span className="statusDot"/><div><b>Cours de marché</b><small>Google Sheets reste à configurer</small></div></div>;
  const lastUpdate=displayState.status==="success"&&displayState.updatedAt
    ?`Dernière mise à jour le ${displayState.updatedAt} · ${displayState.source==="automatic"?"Automatique":"Manuelle"}`
    :"Aucune mise à jour enregistrée";
  return <div className={`marketSync ${displayState.status}`}><span className="statusDot"/><div className="marketSyncText"><b>{pending?"Mise à jour en cours…":"Cours de marché"}</b><small>{pending?"Lecture de Google Sheets en cours":displayState.status==="error"?(displayState.message??"La mise à jour a échoué."):lastUpdate}</small></div><form action={action}><input type="hidden" name="source" value="manual"/><button className="syncButton" disabled={pending}><span className={pending?"syncIcon spinning":"syncIcon"}>↻</span>{pending?"Actualisation…":"Actualiser"}</button></form></div>;
}
