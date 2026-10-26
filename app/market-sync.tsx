"use client";
import {useActionState,useEffect,useState} from "react";
import {syncPricesAction,type SyncPricesState} from "./sync-actions";

const idleState:SyncPricesState={status:"idle"};

export function MarketSync({configured,initialState=idleState}:{configured:boolean;initialState?:SyncPricesState}){
  const[state,action,pending]=useActionState(syncPricesAction,initialState);
  const[displayState,setDisplayState]=useState<SyncPricesState>(initialState);

  useEffect(()=>{if(state.status!=="idle")setDisplayState(state);},[state]);

  if(!configured)return <div className="marketSync warning"><span className="statusDot"/><div><b>Cours de marché</b><small>Google Sheets reste à configurer</small></div></div>;
  const lastUpdate=displayState.status==="success"&&displayState.updatedAt
    ?`Dernière mise à jour le ${displayState.updatedAt} · ${displayState.source==="automatic"?"Automatique":"Manuelle"}`
    :"Aucune mise à jour enregistrée";
  return <div className={`marketSync ${displayState.status}`}><span className="statusDot"/><div className="marketSyncText"><b>{pending?"Mise à jour en cours…":"Cours de marché"}</b><small>{pending?"Lecture de Google Sheets en cours":displayState.status==="error"?(displayState.message??"La mise à jour a échoué."):lastUpdate}</small></div><form action={action}><input type="hidden" name="source" value="manual"/><button className="syncButton" disabled={pending}><span className={pending?"syncIcon spinning":"syncIcon"}>↻</span>{pending?"Actualisation…":"Actualiser"}</button></form></div>;
}
