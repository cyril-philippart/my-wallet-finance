"use client";

import { useActionState,useState } from "react";
import { saveAvailableCapitalAction,type CapitalState } from "../dashboard-actions";

const initialState:CapitalState={status:"idle"};

export function CapitalEditor({value}:{value:string}){
  const[open,setOpen]=useState(false);
  const[state,action,pending]=useActionState(saveAvailableCapitalAction,initialState);
  return <div className="capitalEditor">
    <button type="button" className="metricEdit" onClick={()=>setOpen(value=>!value)}>{open?"Fermer":"Modifier"}</button>
    {open&&<form action={action} className="capitalForm">
      <label><span>Montant disponible</span><span className="moneyInput"><input name="availableCapital" inputMode="decimal" defaultValue={value} required/><b>€</b></span></label>
      <button disabled={pending}>{pending?"Enregistrement…":"Enregistrer"}</button>
      {state.message&&<small className={state.status}>{state.message}</small>}
    </form>}
  </div>;
}
